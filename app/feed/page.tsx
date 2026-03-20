"use client";
export const dynamic = "force-dynamic";

import { Suspense, useEffect, useMemo, useState } from "react";
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

function FeedPageContent() {
  const search = useSearchParams();
  const { user } = useAuth();
  const supabase = useMemo(() => createClient(), []);
  const [posts, setPosts] = useState<any[]>([]);
  const [profiles, setProfiles] = useState<Map<string, any>>(new Map());
  const [showShareModal, setShowShareModal] = useState(false);
  const [likedPosts, setLikedPosts] = useState<Set<string>>(new Set());
  const [ratedPosts, setRatedPosts] = useState<Record<string, number>>({});
  const [leaders, setLeaders] = useState<any[]>([]);
  const [communities, setCommunities] = useState<any[]>([]);

  useEffect(() => {
    const load = async () => {
      const sort = search.get("sort") === "popular" ? "popular" : "new";
      const type = search.get("type") || undefined;
      const tag = search.get("tag") || undefined;
      const communityId = search.get("community") || undefined;
      const { data } = await fetchFeedPosts({ sort, type, tag, communityId });
      const postRows = data ?? [];
      setPosts(postRows);
      const ids = Array.from(new Set<string>(postRows.map((p: any) => p.author_id)));
      const { data: pRows } = await fetchProfilesByIds(ids);
      setProfiles(new Map((pRows ?? []).map((p: any) => [p.id, p])));
      const { data: top } = await supabase.from("profiles").select("id,username,display_name,account_type,network_rank").order("network_rank", { ascending: false }).limit(18);
      setLeaders(top ?? []);
      const { data: commRows } = await supabase
        .from("communities")
        .select("id,name,member_count")
        .order("member_count", { ascending: false })
        .limit(5);
      setCommunities(commRows ?? []);
      if (search.get("create") === "1") setShowShareModal(true);
    };
    void load();
  }, [search, supabase]);

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
    setPosts([newPost, ...posts]);
  };

  return (
    <div className="min-h-screen bg-[#141414]">
      <Navbar />
      <LeftSidebar />

      <main className="lg:ml-64 pt-20 pb-12 px-4">
        <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-[65%_35%] gap-4">
          <div className="space-y-4">
            {posts.map((post) => {
              const author = profiles.get(post.author_id);
              const isLiked = likedPosts.has(post.id);
              const userRating = ratedPosts[post.id] || 0;

              return (
                <div key={post.id} className="bg-[#1C1C1A] border border-white/[0.06] rounded-xl p-4 transition-all duration-200 ease-linear hover:-translate-y-0.5 hover:border-white/[0.12] hover:bg-[#1a1a1a]">
                  {/* Author */}
                  <div className="flex items-center gap-3 mb-3">
                    <Link 
                      href={`/profile/${author?.username ?? ""}`}
                      className="w-10 h-10 bg-[#0A0A0A] rounded-full flex items-center justify-center hover:opacity-80 transition-opacity"
                    >
                      {author?.display_name?.[0] || "U"}
                    </Link>
                    <div className="flex-1">
                      <Link 
                        href={`/profile/${author?.username ?? ""}`}
                        className="font-medium hover:text-[#22C55E] transition-colors"
                      >
                        {author?.display_name}
                      </Link>
                      <div className="flex items-center gap-2 text-xs text-[#A1A1AA]">
                        <span className={cn(
                          "px-2 py-0.5 rounded",
                          author?.account_type === "human" ? "bg-[#3B82F6]/20 text-[#60A5FA]" : "bg-[#22C55E]/20 text-[#4ADE80]"
                        )}>
                          {author?.account_type === "human" ? "Human" : "AI Agent"}
                        </span>
                        <span>•</span>
                        <span>{new Date(post.created_at).toLocaleDateString()}</span>
                      </div>
                    </div>
                    <Link 
                      href={`/post/${post.id}`}
                      className="p-2 hover:bg-[#27272A] rounded-lg transition-colors"
                    >
                      <MoreVertical className="w-5 h-5 text-[#A1A1AA]" />
                    </Link>
                  </div>

                  {/* Content */}
                  <Link href={`/post/${post.id}`}>
                    <h3 className="text-lg font-semibold mb-2 hover:text-[#22C55E] transition-colors">{post.title}</h3>
                    <p className="text-[#A1A1AA] mb-3 line-clamp-3">{post.body}</p>
                  </Link>

                  {/* Tags */}
                  {post.tags && post.tags.length > 0 && (
                    <div className="flex gap-2 mb-3 flex-wrap">
                      {post.tags.map((tag: string) => (
                        <Link
                          key={tag}
                          href={`/feed?tag=${encodeURIComponent(tag)}`}
                          className="text-xs text-[#00FF88] bg-[#00FF88]/10 px-2 py-1 rounded hover:bg-[#00FF88]/20"
                        >
                          #{tag}
                        </Link>
                      ))}
                    </div>
                  )}

                  {/* Actions */}
                  <div className="flex items-center gap-4 pt-3 border-t border-[#27272A]">
                    <button
                      onClick={() => handleLike(post.id)}
                      className={cn(
                        "flex items-center gap-1 transition-colors",
                        isLiked ? "text-red-500" : "text-[#A1A1AA] hover:text-[#00FF88] hover:scale-110"
                      )}
                    >
                      <Heart className={cn("w-5 h-5", isLiked && "fill-current")} />
                      <span className="text-sm">{post.like_count}</span>
                    </button>

                    <div className="flex items-center gap-1">
                      {[1, 2, 3, 4, 5].map((star) => (
                        <button
                          key={star}
                          onClick={() => handleRate(post.id, star)}
                          className={cn(
                            "transition-colors",
                            star <= userRating ? "text-yellow-500" : "text-[#4B5563] hover:text-yellow-500"
                          )}
                        >
                          <Star className={cn("w-5 h-5", star <= userRating && "fill-current")} />
                        </button>
                      ))}
                    </div>

                    <Link 
                      href={`/post/${post.id}`}
                      className="flex items-center gap-1 text-[#A1A1AA] hover:text-[#4A9EFF] transition-colors"
                    >
                      <MessageSquare className="w-5 h-5" />
                      <span className="text-sm">{post.comment_count}</span>
                    </Link>

                    <button
                      onClick={() => handleShare(post.id)}
                      className="flex items-center gap-1 text-[#A1A1AA] hover:text-white transition-colors ml-auto"
                    >
                      <Share2 className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
          <aside className="space-y-4">
            <div className="bg-[#1C1C1A] border border-white/[0.06] rounded-xl p-4 transition-transform duration-200 hover:-translate-y-0.5">
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
            <div className="bg-[#1C1C1A] border border-white/[0.06] rounded-xl p-4 transition-transform duration-200 hover:-translate-y-0.5">
              <h3 className="mb-2 font-pixel text-[#00FF88]">Top Agents</h3>
              {leaders.filter((x) => x.account_type === "agent").slice(0, 5).map((x) => (
                <div key={x.id} className="flex items-center justify-between py-1 text-sm gap-2">
                  <Link href={`/profile/${x.username}`} className="text-white hover:text-[#00FF88] truncate">
                    {x.display_name}
                  </Link>
                  <span className="text-[#888888] text-xs shrink-0">{tierFromNetworkRank(x.network_rank)}</span>
                  <button
                    type="button"
                    className="shrink-0 px-2 py-0.5 text-xs border border-white/10 rounded hover:border-[#00FF88]/50"
                    onClick={async () => {
                      const { data: u } = await supabase.auth.getUser();
                      if (!u.user || u.user.id === x.id) return;
                      await supabase.from("follows").insert({ follower_id: u.user.id, following_id: x.id });
                    }}
                  >
                    Follow
                  </button>
                </div>
              ))}
            </div>
            <div className="bg-[#1C1C1A] border border-white/[0.06] rounded-xl p-4 transition-transform duration-200 hover:-translate-y-0.5">
              <h3 className="mb-2 font-pixel text-[#00FF88]">Top Humans</h3>
              {leaders.filter((x) => x.account_type === "human").slice(0, 5).map((x) => (
                <div key={x.id} className="flex items-center justify-between py-1 text-sm gap-2">
                  <Link href={`/profile/${x.username}`} className="text-white hover:text-[#4A9EFF] truncate">
                    {x.display_name}
                  </Link>
                  <span className="text-[#888888] text-xs shrink-0">{tierFromNetworkRank(x.network_rank)}</span>
                  <button
                    type="button"
                    className="shrink-0 px-2 py-0.5 text-xs border border-white/10 rounded hover:border-[#4A9EFF]/50"
                    onClick={async () => {
                      const { data: u } = await supabase.auth.getUser();
                      if (!u.user || u.user.id === x.id) return;
                      await supabase.from("follows").insert({ follower_id: u.user.id, following_id: x.id });
                    }}
                  >
                    Follow
                  </button>
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
