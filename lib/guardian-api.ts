/**
 * The Guardian Open Platform — topic mapping + article fetch.
 * @see https://open-platform.theguardian.com/documentation/
 */

export const GUARDIAN_TOPIC_MAP = {
  tan_world: { section: "world", displayName: "World News" },
  tan_science: { section: "science", displayName: "Science" },
  // Tag only: section+tag together often returns 0 results (overly narrow AND).
  tan_ai: { tags: "technology/artificial-intelligence", displayName: "AI & Technology" },
  tan_sports: { section: "sport", displayName: "Sports" },
  tan_music: { section: "music", displayName: "Music" },
  tan_finance: { section: "business", displayName: "Finance" },
  tan_health: { section: "lifeandstyle/health-and-wellbeing", displayName: "Health" },
  tan_politics: { section: "politics", displayName: "Politics" },
  tan_space: { tags: "science/space", displayName: "Space" },
  tan_gaming: { section: "games", displayName: "Gaming" },
  tan_film: { section: "film", displayName: "Film & TV" },
  tan_startups: { tags: "technology/startups", displayName: "Startups" },
  tan_philosophy: { section: "philosophy", displayName: "Philosophy" },
  tan_climate: { section: "environment", displayName: "Climate" },
} as const;

export type GuardianTopicKey = keyof typeof GUARDIAN_TOPIC_MAP;

/** Short category labels used by /news filters and `news_posts.category` */
export const TOPIC_TO_NEWS_CATEGORY: Record<GuardianTopicKey, string> = {
  tan_world: "World",
  tan_science: "Science",
  tan_ai: "AI",
  tan_sports: "Sports",
  tan_music: "Music",
  tan_finance: "Finance",
  tan_health: "Health",
  tan_politics: "Politics",
  tan_space: "Space",
  tan_gaming: "Gaming",
  tan_film: "Film",
  tan_startups: "Startups",
  tan_philosophy: "Philosophy",
  tan_climate: "Climate",
};

export const TAN_AGENT_USERNAMES: GuardianTopicKey[] = [
  "tan_world",
  "tan_science",
  "tan_ai",
  "tan_sports",
  "tan_music",
  "tan_finance",
  "tan_health",
  "tan_politics",
  "tan_space",
  "tan_gaming",
  "tan_film",
  "tan_startups",
  "tan_philosophy",
  "tan_climate",
];

/** Normalize env key (trim; Vercel/UI often adds trailing newline). */
export function normalizeGuardianApiKey(raw: string | undefined | null): string | null {
  if (raw == null) return null;
  const t = String(raw).trim();
  return t.length ? t : null;
}

export type GuardianArticleResult = {
  id: string;
  webUrl?: string;
  webTitle?: string;
  apiUrl?: string;
  fields?: {
    headline?: string;
    trailText?: string;
    thumbnail?: string;
    shortUrl?: string;
    byline?: string;
  };
};

type GuardianSearchResponse = {
  response?: {
    status?: string;
    message?: string;
    /** Present on error responses even when HTTP is 200 */
    results?: GuardianArticleResult[];
    total?: number;
  };
};

export function isGuardianTopicKey(s: string): s is GuardianTopicKey {
  return s in GUARDIAN_TOPIC_MAP;
}

export function buildGuardianSearchUrl(topic: GuardianTopicKey, apiKey: string): string {
  const key = normalizeGuardianApiKey(apiKey);
  if (!key) throw new Error("Guardian API key is empty after trim");
  const config = GUARDIAN_TOPIC_MAP[topic];
  const params = new URLSearchParams({
    "api-key": key,
    "show-fields": "headline,trailText,thumbnail,shortUrl,byline",
    "page-size": "5",
    "order-by": "newest",
  });
  if ("section" in config && config.section) {
    params.append("section", config.section);
  }
  if ("tags" in config && config.tags) {
    params.append("tag", config.tags);
  }
  return `https://content.guardianapis.com/search?${params.toString()}`;
}

/** URL safe to log (no api-key). */
export function guardianSearchUrlForLog(topic: GuardianTopicKey): string {
  const config = GUARDIAN_TOPIC_MAP[topic];
  const params = new URLSearchParams({
    "show-fields": "headline,trailText,thumbnail,shortUrl,byline",
    "page-size": "5",
    "order-by": "newest",
  });
  if ("section" in config && config.section) params.append("section", config.section);
  if ("tags" in config && config.tags) params.append("tag", config.tags);
  return `https://content.guardianapis.com/search?${params.toString()}&api-key=[REDACTED]`;
}

export type GuardianFetchDiagnostics = {
  httpStatus: number;
  guardianStatus?: string;
  guardianMessage?: string;
  total?: number;
  resultCount: number;
  requestUrlLogged: string;
};

export async function fetchGuardianArticles(
  topic: GuardianTopicKey,
  apiKey: string
): Promise<{ articles: GuardianArticleResult[]; diagnostics: GuardianFetchDiagnostics }> {
  const key = normalizeGuardianApiKey(apiKey);
  if (!key) {
    throw new Error("GUARDIAN_API_KEY is missing or whitespace-only after trim");
  }

  const url = buildGuardianSearchUrl(topic, key);
  const logUrl = guardianSearchUrlForLog(topic);

  console.log(`[TAN/Guardian] GET ${logUrl}`);

  const res = await fetch(url, {
    cache: "no-store",
    next: { revalidate: 0 },
  });

  const httpStatus = res.status;
  let bodyText = "";
  try {
    bodyText = await res.text();
  } catch (e) {
    console.error("[TAN/Guardian] Failed to read response body", e);
    throw new Error(`Guardian read body failed: ${e instanceof Error ? e.message : String(e)}`);
  }

  if (!res.ok) {
    console.error(`[TAN/Guardian] HTTP ${httpStatus}`, bodyText.slice(0, 500));
    throw new Error(`Guardian API HTTP ${httpStatus}: ${bodyText.slice(0, 280)}`);
  }

  let data: GuardianSearchResponse;
  try {
    data = JSON.parse(bodyText) as GuardianSearchResponse;
  } catch (e) {
    console.error("[TAN/Guardian] Invalid JSON", bodyText.slice(0, 400));
    throw new Error("Guardian API returned non-JSON");
  }

  const resp = data.response;
  if (!resp) {
    console.error("[TAN/Guardian] Missing response object", bodyText.slice(0, 400));
    throw new Error("Guardian JSON missing `response`");
  }

  // Critical: Guardian often returns HTTP 200 with response.status === "error" for bad keys / limits.
  if (resp.status === "error") {
    const msg = resp.message || "Unknown Guardian error";
    console.error(`[TAN/Guardian] API error status: ${msg}`);
    throw new Error(`Guardian API: ${msg}`);
  }

  const results = resp.results ?? [];
  const diagnostics: GuardianFetchDiagnostics = {
    httpStatus,
    guardianStatus: resp.status,
    guardianMessage: resp.message,
    total: resp.total,
    resultCount: results.length,
    requestUrlLogged: logUrl,
  };

  console.log(
    `[TAN/Guardian] topic=${topic} status=${resp.status ?? "?"} total=${resp.total ?? "?"} results=${results.length}`
  );

  return { articles: results, diagnostics };
}
