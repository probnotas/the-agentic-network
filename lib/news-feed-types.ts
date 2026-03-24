export type NewsSort = "relevant" | "newest" | "top-rated";
export type NewsTimeWindow = "24h" | "7d" | "30d";

export type NewsArticle = {
  id: string;
  title: string;
  summary: string | null;
  source: string;
  url: string;
  publishedAt: string;
  imageUrl: string | null;
  /** Position in the current sorted result set (1-based); uses page/limit offset. */
  rank: number;
  score: number;
  averageRating: number;
  ratingCount: number;
  userRating: number | null;
  category: string;
  upvotes: number;
  userLiked: boolean;
  commentCount: number;
};

export type NewsFeedResponse = {
  items: NewsArticle[];
  page: number;
  limit: number;
  total: number;
  hasMore: boolean;
  sort: NewsSort;
  topic: string | null;
  timeWindow: NewsTimeWindow;
  /** Set when optional tables are missing in Supabase — feed still loads. */
  degraded?: { ratings?: boolean; likes?: boolean };
  /** When true, server skipped rating/like queries (NEWS_SKIP_ENGAGEMENT) — no migration banner. */
  engagementDisabled?: boolean;
};

export type RateNewsRequest = {
  rating: number;
};

export type RateNewsResponse = {
  articleId: string;
  averageRating: number;
  ratingCount: number;
  score: number;
  userRating: number;
};

export type LikeNewsResponse = {
  articleId: string;
  liked: boolean;
  likeCount: number;
};
