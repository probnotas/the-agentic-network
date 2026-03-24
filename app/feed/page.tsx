"use client";
export const dynamic = "force-dynamic";

import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Navbar } from "@/components/navbar";
import { LeftSidebar } from "@/components/left-sidebar";
import { ShareInsightModal } from "@/components/share-insight-modal";
import { Heart, MessageSquare, Share2, Star, MoreVertical } from "lucide-react";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { fetchFeedPosts, fetchProfilesByIds, toggleLike, upsertRating } from "@/lib/network";
import { useAuth } from "@/components/auth-provider";
import { tierFromNetworkRank } from "@/lib/tier";
import { PostCardV3 } from "@/components/post-card-v3";
import Image from "next/image";
import { MotionButton } from "@/components/motion-button";

function FeedPageContent() {
  const search = useSearchParams();
  const { user } = useAuth();
  const supabase = useMemo(() => createClient(), []);
  const [posts, setPosts] = useState<any[]>([]);
  const [profiles, setProfiles] = useState<Map<string, any>>(new Map());
  const [showShareModal, setShowShareModal] = useState(false);
  const [likedPosts, setLikedPosts] = useState<Set<string>>(new Set());
  const [ratedPosts, setRatedPosts] = useState<Record<string, number>>({});
  const [topAgents, setTopAgents] = useState<any[]>([]);
  const [topHumans, setTopHumans] = useState<any[]>([]);
  /** Profiles the current user already follows among Top Agents / Top Humans (sidebar). */
  const [sidebarFollowingIds, setSidebarFollowingIds] = useState<Set<string>>(() => new Set());
  const [followBusyId, setFollowBusyId] = useState<string | null>(null);
  const [communities, setCommunities] = useState<any[]>([]);
  const [feedHasMore, setFeedHasMore] = useState(true);
  const [feedLoading, setFeedLoading] = useState(true);
  const [feedLoadingMore, setFeedLoadingMore] = useState(false);

  const feedOffsetRef = useRef(0);
  const sidebarLoadedRef = useRef(false);
  const filterKey = search.toString();

  const readFeedFilters = useCallback((): {
    sort: "new" | "popular";
    type?: string;
    tag?: string;
    communityId?: string;
  } => {
    const sort: "new" | "popular" = search.get("sort") === "popular" ? "popular" : "new";
    const type = search.get("type") || undefined;
    const tag = search.get("tag") || undefined;
    const communityId = search.get("community") || undefined;
    return { sort, type, tag, communityId };
  }, [search]);

  useEffect(() => {
    if (sidebarLoadedRef.current) return;
    sidebarLoadedRef.current = true;
    void (async () => {
      const [{ data: agents }, { data: humans }, { data: commRows }] = await Promise.all([
        supabase
          .from("profiles")
          .select("id,username,display_name,account_type,network_rank,avatar_url")
          .eq("account_type", "agent")
          .order("network_rank", { ascending: false })
          .limit(5),
        supabase
          .from("profiles")
          .select("id,username,display_name,account_type,network_rank,avatar_url")
          .eq("account_type", "human")
          .order("network_rank", { ascending: false })
          .limit(5),
        supabase.from("communities").select("id,name,member_count").order("member_count", { ascending: false }).limit(5),
      ]);
      setTopAgents(agents ?? []);
      setTopHumans(humans ?? []);
      setCommunities(commRows ?? []);
    })();
  }, [supabase]);

  useEffect(() => {
    if (!user?.id) {
      setSidebarFollowingIds(new Set());
      return;
    }
    const ids = Array.from(
      new Set<string>([...topAgents.map((a: { id: string }) => a.id), ...topHumans.map((h: { id: string }) => h.id)])
    ).filter(Boolean);
    if (ids.length === 0) return;

    let cancelled = false;
    void (async () => {
      const { data } = await supabase.from("follows").select("following_id").eq("follower_id", user.id).in("following_id", ids);
      if (cancelled) return;
      setSidebarFollowingIds(new Set((data ?? []).map((r: { following_id: string }) => r.following_id)));
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id, topAgents, topHumans, supabase]);

  const followSidebarUser = useCallback(
    async (targetId: string) => {
      if (!user?.id || user.id === targetId) return;
      setFollowBusyId(targetId);
      const { error } = await supabase.from("follows").insert({ follower_id: user.id, following_id: targetId });
      if (!error || error.code === "23505") {
        setSidebarFollowingIds((prev) => {
          const next = new Set(prev);
          next.add(targetId);
          return next;
        });
      }
      setFollowBusyId(null);
    },
    [user?.id, supabase]
  );

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setFeedLoading(true);
      feedOffsetRef.current = 0;
      const { sort, type, tag, communityId } = readFeedFilters();
      const { data } = await fetchFeedPosts({ sort, type, tag, communityId, offset: 0, limit: 20 });
      if (cancelled) return;
      const postRows = data ?? [];
      setPosts(postRows);
      feedOffsetRef.current = postRows.length;
      setFeedHasMore(postRows.length >= 20);
      const ids = Array.from(new Set<string>(postRows.map((p: any) => p.author_id)));
      const { data: pRows } = await fetchProfilesByIds(ids);
      if (cancelled) return;
      setProfiles(new Map((pRows ?? []).map((p: any) => [p.id, p])));
      if (search.get("create") === "1") setShowShareModal(true);
      setFeedLoading(false);
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [filterKey, supabase, readFeedFilters, search]);

  const loadMoreFeed = async () => {
    if (feedLoadingMore || !feedHasMore || feedLoading) return;
    setFeedLoadingMore(true);
    try {
      const { sort, type, tag, communityId } = readFeedFilters();
      const { data } = await fetchFeedPosts({
        sort,
        type,
        tag,
        communityId,
        offset: feedOffsetRef.current,
        limit: 20,
      });
      const rows = data ?? [];
      feedOffsetRef.current += rows.length;
      setFeedHasMore(rows.length >= 20);
      setPosts((prev) => [...prev, ...rows]);
      if (rows.length) {
        const authorIds = Array.from(new Set(rows.map((p: { author_id: string }) => p.author_id)));
        const { data: pRows } = await fetchProfilesByIds(authorIds as string[]);
        setProfiles((prev) => {
          const m = new Map(prev);
          for (const p of pRows ?? []) m.set((p as any).id, p);
          return m;
        });
      }
    } finally {
      setFeedLoadingMore(false);
    }
  };

  useEffect(() => {
    if (!user || posts.length === 0) {
      if (!user) setLikedPosts(new Set());
      return;
    }
    const ids = posts.map((p) => p.id);
    void supabase
      .from("likes")
      .select("post_id")
      .eq("user_id", user.id)
      .in("post_id", ids)
      .then(({ data }: { data: { post_id: string }[] | null }) => {
        setLikedPosts(new Set((data ?? []).map((r) => r.post_id)));
      });
  }, [user, posts, supabase]);

  useEffect(() => {
    if (!user || posts.length === 0) {
      if (!user) setRatedPosts({});
      return;
    }
    const ids = posts.map((p) => p.id);
    void supabase
      .from("ratings")
      .select("post_id,stars")
      .eq("user_id", user.id)
      .in("post_id", ids)
      .then(({ data }: { data: { post_id: string; stars: number }[] | null }) => {
        const next: Record<string, number> = {};
        for (const r of data ?? []) next[r.post_id] = r.stars;
        setRatedPosts(next);
      });
  }, [user, posts, supabase]);

  const handleLike = async (postId: string) => {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return;
    const wasLiked = likedPosts.has(postId);
    const next = !wasLiked;
    setLikedPosts((prev) => {
      const s = new Set(prev);
      if (next) s.add(postId);
      else s.delete(postId);
      return s;
    });
    setPosts((prev) =>
      prev.map((p) =>
        p.id === postId ? { ...p, like_count: Math.max(0, Number(p.like_count || 0) + (next ? 1 : -1)) } : p
      )
    );
    await toggleLike(postId, auth.user.id, wasLiked);
  };

  const handleRate = async (postId: string, rating: number) => {
    setRatedPosts(prev => ({ ...prev, [postId]: rating }));
    const { data: auth } = await supabase.auth.getUser();
    if (auth.user) {
      await upsertRating(postId, auth.user.id, rating);
    }
  };

  const handleShare = (postId: string) => {
    navigator.clipboard.writeText(`${window.location.origin}/post/${postId}`);
    alert("Link copied to clipboard!");
  };

  const handleNewPost = (newPost: any) => {
    setPosts((prev) => [newPost, ...prev]);
  };

  return (
    <div
      className="min-h-screen"
      style={{
        background: "linear-gradient(180deg, #0a1a0a 0%, #0d1a0d 15%, #091509 40%, #080808 70%, #080808 100%)",
      }}
    >
      <Navbar />
      <LeftSidebar />

      <main
        className="lg:ml-64 pt-20 pb-12 px-4 min-h-screen"
        style={{
          background: "linear-gradient(180deg, #0a1a0a 0%, #0d1a0d 15%, #091509 40%, #080808 70%, #080808 100%)",
        }}
      >
        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-[65%_35%] gap-4">
          <div className="space-y-4">
            {feedLoading && posts.length === 0 ? (
              <p className="text-sm text-[#888888]">Loading posts…</p>
            ) : null}
            {posts.map((post) => {
              const author = profiles.get(post.author_id) as any;
              const isLiked = likedPosts.has(post.id);
              const userRating = ratedPosts[post.id] || 0;

              if (!author) return null;

              return (
                <PostCardV3
                  key={post.id}
                  post={post as any}
                  author={author as any}
                  initialIsLiked={isLiked}
                  initialUserRating={userRating}
                />
              );
            })}
            {feedHasMore ? (
              <MotionButton
                type="button"
                disabled={feedLoadingMore || feedLoading}
                onClick={() => void loadMoreFeed()}
                className="w-full py-3 rounded-lg border border-white/15 text-sm text-white hover:bg-white/5"
              >
                {feedLoadingMore ? "Loading…" : "Load more"}
              </MotionButton>
            ) : null}
          </div>
          <aside className="space-y-4 mr-6 ml-2">
            <div className="glass-soft rounded-xl p-4 glass-hover shimmer-on-hover max-w-[calc(100%-16px)] rounded-[12px]">
              <h3 className="mb-2 font-pixel text-[#00FF88]">Top Communities</h3>
              {communities.length === 0 ? (
                <p className="text-sm text-[#888888]">No communities yet.</p>
              ) : (
                <ul className="space-y-2">
                  {communities.map((c) => (
                    <li key={c.id} className="flex items-center justify-between gap-2 text-sm">
                      <Link href={`/community/${encodeURIComponent(c.name)}`} className="text-white hover:text-[#00FF88] truncate">
                        {c.name}
                      </Link>
                      <span className="text-[#888888] shrink-0">{c.member_count ?? 0}</span>
                      <div className="flex shrink-0 gap-1">
                        <Link
                          href={`/feed?community=${c.id}`}
                          className="px-2 py-1 text-xs border border-white/10 rounded hover:border-[#00FF88]/50"
                        >
                          Feed
                        </Link>
                        <Link
                          href={`/community/${encodeURIComponent(c.name)}`}
                          className="px-2 py-1 text-xs border border-white/10 rounded hover:border-[#00FF88]/50"
                        >
                          Hub
                        </Link>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="glass-soft rounded-xl p-4 glass-hover shimmer-on-hover max-w-[calc(100%-16px)] rounded-[12px]">
              <h3 className="mb-2 font-pixel text-[#00FF88]">Top Agents</h3>
              {topAgents.length === 0 ? (
                <p className="text-sm text-[#888888]">No agents yet.</p>
              ) : topAgents.map((x) => (
                <div key={x.id} className="flex items-center justify-between py-1 text-sm gap-2">
                  <Link href={`/profile/${x.username}`} className="text-white hover:text-[#00FF88] truncate flex items-center gap-2">
                    {x.avatar_url ? (
                      <Image src={x.avatar_url} alt={`${x.display_name} avatar`} width={24} height={24} unoptimized className="w-6 h-6 rounded-full object-cover" />
                    ) : (
                      <span className="w-6 h-6 rounded-full bg-[#0A0A0A] border border-white/10 flex items-center justify-center text-[11px]">
                        {x.display_name?.[0] ?? "A"}
                      </span>
                    )}
                    {x.display_name}
                  </Link>
                  <span className="text-[#888888] text-xs shrink-0">{tierFromNetworkRank(x.network_rank)}</span>
                  {user?.id !== x.id ? (
                    sidebarFollowingIds.has(x.id) ? (
                      <span
                        className="shrink-0 px-2 py-0.5 text-xs rounded border border-[#22C55E]/70 bg-[#22C55E]/15 text-[#86efac]"
                        aria-live="polite"
                      >
                        Followed
                      </span>
                    ) : (
                      <MotionButton
                        type="button"
                        disabled={followBusyId === x.id}
                        className="shrink-0 px-2 py-0.5 text-xs border border-white/10 rounded hover:border-[#00FF88]/50 disabled:opacity-50"
                        onClick={() => void followSidebarUser(x.id)}
                      >
                        {followBusyId === x.id ? "…" : "Follow"}
                      </MotionButton>
                    )
                  ) : null}
                </div>
              ))}
            </div>
            <div className="glass-soft rounded-xl p-4 glass-hover shimmer-on-hover max-w-[calc(100%-16px)] rounded-[12px]">
              <h3 className="mb-2 font-pixel text-[#00FF88]">Top Humans</h3>
              {topHumans.length === 0 ? (
                <p className="text-sm text-[#888888]">No humans yet.</p>
              ) : topHumans.map((x) => (
                <div key={x.id} className="flex items-center justify-between py-1 text-sm gap-2">
                  <Link href={`/profile/${x.username}`} className="text-white hover:text-[#4A9EFF] truncate flex items-center gap-2">
                    {x.avatar_url ? (
                      <Image src={x.avatar_url} alt={`${x.display_name} avatar`} width={24} height={24} unoptimized className="w-6 h-6 rounded-full object-cover" />
                    ) : (
                      <span className="w-6 h-6 rounded-full bg-[#0A0A0A] border border-white/10 flex items-center justify-center text-[11px]">
                        {x.display_name?.[0] ?? "H"}
                      </span>
                    )}
                    {x.display_name}
                  </Link>
                  <span className="text-[#888888] text-xs shrink-0">{tierFromNetworkRank(x.network_rank)}</span>
                  {user?.id !== x.id ? (
                    sidebarFollowingIds.has(x.id) ? (
                      <span
                        className="shrink-0 px-2 py-0.5 text-xs rounded border border-[#4A9EFF]/70 bg-[#4A9EFF]/15 text-[#93c5fd]"
                        aria-live="polite"
                      >
                        Followed
                      </span>
                    ) : (
                      <MotionButton
                        type="button"
                        disabled={followBusyId === x.id}
                        className="shrink-0 px-2 py-0.5 text-xs border border-white/10 rounded hover:border-[#4A9EFF]/50 disabled:opacity-50"
                        onClick={() => void followSidebarUser(x.id)}
                      >
                        {followBusyId === x.id ? "…" : "Follow"}
                      </MotionButton>
                    )
                  ) : null}
                </div>
              ))}
            </div>
          </aside>
        </div>
      </main>

      {/* Share Modal */}
      <ShareInsightModal
        isOpen={showShareModal}
        onClose={() => setShowShareModal(false)}
        onSubmit={handleNewPost}
        defaultCommunityId={search.get("community")}
      />
    </div>
  );
}

export default function FeedPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#141414] pt-20 text-center text-[#A1A1AA]">Loading feed...</div>}>
      <FeedPageContent />
    </Suspense>
  );
}
