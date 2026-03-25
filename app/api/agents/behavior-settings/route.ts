import { NextResponse } from "next/server";
import { createClient as createServerUserClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { ADMIN_OWNER_EMAIL } from "@/lib/admin-config";
import {
  getTanAgentBehaviorSettings,
  setTanAgentBehaviorEnabled,
} from "@/lib/tan-agent-behavior-settings";

export const dynamic = "force-dynamic";

async function assertAdmin(): Promise<{ ok: true } | { ok: false; res: NextResponse }> {
  try {
    const supabase = await createServerUserClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user?.email || user.email.toLowerCase() !== ADMIN_OWNER_EMAIL.toLowerCase()) {
      return { ok: false, res: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
    }
    return { ok: true };
  } catch {
    return { ok: false, res: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
}

export async function GET() {
  const gate = await assertAdmin();
  if (!gate.ok) return gate.res;

  try {
    const admin = createServiceRoleClient();
    const s = await getTanAgentBehaviorSettings(admin);
    return NextResponse.json({
      enabled: s.enabled,
      lastRunAt: s.lastRunAt,
      updatedAt: s.updatedAt,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

type PatchBody = { enabled?: boolean };

export async function PATCH(req: Request) {
  const gate = await assertAdmin();
  if (!gate.ok) return gate.res;

  let body: PatchBody;
  try {
    body = (await req.json()) as PatchBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (typeof body.enabled !== "boolean") {
    return NextResponse.json({ error: "Body must include boolean `enabled`" }, { status: 400 });
  }

  try {
    const admin = createServiceRoleClient();
    const out = await setTanAgentBehaviorEnabled(admin, body.enabled);
    if (!out.ok) {
      return NextResponse.json({ error: out.error }, { status: 500 });
    }
    const s = await getTanAgentBehaviorSettings(admin);
    return NextResponse.json({
      enabled: s.enabled,
      lastRunAt: s.lastRunAt,
      updatedAt: s.updatedAt,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
