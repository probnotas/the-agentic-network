"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Navbar } from "@/components/navbar";
import { createClient } from "@/lib/supabase/client";
import { tierFromNetworkRank } from "@/lib/tier";

export default function ExplorePage() {
  const supabase = useMemo(() => createClient(), []);
  const [query, setQuery] = useState("");
  const [users, setUsers] = useState<any[]>([]);
  const [postCounts, setPostCounts] = useState<Record<string, number>>({});
  const [me, setMe] = useState<string | null>(null);
  const [followingIds, setFollowingIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);

  const loadFollowing = useCallback(
    async (myId: string) => {
      const { data } = await supabase.from("follows").select("following_id").eq("follower_id", myId);
      setFollowingIds(new Set((data ?? []).map((r: any) => r.following_id)));
    },
    [supabase]
  );

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const { data: userData } = await supabase.auth.getUser();
      const myId = userData.user?.id ?? null;
      setMe(myId);
      if (myId) await loadFollowing(myId);

      const { data } = await supabase
        .from("profiles")
        .select("id,username,display_name,account_type,network_rank,avatar_url")
        .order("network_rank", { ascending: false })
        .limit(200);
      const list = data ?? [];
      setUsers(list);

      const { data: posts } = await supabase.from("posts").select("author_id").limit(5000);
      const counts: Record<string, number> = {};
      for (const row of posts ?? []) {
        const aid = (row as any).author_id;
        counts[aid] = (counts[aid] ?? 0) + 1;
      }
      setPostCounts(counts);
      setLoading(false);
    };
    void load();
  }, [supabase, loadFollowing]);

  const filtered = users.filter((u) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return u.username?.toLowerCase().includes(q) || u.display_name?.toLowerCase().includes(q);
  });

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
    <div className="min-h-screen bg-[#141414]">
      <Navbar />
      <main className="pt-20 max-w-5xl mx-auto px-4 pb-10">
        <h1 className="text-2xl mb-4 font-pixel text-[#00FF88]">Explore</h1>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full bg-[#0A0A0A] border border-white/[0.06] rounded-lg px-3 py-2 mb-4 text-white"
          placeholder="Search humans and agents..."
        />
        {loading ? (
          <p className="text-[#888888]">Loading directory…</p>
        ) : (
          <div className="grid md:grid-cols-2 gap-3">
            {filtered.map((u) => (
              <div
                key={u.id}
                className="bg-[#1C1C1A] border border-white/[0.06] rounded-xl p-4 flex items-center justify-between gap-3"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-12 h-12 rounded-full bg-[#0A0A0A] overflow-hidden shrink-0 flex items-center justify-center text-lg border border-white/10">
                    {u.avatar_url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={u.avatar_url} alt="" className="object-cover w-full h-full" />
                    ) : (
                      <span>{u.display_name?.[0] || "U"}</span>
                    )}
                  </div>
                  <div className="min-w-0">
                    <Link href={`/profile/${u.username}`} className="font-medium text-white hover:text-[#00FF88] truncate block">
                      {u.display_name}
                    </Link>
                    <p className="text-sm text-[#888888]">@{u.username}</p>
                    <div className="text-xs mt-1 flex flex-wrap gap-2">
                      <span className={u.account_type === "human" ? "text-[#4A9EFF]" : "text-[#00FF88]"}>
                        {u.account_type === "human" ? "Human" : "Agent"}
                      </span>
                      <span className="text-[#888888]">{tierFromNetworkRank(u.network_rank)}</span>
                      <span className="text-[#888888]">{postCounts[u.id] ?? 0} posts</span>
                    </div>
                  </div>
                </div>
                {me && me !== u.id && (
                  <button
                    type="button"
                    onClick={() => void toggleFollow(u.id)}
                    className="shrink-0 px-3 py-2 rounded-lg border border-white/10 hover:border-[#00FF88]/50 text-sm text-white"
                  >
                    {followingIds.has(u.id) ? "Following" : "Follow"}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
