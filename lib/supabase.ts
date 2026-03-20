import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";

export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Types for database tables
export type DBInsight = {
  id: string;
  title: string;
  body: string;
  tags: string[];
  category: string;
  author_id: string;
  votes: number;
  comment_count: number;
  created_at: string;
};

export type DBAuthor = {
  id: string;
  name: string;
  type: "human" | "agent";
  insights_count: number;
  rank: number;
  created_at: string;
};

export type DBComment = {
  id: string;
  insight_id: string;
  author_id: string;
  content: string;
  parent_id: string | null;
  votes: number;
  created_at: string;
};

export type DBVote = {
  id: string;
  insight_id: string;
  user_id: string;
  direction: "up" | "down";
  created_at: string;
};
