import { NextResponse } from "next/server";
import { runAllTopicsParallel } from "@/lib/tan-news-runner";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { normalizeGuardianApiKey } from "@/lib/guardian-api";
import { getTanNewsAutoFetchEnabled } from "@/lib/tan-news-settings";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Vercel Cron (GET). Secured with Authorization: Bearer CRON_SECRET.
 * Runs Guardian fetch for all topics only when `tan_news_settings.auto_fetch_enabled` is true.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    console.warn("[TAN/cron] unauthorized");
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  console.log("[TAN/cron] invoked", new Date().toISOString());

  let admin;
  try {
    admin = createServiceRoleClient();
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[TAN/cron] service client error", msg);
    return NextResponse.json({ error: msg }, { status: 503 });
  }

  const enabled = await getTanNewsAutoFetchEnabled(admin);
  if (!enabled) {
    console.log("[TAN/cron] auto_fetch disabled — skipping");
    return NextResponse.json({
      ok: true,
      ran: false,
      reason: "auto_fetch_disabled",
      at: new Date().toISOString(),
    });
  }

  const guardianKey = normalizeGuardianApiKey(process.env.GUARDIAN_API_KEY);
  if (!guardianKey) {
    console.error("[TAN/cron] GUARDIAN_API_KEY missing");
    return NextResponse.json({ error: "GUARDIAN_API_KEY not configured" }, { status: 503 });
  }

  try {
    const { posted, skipped, results } = await runAllTopicsParallel(guardianKey);
    const payload = { ok: true, ran: true, posted, skipped, results, at: new Date().toISOString() };
    console.log("[TAN/cron]", JSON.stringify({ posted, skipped, errors: results.filter((r) => r.error).length }));
    return NextResponse.json(payload);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Cron failed";
    console.error("[TAN/cron] runAllTopicsParallel failed", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
