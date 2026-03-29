import { createClient } from "@/lib/supabase/client";
import { canonicalTopicFromSlug } from "@/lib/feed-topic";

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

export type FeedNewsRow = {
  id: string;
  title: string;
  summary: string | null;
  category: string;
  posted_by: string;
  created_at: string;
  upvotes: number;
  comment_count: number;
  thumbnail_url?: string | null;
  source_url?: string | null;
};

export type FeedItem =
  | {
      kind: "post";
      created_at: string;
      row: NetworkPost & { community_id?: string | null; cover_image_url?: string | null };
    }
  | { kind: "news"; created_at: string; row: FeedNewsRow };

type PostRowDb = NetworkPost & { community_id?: string | null; cover_image_url?: string | null };

export async function fetchFeedPosts(params?: {
  sort?: "new" | "popular";
  type?: string;
  tag?: string;
  communityId?: string;
  offset?: number;
  limit?: number;
}) {
  const supabase = createClient();
  const pageSize = Math.min(Math.max(params?.limit ?? 20, 1), 50);
  const offset = Math.max(params?.offset ?? 0, 0);

  if (params?.tag && !params?.communityId) {
    return fetchTopicFeedMerged(supabase, params, pageSize, offset);
  }

  const end = offset + pageSize - 1;

  let query = supabase
    .from("posts")
    .select("id,author_id,title,body,post_type,tags,community_id,cover_image_url,created_at,like_count,comment_count,rating_avg,score")
    .eq("is_public", true);

  if (params?.type) query = query.eq("post_type", params.type);
  if (params?.tag) query = query.contains("tags", [canonicalTopicFromSlug(params.tag)]);
  if (params?.communityId) query = query.eq("community_id", params.communityId);
  if (params?.sort === "popular") query = query.order("score", { ascending: false });
  else query = query.order("created_at", { ascending: false });

  const { data, error } = await query.range(offset, end);
  const items: FeedItem[] = (data ?? []).map((p: PostRowDb) => ({
    kind: "post" as const,
    created_at: p.created_at,
    row: p,
  }));
  return { data: items, error };
}

/** Posts + TAN news_posts for topic, merged by created_at (sidebar topics → /feed?tag=…). */
async function fetchTopicFeedMerged(
  supabase: ReturnType<typeof createClient>,
  params: { sort?: "new" | "popular"; type?: string; tag?: string; offset?: number; limit?: number },
  pageSize: number,
  offset: number
) {
  const tag = params.tag!;
  const canonical = canonicalTopicFromSlug(tag);
  const pool = Math.min(offset + pageSize + 100, 300);

  const postSelect =
    "id,author_id,title,body,post_type,tags,community_id,cover_image_url,created_at,like_count,comment_count,rating_avg,score";
  const newsSelect =
    "id,title,summary,category,posted_by,created_at,upvotes,comment_count,thumbnail_url,source_url";

  let postQuery = supabase.from("posts").select(postSelect).eq("is_public", true).contains("tags", [canonical]);
  if (params.type) postQuery = postQuery.eq("post_type", params.type);
  if (params.sort === "popular") postQuery = postQuery.order("score", { ascending: false });
  else postQuery = postQuery.order("created_at", { ascending: false });
  postQuery = postQuery.limit(pool);

  const [postsRes, newsRes] = await Promise.all([
    postQuery,
    supabase.from("news_posts").select(newsSelect).eq("category", canonical).order("created_at", { ascending: false }).limit(pool),
  ]);

  const err = postsRes.error ?? newsRes.error;
  const postRows = (postsRes.data ?? []) as PostRowDb[];
  const newsRows = (newsRes.data ?? []) as FeedNewsRow[];

  const items: FeedItem[] = [
    ...postRows.map((p) => ({ kind: "post" as const, created_at: p.created_at, row: p })),
    ...newsRows.map((n) => ({ kind: "news" as const, created_at: n.created_at, row: n })),
  ];
  items.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  const sliced = items.slice(offset, offset + pageSize);
  return { data: sliced, error: err };
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
