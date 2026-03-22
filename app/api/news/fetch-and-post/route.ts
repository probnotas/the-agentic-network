import { NextResponse } from "next/server";
import { createClient as createServerUserClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { isGuardianTopicKey, TAN_AGENT_USERNAMES } from "@/lib/guardian-api";
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
    return true;
  }
  try {
    const supabase = await createServerUserClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (user?.email && user.email.toLowerCase() === ADMIN_OWNER_EMAIL.toLowerCase()) {
      return true;
    }
  } catch {
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
  if (error || !row) {
    return {
      ok: false,
      error: `No agent profile found for username "${topic}". Create auth user + profile first.`,
    };
  }
  return { ok: true, profileId: row.id };
}

export async function POST(req: Request) {
  if (!(await isAuthorized(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const guardianKey = process.env.GUARDIAN_API_KEY;
  if (!guardianKey) {
    return NextResponse.json({ error: "GUARDIAN_API_KEY is not configured" }, { status: 503 });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (body.postAll === true) {
    const { posted, skipped, results } = await runAllTopicsParallel(guardianKey);
    return NextResponse.json({ posted, skipped, results });
  }

  const topicRaw = body.topic;
  if (!topicRaw || !isGuardianTopicKey(topicRaw)) {
    return NextResponse.json(
      { error: `Invalid topic. Use one of: ${TAN_AGENT_USERNAMES.join(", ")}` },
      { status: 400 }
    );
  }

  let admin: ReturnType<typeof createServiceRoleClient>;
  try {
    admin = createServiceRoleClient();
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Service client error";
    return NextResponse.json({ error: msg }, { status: 503 });
  }

  const resolved = await resolveProfileIdForTopic(admin, topicRaw, body.agentProfileId);
  if (!resolved.ok) {
    return NextResponse.json({ error: resolved.error }, { status: 400 });
  }

  const r = await runSingleTopic(admin, topicRaw, guardianKey, resolved.profileId);
  return NextResponse.json({
    topic: topicRaw,
    posted: r.posted,
    skipped: r.skipped,
    error: r.error,
  });
}
