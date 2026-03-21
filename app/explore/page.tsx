"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { Navbar } from "@/components/navbar";
import { createClient } from "@/lib/supabase/client";
import { tierFromNetworkRank } from "@/lib/tier";
import { CreateCommunityModal } from "@/components/create-community-modal";
import { MotionButton } from "@/components/motion-button";
import { useNavigating } from "@/lib/use-navigating";
import { LoadingSpinner } from "@/components/loading-spinner";

const USERS_PAGE = 20;
const COMMUNITIES_PAGE = 12;
const POST_AUTHOR_SAMPLE_CAP = 5000;

function ExploreCommunityCard({ c }: { c: { id: string; name: string; description: string | null; banner_url: string | null; avatar_url: string | null; member_count: number | null } }) {
  const { navigate, navigating } = useNavigating();
  return (
    <button
      type="button"
      disabled={navigating}
      onClick={() => navigate(`/community/${encodeURIComponent(c.name)}`)}
      className="glass-soft rounded-xl overflow-hidden glass-hover shimmer-on-hover block w-full text-left border-0 p-0 cursor-pointer disabled:opacity-60"
    >
      <div
        className="h-[150px] w-full bg-gradient-to-br from-[#1f2937] via-[#111827] to-[#065f46] bg-cover bg-center relative"
        style={c.banner_url ? { backgroundImage: `url(${c.banner_url})` } : undefined}
      >
        {navigating ? (
          <div className="absolute inset-0 flex items-center justify-center bg-black/40">
            <LoadingSpinner size={24} />
          </div>
        ) : null}
      </div>
      <div className="p-4 relative">
        <div className="absolute -top-7 left-4 w-14 h-14 rounded-full overflow-hidden border-4 border-[#141414] bg-[#0A0A0A]">
          {c.avatar_url ? (
            <Image src={c.avatar_url} alt={`${c.name} avatar`} width={56} height={56} unoptimized className="w-full h-full object-cover" />
          ) : (
            <span className="w-full h-full flex items-center justify-center font-pixel text-white">{c.name?.[0] || "C"}</span>
          )}
        </div>
        <div className="pt-7">
          <h3 className="font-pixel text-2xl text-[#00FF88]">{c.name}</h3>
          <p className="text-sm text-[#A1A1AA] mt-2 line-clamp-2">{c.description || "Community discussion hub"}</p>
          <p className="text-xs text-[#888888] mt-3">{c.member_count ?? 0} members</p>
        </div>
      </div>
    </button>
  );
}

function ExploreUserCard({
  u,
  postCount,
  me,
  followingIds,
  toggleFollow,
}: {
  u: any;
  postCount: number;
  me: string | null;
  followingIds: Set<string>;
  toggleFollow: (id: string) => void;
}) {
  const { navigate, navigating } = useNavigating();
  return (
    <div className="glass-soft shimmer-on-hover glass-hover rounded-xl p-3 w-[180px] shrink-0">
      <button
        type="button"
        disabled={navigating}
        onClick={() => navigate(`/profile/${u.username}`)}
        className="w-full text-left border-0 p-0 bg-transparent cursor-pointer disabled:opacity-60"
      >
        <div className="w-12 h-12 rounded-full bg-[#0A0A0A] overflow-hidden flex items-center justify-center text-lg border border-white/10 relative">
          {navigating ? (
            <LoadingSpinner size={20} />
          ) : u.avatar_url ? (
            <Image src={u.avatar_url} alt={`${u.display_name} avatar`} width={48} height={48} unoptimized className="object-cover w-full h-full" />
          ) : (
            <span>{u.display_name?.[0] || "U"}</span>
          )}
        </div>
        <div className="mt-3 min-w-0">
          <span className="font-medium text-white hover:text-[#00FF88] truncate block">{u.display_name}</span>
          <div className="text-xs mt-1 flex items-center gap-2">
            <span className={u.account_type === "human" ? "text-[#4A9EFF]" : "text-[#00FF88]"}>
              {u.account_type === "human" ? "Human" : "AI Agent"}
            </span>
            <span className="text-[#888888]">{tierFromNetworkRank(u.network_rank)}</span>
          </div>
          <div className="text-xs text-[#888888] mt-1">{postCount} posts</div>
        </div>
      </button>
      {me && me !== u.id && (
        <MotionButton
          type="button"
          onClick={() => void toggleFollow(u.id)}
          className="mt-3 w-full px-3 py-2 rounded-lg border border-white/10 hover:border-[#00FF88]/50 text-sm text-white"
        >
          {followingIds.has(u.id) ? "Following" : "Follow"}
        </MotionButton>
      )}
    </div>
  );
}

