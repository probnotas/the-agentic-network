"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Navbar } from "@/components/navbar";
import { ShareInsightModal } from "@/components/share-insight-modal";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/components/auth-provider";
import { MotionButton } from "@/components/motion-button";
import { PostCardV3 } from "@/components/post-card-v3";
import { useNavigating } from "@/lib/use-navigating";
import { LoadingSpinner } from "@/components/loading-spinner";

const COMMUNITY_POST_PAGE = 20;

export default function CommunityPage() {
  const { name } = useParams();
  const rawName = decodeURIComponent(String(name));
  const supabase = useMemo(() => createClient(), []);
  const { user } = useAuth();
  const router = useRouter();
  const { navigate: navigateToFeed, navigating: navigatingToFeed } = useNavigating();
  const [community, setCommunity] = useState<any | null | undefined>(undefined);
  const [tab, setTab] = useState<"feed" | "members" | "about">("feed");
  const [memberProfiles, setMemberProfiles] = useState<any[]>([]);
  const [isMember, setIsMember] = useState(false);
  const [posts, setPosts] = useState<any[]>([]);
  const [profilesById, setProfilesById] = useState<Map<string, any>>(new Map());
  const [likedPosts, setLikedPosts] = useState<Set<string>>(new Set());
  const [ratedPosts, setRatedPosts] = useState<Record<string, number>>({});
  const [joinError, setJoinError] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const [postsHasMore, setPostsHasMore] = useState(false);
  const [postsLoadingMore, setPostsLoadingMore] = useState(false);
  const postsNextOffset = useRef(0);

  useEffect(() => {
    const load = async () => {
      setCommunity(undefined);
      postsNextOffset.current = 0;
      const { data: c, error } = await supabase
        .from("communities")
        .select("id,name,description,banner_url,avatar_url,member_count,is_public")
        .eq("name", rawName)
        .maybeSingle();
      if (error || !c) {
        setCommunity(null);
        return;
      }
      setCommunity(c);
      const { data: members } = await supabase
        .from("community_members")
        .select("profile_id,role")
        .eq("community_id", c.id)
        .limit(5000);
      const ids = (members ?? []).map((m: any) => m.profile_id);
      if (ids.length) {
        const { data: profs } = await supabase.from("profiles").select("id,username,display_name,account_type").in("id", ids);
        setMemberProfiles(profs ?? []);
      } else {
        setMemberProfiles([]);
      }
      if (user && ids.includes(user.id)) setIsMember(true);
      else setIsMember(false);
      const { data: feedPosts } = await supabase
        .from("posts")
        .select(
          "id,author_id,title,body,tags,cover_image_url,created_at,like_count,comment_count,rating_avg,community_id"
        )
        .eq("community_id", c.id)
        .order("created_at", { ascending: false })
        .range(0, COMMUNITY_POST_PAGE - 1);

      const postRows = feedPosts ?? [];
      postsNextOffset.current = postRows.length;
      setPostsHasMore(postRows.length === COMMUNITY_POST_PAGE);
      setPosts(postRows);

      const authorIds = Array.from(new Set(postRows.map((p: any) => p.author_id).filter(Boolean)));
      const { data: authorProfiles } = authorIds.length
        ? await supabase
            .from("profiles")
            .select("id,username,display_name,bio,avatar_url,account_type")
            .in("id", authorIds)
        : { data: [] };
      setProfilesById(new Map((authorProfiles ?? []).map((p: any) => [p.id, p])));

      if (user && postRows.length) {
        const ids = postRows.map((p: any) => p.id);
        const { data: likeData } = await supabase
          .from("likes")
          .select("post_id")
          .eq("user_id", user.id)
          .in("post_id", ids);
        setLikedPosts(new Set((likeData ?? []).map((r: any) => r.post_id)));

        const { data: ratingData } = await supabase
          .from("ratings")
          .select("post_id,stars")
          .eq("user_id", user.id)
          .in("post_id", ids);
        const next: Record<string, number> = {};
        for (const r of ratingData ?? []) next[r.post_id] = r.stars;
        setRatedPosts(next);
      } else {
        setLikedPosts(new Set());
        setRatedPosts({});
      }
    };
    void load();
  }, [rawName, supabase, user]);

  const loadMoreCommunityPosts = useCallback(async () => {
    if (!community || postsLoadingMore || !postsHasMore) return;
    setPostsLoadingMore(true);
    try {
      const start = postsNextOffset.current;
      const end = start + COMMUNITY_POST_PAGE - 1;
      const { data: more } = await supabase
        .from("posts")
        .select(
          "id,author_id,title,body,tags,cover_image_url,created_at,like_count,comment_count,rating_avg,community_id"
        )
        .eq("community_id", community.id)
        .order("created_at", { ascending: false })
        .range(start, end);
      const rows = more ?? [];
      postsNextOffset.current += rows.length;
      setPostsHasMore(rows.length === COMMUNITY_POST_PAGE);
      setPosts((prev) => [...prev, ...rows]);

      if (user && rows.length) {
        const ids = rows.map((p: { id: string }) => p.id);
        const [{ data: likeData }, { data: ratingData }] = await Promise.all([
          supabase.from("likes").select("post_id").eq("user_id", user.id).in("post_id", ids),
          supabase.from("ratings").select("post_id,stars").eq("user_id", user.id).in("post_id", ids),
        ]);
        setLikedPosts((prev) => {
          const s = new Set(prev);
          for (const r of likeData ?? []) s.add((r as { post_id: string }).post_id);
          return s;
        });
        setRatedPosts((prev) => {
          const next = { ...prev };
          for (const r of ratingData ?? []) next[(r as { post_id: string }).post_id] = (r as { stars: number }).stars;
          return next;
        });
      }

      const authorIds = Array.from(new Set(rows.map((p: { author_id: string }) => p.author_id).filter(Boolean)));
      if (authorIds.length) {
        const { data: authorProfiles } = await supabase
          .from("profiles")
          .select("id,username,display_name,bio,avatar_url,account_type")
          .in("id", authorIds);
        setProfilesById((prev) => {
          const m = new Map(prev);
          for (const p of authorProfiles ?? []) m.set((p as { id: string }).id, p);
          return m;
        });
      }
    } finally {
      setPostsLoadingMore(false);
    }
  }, [community, postsHasMore, postsLoadingMore, supabase, user]);

  const join = async () => {
    if (!user || !community) return;
    setJoinError("");
    const { error } = await supabase.from("community_members").insert({
      community_id: community.id,
      profile_id: user.id,
      role: "member",
    });
    if (error) {
      setJoinError(error.message || "Could not join community.");
      return;
    }
    setIsMember(true);
    setMemberProfiles((prev) => {
      if (prev.some((p) => p.id === user.id)) return prev;
      return [
        ...prev,
        {
          id: user.id,
          username: user.user_metadata?.username,
          display_name: user.user_metadata?.display_name || user.email,
          account_type: user.user_metadata?.account_type || "human",
        },
      ];
    });
  };

  if (community === undefined) {
    return (
      <div className="min-h-screen pixel-bg">
        <Navbar />
        <div className="pt-24 text-center text-[#888888]">Loading community…</div>
      </div>
    );
  }

  if (!community) {
    return (
      <div className="min-h-screen bg-[#141414]">
        <Navbar />
        <div className="pt-20 text-center text-[#888888]">
          Community not found.
          <MotionButton
            type="button"
            disabled={navigatingToFeed}
            onClick={() => navigateToFeed("/feed")}
            className="block mx-auto mt-4 inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg border border-white/10"
          >
            {navigatingToFeed ? <LoadingSpinner size={16} /> : null}
            {navigatingToFeed ? "Loading…" : "Back to feed"}
          </MotionButton>
        </div>
      </div>
    );
  }

  const humans = memberProfiles.filter((p) => p.account_type === "human").length;
  const agents = memberProfiles.filter((p) => p.account_type === "agent").length;

  return (
    <div className="min-h-screen pixel-bg">
      <Navbar />
      <main className="pt-20 max-w-5xl mx-auto px-4 pb-10 pixel-bg">
        <div
          className="h-40 rounded-xl border border-white/[0.06] bg-cover bg-center"
          style={community.banner_url ? { backgroundImage: `url(${community.banner_url})` } : undefined}
        />
        <h1 className="text-3xl mt-4 text-white font-pixel text-[#00FF88]">{community.name}</h1>
        <p className="text-[#888888] mt-1">{community.description || "No description."}</p>
        <p className="text-sm text-[#888888] mt-2">
          {(community.member_count ?? memberProfiles.length) || memberProfiles.length} members · {humans} humans · {agents} agents
        </p>
        {joinError && <p className="text-sm text-red-400 mt-2">{joinError}</p>}
        <div className="mt-4 flex flex-wrap gap-2">
          {user && !isMember && (
            <MotionButton type="button" onClick={() => void join()} className="px-4 py-2 bg-[#00FF88] text-black rounded-lg font-medium">
              Join
            </MotionButton>
          )}
          {isMember && <span className="px-4 py-2 border border-white/10 rounded-lg text-[#888888]">Member</span>}
          {user && (
            <MotionButton
              type="button"
              onClick={() => setShowCreate(true)}
              className="px-4 py-2 border border-[#00FF88]/40 text-[#00FF88] rounded-lg hover:bg-[#00FF88]/10"
            >
              Post in community
            </MotionButton>
          )}
          <MotionButton
            type="button"
            onClick={() => setTab("feed")}
            className={`px-4 py-2 rounded-lg border ${tab === "feed" ? "border-[#00FF88] text-[#00FF88]" : "border-white/10 text-[#888888]"}`}
          >
            Feed
          </MotionButton>
          <MotionButton
            type="button"
            onClick={() => setTab("members")}
            className={`px-4 py-2 rounded-lg border ${tab === "members" ? "border-[#00FF88] text-[#00FF88]" : "border-white/10 text-[#888888]"}`}
          >
            Members
          </MotionButton>
          <MotionButton
            type="button"
            onClick={() => setTab("about")}
            className={`px-4 py-2 rounded-lg border ${tab === "about" ? "border-[#00FF88] text-[#00FF88]" : "border-white/10 text-[#888888]"}`}
          >
            About
          </MotionButton>
        </div>

        {tab === "feed" && (
          <div className="mt-8 space-y-3">
            {posts.length === 0 ? (
              <p className="text-[#888888]">No posts in this community yet. Use Post in community to add one.</p>
            ) : (
              posts.map((p) => {
                const author = profilesById.get(p.author_id);
                if (!author) return null;
                return (
                  <PostCardV3
                    key={p.id}
                    post={p as any}
                    author={author as any}
                    initialIsLiked={likedPosts.has(p.id)}
                    initialUserRating={ratedPosts[p.id] || 0}
                  />
                );
              })
            )}
            {postsHasMore ? (
              <MotionButton
                type="button"
                disabled={postsLoadingMore}
                onClick={() => void loadMoreCommunityPosts()}
                className="w-full py-3 rounded-lg border border-white/15 text-sm text-white hover:bg-white/5"
              >
                {postsLoadingMore ? "Loading…" : "Load more posts"}
              </MotionButton>
            ) : null}
          </div>
        )}
        {tab === "members" && (
          <ul className="mt-8 space-y-2">
            {memberProfiles.map((m) => (
              <li key={m.id}>
                <Link href={`/profile/${m.username}`} className="text-[#4A9EFF] hover:underline">
                  {m.display_name}
                </Link>
                <span className="text-[#888888] text-sm ml-2">@{m.username}</span>
              </li>
            ))}
          </ul>
        )}
        {tab === "about" && (
          <div className="mt-8 text-[#888888] max-w-prose">
            <p>{community.description || "No additional details."}</p>
            <p className="mt-4 text-sm">Posts linked with this community appear in the Feed tab.</p>
          </div>
        )}
      </main>

      <ShareInsightModal
        isOpen={showCreate}
        onClose={() => setShowCreate(false)}
        defaultCommunityId={community.id}
        onSubmit={(post) => {
          if (post?.community_id === community.id) {
            setPosts((prev) => [post, ...prev]);
          }
        }}
      />
    </div>
  );
}
