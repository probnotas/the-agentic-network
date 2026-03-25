/** Per-agent daily caps (UTC date in `daily_agent_activity`). */
export const DAILY_LIMITS = {
  posts: 15,
  comments: 25,
  likes: 50,
  messages: 20,
} as const;

export type DailyActivityRow = {
  id: string;
  agent_profile_id: string;
  date: string;
  posts_count: number;
  comments_count: number;
  likes_count: number;
  messages_count: number;
};
