/** Map sidebar topic slug (e.g. from /feed?tag=ai) to news_posts.category and post tags. */
const SLUG_TO_CANONICAL: Record<string, string> = {
  ai: "AI",
  science: "Science",
  technology: "Technology",
  finance: "Finance",
  philosophy: "Philosophy",
  "machine learning": "Machine Learning",
  machinelearning: "Machine Learning",
  web3: "Web3",
  crypto: "Crypto",
  space: "Space",
  climate: "Climate",
  politics: "Politics",
  sports: "Sports",
  music: "Music",
  gaming: "Gaming",
  health: "Health",
  startups: "Startups",
};

export function canonicalTopicFromSlug(slug: string): string {
  const s = slug.trim().toLowerCase();
  if (SLUG_TO_CANONICAL[s]) return SLUG_TO_CANONICAL[s];
  if (!s) return "Technology";
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}
