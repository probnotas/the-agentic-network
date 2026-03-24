import { NextResponse } from "next/server";
import { createClient as createServerUserClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { isGuardianTopicKey, normalizeGuardianApiKey, TAN_AGENT_USERNAMES } from "@/lib/guardian-api";
import { runAllTopicsParallel, runSingleTopic } from "@/lib/tan-news-runner";
import { ADMIN_OWNER_EMAIL } from "@/lib/admin-config";
import type { GuardianTopicKey } from "@/lib/guardian-api";

export const dynamic = "force-dynamic";

type Body = {
  topic?: string;
  agentProfileId?: string;
  postAll?: boolean;
};

async function isAuthorized(req: Request): Promise<boolean> {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  if (secret && auth === `Bearer ${secret}`) {
    console.log("[TAN/fetch-and-post] authorized via CRON_SECRET");
    return true;
  }
  try {
    const supabase = await createServerUserClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user?.email && user.email.toLowerCase() === ADMIN_OWNER_EMAIL.toLowerCase()) {
      console.log("[TAN/fetch-and-post] authorized via admin session", user.email);
      return true;
    }
  } catch (e) {
    console.error("[TAN/fetch-and-post] session check failed", e);
    return false;
  }
  return false;
}

async function resolveProfileIdForTopic(
  admin: ReturnType<typeof createServiceRoleClient>,
  topic: GuardianTopicKey,
  explicitId?: string
): Promise<{ ok: true; profileId: string } | { ok: false; error: string }> {
  if (explicitId) {
    const { data: row, error } = await admin
      .from("profiles")
      .select("id, username")
      .eq("id", explicitId)
      .maybeSingle();
    if (error || !row) {
      return { ok: false, error: "agentProfileId not found" };
    }
    if (row.username !== topic) {
      return { ok: false, error: "agentProfileId does not match topic username" };
    }
    return { ok: true, profileId: row.id };
  }

  const { data: row, error } = await admin
    .from("profiles")
    .select("id")
    .eq("username", topic)
    .eq("account_type", "agent")
    .maybeSingle();
  if (error) {
    return { ok: false, error: `Profile query failed: ${error.message}` };
  }
  if (!row) {
    return {
      ok: false,
      error: `No agent profile found for username "${topic}". Create auth user + profile first.`,
    };
  }
  return { ok: true, profileId: row.id };
}

export async function POST(req: Request) {
  console.log("[TAN/fetch-and-post] POST start");

  if (!(await isAuthorized(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rawKey = process.env.GUARDIAN_API_KEY;
  const guardianKey = normalizeGuardianApiKey(rawKey);
  if (!guardianKey) {
    console.error("[TAN/fetch-and-post] GUARDIAN_API_KEY missing or whitespace-only");
    return NextResponse.json(
      {
        error: "GUARDIAN_API_KEY is not configured or is empty after trim",
        diagnostics: { guardianKeyConfigured: false },
      },
      { status: 503 }
    );
  }
  console.log("[TAN/fetch-and-post] GUARDIAN_API_KEY present length=", guardianKey.length);

  let admin: ReturnType<typeof createServiceRoleClient>;
  try {
    admin = createServiceRoleClient();
    console.log("[TAN/fetch-and-post] service role client OK");
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Service client error";
    console.error("[TAN/fetch-and-post] service role client FAILED", msg);
    return NextResponse.json({ error: msg, diagnostics: { serviceClient: false } }, { status: 503 });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch (e) {
    console.error("[TAN/fetch-and-post] invalid JSON", e);
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (body.postAll === true) {
    console.log("[TAN/fetch-and-post] postAll=true");
    try {
      const { posted, skipped, results } = await runAllTopicsParallel(guardianKey);
      return NextResponse.json({ posted, skipped, results });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error("[TAN/fetch-and-post] postAll failed", msg);
      return NextResponse.json({ error: msg, posted: 0, skipped: 0 }, { status: 500 });
    }
  }

  const topicRaw = body.topic;
  if (!topicRaw || !isGuardianTopicKey(topicRaw)) {
    return NextResponse.json(
      { error: `Invalid topic. Use one of: ${TAN_AGENT_USERNAMES.join(", ")}` },
      { status: 400 }
    );
  }

  const resolved = await resolveProfileIdForTopic(admin, topicRaw, body.agentProfileId);
  if (!resolved.ok) {
    console.warn("[TAN/fetch-and-post] profile resolve failed", resolved.error);
    return NextResponse.json(
      { error: resolved.error, topic: topicRaw, posted: 0, skipped: 0 },
      { status: 400 }
    );
  }

  const r = await runSingleTopic(admin, topicRaw, guardianKey, resolved.profileId);
  console.log("[TAN/fetch-and-post] single topic done", topicRaw, r);

  return NextResponse.json({
    topic: topicRaw,
    posted: r.posted,
    skipped: r.skipped,
    error: r.error,
    detail: r.detail,
    diagnostics: r.diagnostics,
  });
}
