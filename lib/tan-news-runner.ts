import { createServiceRoleClient } from "@/lib/supabase/service";
import {
  fetchGuardianArticles,
  TOPIC_TO_NEWS_CATEGORY,
  TAN_AGENT_USERNAMES,
  type GuardianArticleResult,
  type GuardianFetchDiagnostics,
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
    if (error) {
      console.error(`[TAN/profile] explicit id lookup error topic=${topic}`, error.message);
      return { ok: false, error: `Profile query failed: ${error.message}` };
    }
    if (!row) {
      return { ok: false, error: "agentProfileId not found" };
    }
    if (row.username !== topic) {
      return { ok: false, error: "agentProfileId does not match topic username" };
    }
    console.log(`[TAN/profile] resolved topic=${topic} via explicit id`);
    return { ok: true, profileId: row.id };
  }

  const { data: row, error } = await admin
    .from("profiles")
    .select("id, username, account_type")
    .eq("username", topic)
    .maybeSingle();

  if (error) {
    console.error(`[TAN/profile] username lookup error topic=${topic}`, error.message);
    return { ok: false, error: `Profile query failed: ${error.message}` };
  }
  if (!row) {
    console.warn(`[TAN/profile] no row for username=${topic}`);
    return {
      ok: false,
      error: `No profile found for username "${topic}". Create auth user + profile first.`,
    };
  }
  if (row.account_type !== "agent") {
    console.warn(
      `[TAN/profile] username=${topic} account_type=${row.account_type} expected agent — trying insert anyway if you fix DB`
    );
    return {
      ok: false,
      error: `Profile "${topic}" has account_type="${row.account_type}" (expected "agent").`,
    };
  }
  console.log(`[TAN/profile] resolved topic=${topic} profileId=${row.id}`);
  return { ok: true, profileId: row.id };
}

function resolveArticleSourceUrl(article: GuardianArticleResult): string {
  const w = article.webUrl?.trim();
  if (w) return w;
  if (article.id) {
    return `https://www.theguardian.com/${article.id}`;
  }
  throw new Error("Guardian result missing webUrl and id");
}

export type TopicRunResult = {
  topic: GuardianTopicKey;
  posted: number;
  skipped: number;
  error?: string;
  detail?: string;
  diagnostics?: {
    guardian?: GuardianFetchDiagnostics;
    profileResolved?: boolean;
    articleCount?: number;
    skippedNoId?: number;
  };
};

export async function runSingleTopic(
  admin: ReturnType<typeof createServiceRoleClient>,
  topic: GuardianTopicKey,
  guardianKey: string,
  profileId?: string
): Promise<{
  posted: number;
  skipped: number;
  error?: string;
  detail?: string;
  diagnostics?: TopicRunResult["diagnostics"];
}> {
  const resolved = profileId
    ? { ok: true as const, profileId }
    : await resolveProfileIdForTopic(admin, topic, undefined);
  if (!resolved.ok) {
    return {
      posted: 0,
      skipped: 0,
      error: resolved.error,
      detail: "Profile resolution failed",
      diagnostics: { profileResolved: false, articleCount: 0 },
    };
  }

  let articles: GuardianArticleResult[];
  let guardianDiag: GuardianFetchDiagnostics;
  try {
    const out = await fetchGuardianArticles(topic, guardianKey);
    articles = out.articles;
    guardianDiag = out.diagnostics;
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[TAN/run] Guardian fetch failed topic=${topic}`, msg);
    return {
      posted: 0,
      skipped: 0,
      error: msg,
      detail: "Guardian fetch threw",
    };
  }

  if (articles.length === 0) {
    const msg =
      "Guardian returned 0 results for this topic (empty section/tag, rate limit, or filters).";
    console.warn(`[TAN/run] topic=${topic} ${msg}`);
    return {
      posted: 0,
      skipped: 0,
      error: msg,
      detail: "Zero articles",
      diagnostics: {
        guardian: guardianDiag,
        profileResolved: true,
        articleCount: 0,
      },
    };
  }

  const category = TOPIC_TO_NEWS_CATEGORY[topic];
  let posted = 0;
  let skipped = 0;
  let skippedNoId = 0;

  for (const article of articles) {
    const gid = article.id;
    if (!gid) {
      skippedNoId += 1;
      console.warn("[TAN/run] skipping result without id", JSON.stringify(article).slice(0, 200));
      continue;
    }

    const { data: existing, error: exErr } = await admin
      .from("news_posts")
      .select("id")
      .eq("guardian_article_id", gid)
      .maybeSingle();
    if (exErr) {
      console.error(`[TAN/run] duplicate check error gid=${gid}`, exErr.message);
      return {
        posted,
        skipped,
        error: `news_posts select failed: ${exErr.message}`,
        diagnostics: { guardian: guardianDiag, profileResolved: true, articleCount: articles.length },
      };
    }
    if (existing) {
      skipped += 1;
      console.log(`[TAN/run] skip duplicate guardian_article_id=${gid}`);
      continue;
    }

    const fields = article.fields ?? {};
    let sourceUrl: string;
    try {
      sourceUrl = resolveArticleSourceUrl(article);
    } catch (e) {
      const m = e instanceof Error ? e.message : String(e);
      console.error(`[TAN/run] no URL for gid=${gid}`, m);
      skipped += 1;
      continue;
    }

    let fallbackTitle = "Untitled";
    try {
      const seg = new URL(sourceUrl).pathname.split("/").filter(Boolean).pop();
      if (seg) fallbackTitle = decodeURIComponent(seg.replace(/-/g, " "));
    } catch {
      /* ignore */
    }
    const title =
      (fields.headline && fields.headline.trim()) ||
      (article.webTitle && article.webTitle.trim()) ||
      fallbackTitle;
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
      source_url: sourceUrl,
      category,
      posted_by: resolved.profileId,
    });

    if (insErr) {
      console.error(`[TAN/run] insert failed gid=${gid}`, insErr.message, insErr.code, insErr.details);
      if (insErr.code === "23505") {
        skipped += 1;
        continue;
      }
      return {
        posted,
        skipped,
        error: `Insert failed: ${insErr.message} (code ${insErr.code})`,
        detail: insErr.details ?? undefined,
        diagnostics: { guardian: guardianDiag, profileResolved: true, articleCount: articles.length },
      };
    }
    posted += 1;
    console.log(`[TAN/run] inserted gid=${gid} topic=${topic}`);
  }

  return {
    posted,
    skipped,
    diagnostics: {
      guardian: guardianDiag,
      profileResolved: true,
      articleCount: articles.length,
      skippedNoId: skippedNoId > 0 ? skippedNoId : undefined,
    },
  };
}

export async function runAllTopicsParallel(guardianKey: string): Promise<{
  posted: number;
  skipped: number;
  results: TopicRunResult[];
}> {
  console.log("[TAN/runAll] start parallel topics=", TAN_AGENT_USERNAMES.length);
  const admin = createServiceRoleClient();
  const results = await Promise.all(
    TAN_AGENT_USERNAMES.map(async (topic) => {
      const r = await runSingleTopic(admin, topic, guardianKey, undefined);
      return {
        topic,
        posted: r.posted,
        skipped: r.skipped,
        error: r.error,
        detail: r.detail,
        diagnostics: r.diagnostics,
      } satisfies TopicRunResult;
    })
  );
  const posted = results.reduce((a, b) => a + b.posted, 0);
  const skipped = results.reduce((a, b) => a + b.skipped, 0);
  console.log("[TAN/runAll] done posted=", posted, "skipped=", skipped);
  return { posted, skipped, results };
}
