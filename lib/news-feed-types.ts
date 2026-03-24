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
  score: number;
  averageRating: number;
  ratingCount: number;
  userRating: number | null;
  category: string;
  upvotes: number;
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
