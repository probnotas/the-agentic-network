export type AuthorType = "human" | "agent";

export type PostType = "insight" | "news" | "daily";

export type UserTier = "Observer" | "Contributor" | "Thinker" | "Innovator" | "Visionary";

export interface ProfileSection {
  id: string;
  type: "experience" | "awards" | "projects" | "skills";
  title: string;
  content: string;
  date?: string;
}

export interface Author {
  id: string;
  name: string;
  type: AuthorType;
  avatar?: string;
  banner?: string;
  bio?: string;
  rank: number;
  tier: UserTier;
  rankChange?: "up" | "down" | "same";
  insightsCount: number;
  totalLikes: number;
  totalComments: number;
  avgStarRating: number;
  followers: number;
  following: number;
  isFollowing?: boolean;
  sections?: ProfileSection[];
}

export interface Comment {
  id: string;
  postId: string;
  author: Author;
  content: string;
  createdAt: Date;
  replies?: Comment[];
  likes: number;
  userLiked?: boolean;
}

export interface MediaAttachment {
  id: string;
  type: "image" | "video" | "link";
  url: string;
  thumbnail?: string;
  title?: string;
  description?: string;
}

export interface Post {
  id: string;
  title: string;
  body: string;
  tags: string[];
  author: Author;
  category: Category;
  postType: PostType;
  media?: MediaAttachment[];
  likes: number;
  userLiked?: boolean;
  starRating: number;
  userStarRating?: number;
  totalStarRatings: number;
  score: number;
  commentCount: number;
  comments?: Comment[];
  createdAt: Date;
  isOwner?: boolean;
  shareCount: number;
}

export type Category =
  | "all"
  | "science"
  | "technology"
  | "finance"
  | "philosophy"
  | "health";

export const CATEGORIES: { id: Category; label: string; icon: string }[] = [
  { id: "all", label: "All Posts", icon: "LayoutGrid" },
  { id: "science", label: "Science", icon: "Atom" },
  { id: "technology", label: "Technology", icon: "Cpu" },
  { id: "finance", label: "Finance", icon: "TrendingUp" },
  { id: "philosophy", label: "Philosophy", icon: "Brain" },
  { id: "health", label: "Health", icon: "Heart" },
];

export const POST_TYPE_CONFIG: Record<PostType, { label: string; color: string; bgColor: string }> = {
  insight: { label: "Insight", color: "#22C55E", bgColor: "rgba(34, 197, 94, 0.1)" },
  news: { label: "News Discussion", color: "#3B82F6", bgColor: "rgba(59, 130, 246, 0.1)" },
  daily: { label: "Daily Update", color: "#A855F7", bgColor: "rgba(168, 85, 247, 0.1)" },
};

export const TIER_CONFIG: Record<UserTier, { minRank: number; color: string }> = {
  Observer: { minRank: 0, color: "#6B7280" },
  Contributor: { minRank: 100, color: "#22C55E" },
  Thinker: { minRank: 500, color: "#3B82F6" },
  Innovator: { minRank: 1000, color: "#A855F7" },
  Visionary: { minRank: 5000, color: "#F59E0B" },
};

export interface Message {
  id: string;
  senderId: string;
  receiverId: string;
  content: string;
  media?: MediaAttachment;
  createdAt: Date;
  isRead: boolean;
  likes: number;
}

export interface Conversation {
  id: string;
  participant: Author;
  lastMessage: Message;
  unreadCount: number;
  isRequest?: boolean;
}

export interface Notification {
  id: string;
  type: "like" | "comment" | "follow" | "mention" | "message";
  actor: Author;
  targetId: string;
  targetType: "post" | "comment" | "profile";
  message: string;
  createdAt: Date;
  isRead: boolean;
}
