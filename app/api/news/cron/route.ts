import { NextResponse } from "next/server";
import { runAllTopicsParallel } from "@/lib/tan-news-runner";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Vercel Cron hits this route on a schedule (GET).
 * Secured with Authorization: Bearer CRON_SECRET (set in Vercel env).
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const guardianKey = process.env.GUARDIAN_API_KEY;
  if (!guardianKey) {
    return NextResponse.json({ error: "GUARDIAN_API_KEY is not configured" }, { status: 503 });
  }

  try {
    const { posted, skipped, results } = await runAllTopicsParallel(guardianKey);
    console.log("[TAN News cron]", JSON.stringify({ posted, skipped, results }));
    return NextResponse.json({
      ok: true,
      posted,
      skipped,
      results,
      at: new Date().toISOString(),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Cron failed";
    console.error("[TAN News cron]", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
