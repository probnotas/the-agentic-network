import { createServiceRoleClient } from "@/lib/supabase/service";
import {
  fetchGuardianArticles,
  TOPIC_TO_NEWS_CATEGORY,
  TAN_AGENT_USERNAMES,
  type GuardianTopicKey,
} from "@/lib/guardian-api";

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

export type TopicRunResult = {
  topic: GuardianTopicKey;
  posted: number;
  skipped: number;
  error?: string;
};

export async function runSingleTopic(
  admin: ReturnType<typeof createServiceRoleClient>,
  topic: GuardianTopicKey,
  guardianKey: string,
  profileId?: string
): Promise<{ posted: number; skipped: number; error?: string }> {
  const resolved = profileId
    ? { ok: true as const, profileId }
    : await resolveProfileIdForTopic(admin, topic, undefined);
  if (!resolved.ok) {
    return { posted: 0, skipped: 0, error: resolved.error };
  }

  let articles;
  try {
    articles = await fetchGuardianArticles(topic, guardianKey);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Guardian fetch failed";
    return { posted: 0, skipped: 0, error: msg };
  }

  const category = TOPIC_TO_NEWS_CATEGORY[topic];

  let posted = 0;
  let skipped = 0;

  for (const article of articles) {
    const gid = article.id;
    if (!gid) continue;

    const { data: existing } = await admin
      .from("news_posts")
      .select("id")
      .eq("guardian_article_id", gid)
      .maybeSingle();
    if (existing) {
      skipped += 1;
      continue;
    }

    const fields = article.fields ?? {};
    let fallbackTitle = "Untitled";
    try {
      const seg = new URL(article.webUrl).pathname.split("/").filter(Boolean).pop();
      if (seg) fallbackTitle = decodeURIComponent(seg.replace(/-/g, " "));
    } catch {
      /* ignore */
    }
    const title = (fields.headline && fields.headline.trim()) || fallbackTitle;
    const summary = fields.trailText?.trim() || null;
    const rawThumb = fields.thumbnail?.trim();
    const thumbnail = rawThumb
      ? rawThumb.startsWith("http")
        ? rawThumb
        : `https:${rawThumb}`
      : null;

    const { error: insErr } = await admin.from("news_posts").insert({
      guardian_article_id: gid,
      title,
      summary,
      thumbnail_url: thumbnail,
      source_url: article.webUrl,
      category,
      posted_by: resolved.profileId,
    });

    if (insErr) {
      if (insErr.code === "23505") {
        skipped += 1;
        continue;
      }
      return { posted, skipped, error: insErr.message };
    }
    posted += 1;
  }

  return { posted, skipped };
}

export async function runAllTopicsParallel(guardianKey: string): Promise<{
  posted: number;
  skipped: number;
  results: TopicRunResult[];
}> {
  const admin = createServiceRoleClient();
  const results = await Promise.all(
    TAN_AGENT_USERNAMES.map(async (topic) => {
      const r = await runSingleTopic(admin, topic, guardianKey, undefined);
      return {
        topic,
        posted: r.posted,
        skipped: r.skipped,
        error: r.error,
      } satisfies TopicRunResult;
    })
  );
  const posted = results.reduce((a, b) => a + b.posted, 0);
  const skipped = results.reduce((a, b) => a + b.skipped, 0);
  return { posted, skipped, results };
}
