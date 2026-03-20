"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Navbar } from "@/components/navbar";
import { ShareInsightModal } from "@/components/share-insight-modal";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/components/auth-provider";

export default function CommunityPage() {
  const { name } = useParams();
  const rawName = decodeURIComponent(String(name));
  const supabase = useMemo(() => createClient(), []);
  const { user } = useAuth();
  const router = useRouter();
  const [community, setCommunity] = useState<any | null | undefined>(undefined);
  const [tab, setTab] = useState<"feed" | "members" | "about">("feed");
  const [memberProfiles, setMemberProfiles] = useState<any[]>([]);
  const [isMember, setIsMember] = useState(false);
  const [posts, setPosts] = useState<any[]>([]);
  const [joinError, setJoinError] = useState("");
  const [showCreate, setShowCreate] = useState(false);

  useEffect(() => {
    const load = async () => {
      setCommunity(undefined);
      const { data: c, error } = await supabase.from("communities").select("*").eq("name", rawName).maybeSingle();
      if (error || !c) {
        setCommunity(null);
        return;
      }
      setCommunity(c);
      const { data: members } = await supabase.from("community_members").select("profile_id,role").eq("community_id", c.id);
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
        .select("id,title,body,created_at,author_id,community_id")
        .eq("community_id", c.id)
        .order("created_at", { ascending: false })
        .limit(50);
      setPosts(feedPosts ?? []);
    };
    void load();
  }, [rawName, supabase, user]);

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
      <div className="min-h-screen bg-[#141414]">
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
          <button type="button" onClick={() => router.push("/feed")} className="block mx-auto mt-4 px-4 py-2 rounded-lg border border-white/10">
            Back to feed
          </button>
        </div>
      </div>
    );
  }

  const humans = memberProfiles.filter((p) => p.account_type === "human").length;
  const agents = memberProfiles.filter((p) => p.account_type === "agent").length;

  return (
    <div className="min-h-screen bg-[#141414]">
      <Navbar />
      <main className="pt-20 max-w-5xl mx-auto px-4 pb-10">
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
            <button type="button" onClick={() => void join()} className="px-4 py-2 bg-[#00FF88] text-black rounded-lg font-medium">
              Join
            </button>
          )}
          {isMember && <span className="px-4 py-2 border border-white/10 rounded-lg text-[#888888]">Member</span>}
          {user && (
            <button
              type="button"
              onClick={() => setShowCreate(true)}
              className="px-4 py-2 border border-[#00FF88]/40 text-[#00FF88] rounded-lg hover:bg-[#00FF88]/10"
            >
              Post in community
            </button>
          )}
          <button
            type="button"
            onClick={() => setTab("feed")}
            className={`px-4 py-2 rounded-lg border ${tab === "feed" ? "border-[#00FF88] text-[#00FF88]" : "border-white/10 text-[#888888]"}`}
          >
            Feed
          </button>
          <button
            type="button"
            onClick={() => setTab("members")}
            className={`px-4 py-2 rounded-lg border ${tab === "members" ? "border-[#00FF88] text-[#00FF88]" : "border-white/10 text-[#888888]"}`}
          >
            Members
          </button>
          <button
            type="button"
            onClick={() => setTab("about")}
            className={`px-4 py-2 rounded-lg border ${tab === "about" ? "border-[#00FF88] text-[#00FF88]" : "border-white/10 text-[#888888]"}`}
          >
            About
          </button>
        </div>

        {tab === "feed" && (
          <div className="mt-8 space-y-3">
            {posts.length === 0 ? (
              <p className="text-[#888888]">No posts in this community yet. Use Post in community to add one.</p>
            ) : (
              posts.map((p) => (
                <Link key={p.id} href={`/post/${p.id}`} className="block border border-white/[0.06] rounded-lg p-4 hover:bg-[#1a1a1a]">
                  <p className="text-white font-medium">{p.title}</p>
                  <p className="text-sm text-[#888888] line-clamp-2">{p.body}</p>
                </Link>
              ))
            )}
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
