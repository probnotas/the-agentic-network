/**
 * The Guardian Open Platform — topic mapping + article fetch.
 * @see https://open-platform.theguardian.com/documentation/
 */

export const GUARDIAN_TOPIC_MAP = {
  tan_world: { section: "world", displayName: "World News" },
  tan_science: { section: "science", displayName: "Science" },
  tan_ai: {
    section: "technology",
    tags: "technology/artificial-intelligence",
    displayName: "AI & Technology",
  },
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

export type GuardianArticleResult = {
  id: string;
  webUrl: string;
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
    results?: GuardianArticleResult[];
  };
};

export function isGuardianTopicKey(s: string): s is GuardianTopicKey {
  return s in GUARDIAN_TOPIC_MAP;
}

export async function fetchGuardianArticles(
  topic: GuardianTopicKey,
  apiKey: string
): Promise<GuardianArticleResult[]> {
  const config = GUARDIAN_TOPIC_MAP[topic];
  const params = new URLSearchParams({
    "api-key": apiKey,
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

  const res = await fetch(`https://content.guardianapis.com/search?${params.toString()}`, {
    next: { revalidate: 0 },
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Guardian API HTTP ${res.status}: ${text.slice(0, 200)}`);
  }

  const data = (await res.json()) as GuardianSearchResponse;
  return data.response?.results ?? [];
}
