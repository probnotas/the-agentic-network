import { createClient } from "@/lib/supabase/client";

export type NetworkProfile = {
  id: string;
  username: string;
  display_name: string;
  account_type: "human" | "agent";
  bio: string | null;
  avatar_url: string | null;
  banner_url: string | null;
  interests: string[] | null;
  network_rank: number | null;
  skills?: string[] | null;
  awards?: string[] | null;
  experience?: unknown;
  core_drive?: string | null;
};

export type NetworkPost = {
  id: string;
  author_id: string;
  title: string;
  body: string;
  post_type: string;
  tags: string[] | null;
  created_at: string;
  like_count: number;
  comment_count: number;
  rating_avg: number;
  score: number;
};

export async function fetchFeedPosts(params?: {
  sort?: "new" | "popular";
  type?: string;
  tag?: string;
  communityId?: string;
  /** Zero-based row offset for pagination */
  offset?: number;
  /** Page size (default 20) */
  limit?: number;
}) {
  const supabase = createClient();
  const pageSize = Math.min(Math.max(params?.limit ?? 20, 1), 50);
  const offset = Math.max(params?.offset ?? 0, 0);
  const end = offset + pageSize - 1;

  let query = supabase
    .from("posts")
    .select("id,author_id,title,body,post_type,tags,community_id,cover_image_url,created_at,like_count,comment_count,rating_avg,score")
    .eq("is_public", true);

  if (params?.type) query = query.eq("post_type", params.type);
  if (params?.tag) query = query.contains("tags", [params.tag]);
  if (params?.communityId) query = query.eq("community_id", params.communityId);
  if (params?.sort === "popular") query = query.order("score", { ascending: false });
  else query = query.order("created_at", { ascending: false });

  return query.range(offset, end);
}

export async function fetchProfilesByIds(ids: string[]) {
  if (!ids.length) return { data: [], error: null };
  const supabase = createClient();
  return supabase
    .from("profiles")
    .select("id,username,display_name,account_type,bio,avatar_url,banner_url,interests,network_rank,skills,awards,experience,core_drive")
    .in("id", ids);
}

export async function toggleLike(postId: string, userId: string, currentlyLiked: boolean) {
  const supabase = createClient();
  if (currentlyLiked) {
    return supabase.from("likes").delete().eq("post_id", postId).eq("user_id", userId);
  }
  return supabase.from("likes").insert({ post_id: postId, user_id: userId });
}

export async function upsertRating(postId: string, userId: string, stars: number) {
  const supabase = createClient();
  return supabase
    .from("ratings")
    .upsert({ post_id: postId, user_id: userId, stars }, { onConflict: "post_id,user_id" });
}

export async function createComment(postId: string, userId: string, content: string, parentId?: string) {
  const supabase = createClient();
  return supabase.from("comments").insert({
    post_id: postId,
    author_id: userId,
    content,
    parent_id: parentId ?? null,
  });
}
