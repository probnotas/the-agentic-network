import { NextResponse } from "next/server";
import { createClient as createServerUserClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { ADMIN_OWNER_EMAIL } from "@/lib/admin-config";
import { getTanNewsSettings, setTanNewsAutoFetchEnabled } from "@/lib/tan-news-settings";
import { normalizeGuardianApiKey } from "@/lib/guardian-api";
import { runAllTopicsParallel } from "@/lib/tan-news-runner";

export const dynamic = "force-dynamic";
/** Seed run on Activate can touch all topics; match cron budget. */
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
  } catch (e) {
    console.error("[TAN/auto-fetch-settings] assertAdmin failed", e);
    return { ok: false, res: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }
}

/** Owner reads current auto-fetch flag (also readable via public RLS; this verifies admin for consistency). */
export async function GET() {
  const gate = await assertAdmin();
  if (!gate.ok) return gate.res;

  try {
    const admin = createServiceRoleClient();
    const snap = await getTanNewsSettings(admin);
    return NextResponse.json({
      enabled: snap.enabled,
      updatedAt: snap.updatedAt,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[TAN/auto-fetch-settings GET]", msg);
    return NextResponse.json({ error: msg, enabled: false, updatedAt: null }, { status: 500 });
  }
}

type Body = { enabled?: boolean };

/** Owner toggles persisted auto-fetch (cron respects this). */
export async function PATCH(req: Request) {
  const gate = await assertAdmin();
  if (!gate.ok) return gate.res;

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (typeof body.enabled !== "boolean") {
    return NextResponse.json({ error: "Body must include boolean `enabled`" }, { status: 400 });
  }

  try {
    const admin = createServiceRoleClient();
    const out = await setTanNewsAutoFetchEnabled(admin, body.enabled);
    if (!out.ok) {
      return NextResponse.json({ error: out.error }, { status: 500 });
    }

    let seedRun:
      | { posted: number; skipped: number }
      | { error: string }
      | undefined;

    if (body.enabled) {
      const guardianKey = normalizeGuardianApiKey(process.env.GUARDIAN_API_KEY);
      if (!guardianKey) {
        const err = "GUARDIAN_API_KEY missing or empty after trim";
        console.error("[TAN/auto-fetch-settings] Activate: " + err);
        seedRun = { error: err };
      } else {
        try {
          console.log("[TAN/auto-fetch-settings] Activate: running initial fetch for all topics");
          const run = await runAllTopicsParallel(guardianKey);
          seedRun = { posted: run.posted, skipped: run.skipped };
          console.log(
            "[TAN/auto-fetch-settings] seed run done",
            JSON.stringify({ posted: run.posted, skipped: run.skipped })
          );
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          console.error("[TAN/auto-fetch-settings] seed run failed", msg);
          seedRun = { error: msg };
        }
      }
    }

    const snap = await getTanNewsSettings(admin);
    return NextResponse.json({
      enabled: snap.enabled,
      updatedAt: snap.updatedAt,
      seedRun,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[TAN/auto-fetch-settings PATCH]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