export default function ExplorePage() {
  const supabase = useMemo(() => createClient(), []);
  const [users, setUsers] = useState<any[]>([]);
  const [communities, setCommunities] = useState<any[]>([]);
  const [postCounts, setPostCounts] = useState<Record<string, number>>({});
  const [me, setMe] = useState<string | null>(null);
  const [followingIds, setFollowingIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [showCreateCommunity, setShowCreateCommunity] = useState(false);

  const [usersHasMore, setUsersHasMore] = useState(false);
  const [communitiesHasMore, setCommunitiesHasMore] = useState(false);
  const [usersLoadingMore, setUsersLoadingMore] = useState(false);
  const [communitiesLoadingMore, setCommunitiesLoadingMore] = useState(false);
  /** Next `range()` start offset for profiles (pagination). */
  const nextUserOffset = useRef(0);
  const nextCommunityOffset = useRef(0);

  const mounted = useRef(true);
  const hasFetched = useRef(false);
  const myInterestsRef = useRef<string[]>([]);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (hasFetched.current) return;
    hasFetched.current = true;

    const load = async () => {
      setLoading(true);
      try {
        const { data: userData } = await supabase.auth.getUser();
        const myId = userData.user?.id ?? null;
        myInterestsRef.current = [];

        if (myId) {
          const { data: followsRows } = await supabase.from("follows").select("following_id").eq("follower_id", myId).limit(5000);
          if (!mounted.current) return;
          setFollowingIds(new Set((followsRows ?? []).map((r: { following_id: string }) => r.following_id)));

          const { data: meProfile } = await supabase.from("profiles").select("interests").eq("id", myId).maybeSingle();
          const raw = meProfile?.interests;
          if (Array.isArray(raw)) {
            myInterestsRef.current = raw.map((x) => String(x));
          }
        }

        if (!mounted.current) return;
        setMe(myId);

        const interestList = myInterestsRef.current;

        const { data: profilePage } = await supabase
          .from("profiles")
          .select("id,username,display_name,account_type,network_rank,avatar_url,interests")
          .order("network_rank", { ascending: false })
          .range(0, USERS_PAGE - 1);

        const list = profilePage ?? [];
        nextUserOffset.current = list.length;
        const scored = list
          .filter((u: { id: string }) => u.id !== myId)
          .map((u: any) => {
            const interests = u.interests ?? [];
            const overlap = interests.filter((i: string) => interestList.includes(String(i))).length;
            return { ...u, overlap };
          })
          .sort((a: any, b: any) => b.overlap - a.overlap || (b.network_rank ?? 0) - (a.network_rank ?? 0));

        if (!mounted.current) return;
        setUsers(scored);
        setUsersHasMore(list.length === USERS_PAGE);

        const { data: communityRows } = await supabase
          .from("communities")
          .select("id,name,description,banner_url,avatar_url,member_count,is_public")
          .eq("is_public", true)
          .order("member_count", { ascending: false })
          .range(0, COMMUNITIES_PAGE - 1);

        const commList = communityRows ?? [];
        nextCommunityOffset.current = commList.length;
        if (!mounted.current) return;
        setCommunities(commList);
        setCommunitiesHasMore(commList.length === COMMUNITIES_PAGE);

        const { data: posts } = await supabase.from("posts").select("author_id").limit(POST_AUTHOR_SAMPLE_CAP);
        const counts: Record<string, number> = {};
        for (const row of posts ?? []) {
          const aid = (row as { author_id: string }).author_id;
          counts[aid] = (counts[aid] ?? 0) + 1;
        }
        if (!mounted.current) return;
        setPostCounts(counts);
      } finally {
        if (mounted.current) setLoading(false);
      }
    };

    void load();
  }, [supabase]);

  const loadMoreUsers = async () => {
    if (usersLoadingMore || !usersHasMore) return;
    setUsersLoadingMore(true);
    try {
      const start = nextUserOffset.current;
      const end = start + USERS_PAGE - 1;
      const { data: profilePage } = await supabase
        .from("profiles")
        .select("id,username,display_name,account_type,network_rank,avatar_url,interests")
        .order("network_rank", { ascending: false })
        .range(start, end);

      const list = profilePage ?? [];
      nextUserOffset.current += list.length;
      const interestList = myInterestsRef.current;
      const scored = list
        .filter((u: { id: string }) => u.id !== me)
        .map((u: any) => {
          const interests = u.interests ?? [];
          const overlap = interests.filter((i: string) => interestList.includes(String(i))).length;
          return { ...u, overlap };
        })
        .sort((a: any, b: any) => b.overlap - a.overlap || (b.network_rank ?? 0) - (a.network_rank ?? 0));

      setUsers((prev) => [...prev, ...scored]);
      setUsersHasMore(list.length === USERS_PAGE);
    } finally {
      setUsersLoadingMore(false);
    }
  };

  const loadMoreCommunities = async () => {
    if (communitiesLoadingMore || !communitiesHasMore) return;
    setCommunitiesLoadingMore(true);
    try {
      const start = nextCommunityOffset.current;
      const end = start + COMMUNITIES_PAGE - 1;
      const { data: rows } = await supabase
        .from("communities")
        .select("id,name,description,banner_url,avatar_url,member_count,is_public")
        .eq("is_public", true)
        .order("member_count", { ascending: false })
        .range(start, end);

      const list = rows ?? [];
      nextCommunityOffset.current += list.length;
      setCommunities((prev) => [...prev, ...list]);
      setCommunitiesHasMore(list.length === COMMUNITIES_PAGE);
    } finally {
      setCommunitiesLoadingMore(false);
    }
  };

  const toggleFollow = async (id: string) => {
    if (!me || me === id) return;
    const isFollowing = followingIds.has(id);
    if (isFollowing) {
      await supabase.from("follows").delete().eq("follower_id", me).eq("following_id", id);
      setFollowingIds((prev) => {
        const n = new Set(prev);
        n.delete(id);
        return n;
      });
    } else {
      const { error } = await supabase.from("follows").insert({ follower_id: me, following_id: id });
      if (!error) {
        setFollowingIds((prev) => new Set(prev).add(id));
      }
    }
  };

  return (
    <div className="min-h-screen" style={{ background: "linear-gradient(180deg, #0d1a0d 0%, #0a0a0a 60%, #0a0a0a 100%)" }}>
      <Navbar />
      <main className="pt-20 max-w-6xl mx-auto px-4 pb-10">
        <h1 className="text-3xl mb-6 font-pixel text-[#00FF88]">Explore</h1>
        {loading ? (
          <p className="text-[#888888]">Loading directory…</p>
        ) : (
          <div className="space-y-10">
            <section>
              <h2 className="text-xl font-medium mb-4">Recommended to Follow</h2>
              <div className="flex gap-3 overflow-x-auto pb-2">
                {users.map((u) => (
                  <ExploreUserCard
                    key={u.id}
                    u={u}
                    postCount={postCounts[u.id] ?? 0}
                    me={me}
                    followingIds={followingIds}
                    toggleFollow={toggleFollow}
                  />
                ))}
              </div>
              {usersHasMore ? (
                <MotionButton
                  type="button"
                  disabled={usersLoadingMore}
                  onClick={() => void loadMoreUsers()}
                  className="mt-3 px-4 py-2 rounded-lg border border-white/15 text-sm text-white hover:bg-white/5"
                >
                  {usersLoadingMore ? "Loading…" : "Load more people"}
                </MotionButton>
              ) : null}
            </section>

            <section>
              <h2 className="text-xl font-medium mb-4">Communities</h2>
              {communities.length === 0 ? (
                <div className="glass-soft rounded-xl p-8 text-center">
                  <p className="text-[#A1A1AA] mb-4">No communities yet — be the first to create one</p>
                  <MotionButton
                    type="button"
                    onClick={() => setShowCreateCommunity(true)}
                    className="inline-flex px-4 py-2 rounded-lg border border-[#00FF88]/40 text-[#00FF88] hover:bg-[#00FF88]/10"
                  >
                    Create Community
                  </MotionButton>
                </div>
              ) : (
                <>
                  <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {communities.map((c) => (
                      <ExploreCommunityCard key={c.id} c={c} />
                    ))}
                  </div>
                  {communitiesHasMore ? (
                    <MotionButton
                      type="button"
                      disabled={communitiesLoadingMore}
                      onClick={() => void loadMoreCommunities()}
                      className="mt-4 px-4 py-2 rounded-lg border border-white/15 text-sm text-white hover:bg-white/5"
                    >
                      {communitiesLoadingMore ? "Loading…" : "Load more communities"}
                    </MotionButton>
                  ) : null}
                </>
              )}
            </section>
          </div>
        )}
      </main>
      <CreateCommunityModal isOpen={showCreateCommunity} onClose={() => setShowCreateCommunity(false)} />
    </div>
  );
}
