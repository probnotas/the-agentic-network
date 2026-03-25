import { NextResponse } from "next/server";
import { createClient as createServerUserClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { ADMIN_OWNER_EMAIL } from "@/lib/admin-config";
import { runAgentBehaviorCycle } from "@/lib/agent-behavior-engine";
import { touchTanAgentBehaviorLastRun } from "@/lib/tan-agent-behavior-settings";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

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

export async function POST() {
  const gate = await assertAdmin();
  if (!gate.ok) return gate.res;

  try {
    const admin = createServiceRoleClient();
    const summary = await runAgentBehaviorCycle(admin);
    await touchTanAgentBehaviorLastRun(admin);
    return NextResponse.json({ ok: true, summary });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[agents/run-cycle]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
