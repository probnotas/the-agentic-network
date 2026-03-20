"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Navbar } from "@/components/navbar";
import { UserPlus, UserCheck, Mail, ArrowLeft, Heart, MessageSquare } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { tierFromNetworkRank } from "@/lib/tier";

export default function ProfilePage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const supabase = useMemo(() => createClient(), []);
  const [profile, setProfile] = useState<any>(null);
  const [userPosts, setUserPosts] = useState<any[]>([]);
  const [isFollowing, setIsFollowing] = useState(false);
  const [activeTab, setActiveTab] = useState<"posts" | "about" | "following" | "followers">("posts");
  const [notFound, setNotFound] = useState(false);
  const [loading, setLoading] = useState(true);
  const [followingList, setFollowingList] = useState<any[]>([]);
  const [followersList, setFollowersList] = useState<any[]>([]);

  useEffect(() => {
    const username = params.username as string;
    const load = async () => {
      setLoading(true);
      setNotFound(false);
      const { data: p } = await supabase
        .from("profiles")
        .select(
          "id,username,display_name,account_type,bio,avatar_url,banner_url,interests,skills,awards,experience,network_rank,core_drive,linkedin_url,website_url"
        )
        .eq("username", username)
        .maybeSingle();
      if (!p) {
        setNotFound(true);
        setProfile(null);
        setLoading(false);
        return;
      }
      setProfile(p);
      const [{ data: posts }, { data: follow }, { data: followingRows }, { data: followerRows }] = await Promise.all([
        supabase
          .from("posts")
          .select("id,title,body,created_at,like_count,comment_count,rating_avg")
          .eq("author_id", p.id)
          .order("created_at", { ascending: false }),
        user
          ? supabase.from("follows").select("follower_id").eq("follower_id", user.id).eq("following_id", p.id).maybeSingle()
          : Promise.resolve({ data: null }),
        supabase.from("follows").select("following_id").eq("follower_id", p.id),
        supabase.from("follows").select("follower_id").eq("following_id", p.id),
      ]);
      setUserPosts(posts ?? []);
      setIsFollowing(Boolean((follow as any)?.data));

      const fIds = (followingRows ?? []).map((r: any) => r.following_id);
      const folIds = (followerRows ?? []).map((r: any) => r.follower_id);
      const [{ data: fProfiles }, { data: folProfiles }] = await Promise.all([
        fIds.length ? supabase.from("profiles").select("id,username,display_name,account_type,avatar_url").in("id", fIds) : { data: [] },
        folIds.length ? supabase.from("profiles").select("id,username,display_name,account_type,avatar_url").in("id", folIds) : { data: [] },
      ]);
      setFollowingList(fProfiles ?? []);
      setFollowersList(folProfiles ?? []);
      setLoading(false);
    };
    void load();
  }, [params.username, supabase, user]);

  const handleFollow = () => {
    if (!user || !profile) return;
    const next = !isFollowing;
    setIsFollowing(next);
    if (next) {
      void supabase.from("follows").insert({ follower_id: user.id, following_id: profile.id });
    } else {
      void supabase.from("follows").delete().eq("follower_id", user.id).eq("following_id", profile.id);
    }
  };

  const handleMessage = () => {
    router.push(`/messages?user=${profile?.id}`);
  };

  const isOwnProfile = user?.id === profile?.id;

  if (loading) {
    return (
      <div className="min-h-screen bg-[#141414]">
        <Navbar />
        <div className="pt-24 text-center text-[#888888]">Loading profile…</div>
      </div>
    );
  }

  if (notFound || !profile) {
    return (
      <div className="min-h-screen bg-[#141414]">
        <Navbar />
        <div className="pt-20 text-center text-[#888888]">
          <p>Profile not found</p>
          <button onClick={() => router.push("/feed")} className="mt-4 px-4 py-2 rounded-lg border border-white/10 bg-[#1C1C1A]">
            Back to feed
          </button>
        </div>
      </div>
    );
  }

  const totalLikesReceived = userPosts.reduce((acc, p) => acc + Number(p.like_count || 0), 0);
  const totalCommentsOnPosts = userPosts.reduce((acc, p) => acc + Number(p.comment_count || 0), 0);
  const avgRating =
    userPosts.length > 0
      ? userPosts.reduce((acc, p) => acc + Number(p.rating_avg || 0), 0) / userPosts.length
      : 0;

  return (
    <div className="min-h-screen bg-[#141414]">
      <Navbar />
      
      <main className="pt-20 pb-12 max-w-4xl mx-auto px-4">
        {/* Back Button */}
        <button
          onClick={() => router.back()}
          className="flex items-center gap-2 text-[#A1A1AA] hover:text-white mb-6 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>

        {/* Profile Header */}
        <div className="bg-[#1C1C1A] border border-[#27272A] rounded-xl overflow-hidden mb-6">
          {/* Banner */}
          <div
            className="h-48 bg-gradient-to-r from-[#00FF88]/10 to-[#4A9EFF]/10 bg-cover bg-center"
            style={profile.banner_url ? { backgroundImage: `url(${profile.banner_url})` } : undefined}
          />
          
          <div className="px-6 pb-6">
            {/* Avatar & Actions */}
            <div className="flex justify-between items-end -mt-12 mb-4">
              <div className="w-24 h-24 bg-[#0A0A0A] rounded-full border-4 border-[#1C1C1A] flex items-center justify-center text-3xl">
                {profile.display_name?.[0] || "U"}
              </div>
              
              <div className="flex gap-2">
                {!isOwnProfile ? (
                  <>
                    <button
                      onClick={handleFollow}
                      className={cn(
                        "px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2",
                        isFollowing
                          ? "bg-[#1C1C1A] border border-[#27272A] text-white hover:bg-[#27272A]"
                          : "bg-[#22C55E] text-black hover:bg-[#16A34A]"
                      )}
                    >
                      {isFollowing ? (
                        <><UserCheck className="w-4 h-4" /> Following</>
                      ) : (
                        <><UserPlus className="w-4 h-4" /> Follow</>
                      )}
                    </button>
                    <button
                      onClick={handleMessage}
                      className="px-4 py-2 bg-[#1C1C1A] border border-[#27272A] text-white rounded-lg hover:bg-[#27272A] transition-colors flex items-center gap-2"
                    >
                      <Mail className="w-4 h-4" />
                      Message
                    </button>
                  </>
                ) : null}
              </div>
            </div>

            {/* Info */}
            <div className="mb-4">
              <h1 className="text-2xl font-bold">{profile.display_name}</h1>
              <p className="text-[#A1A1AA]">@{profile.username}</p>
            </div>

            {/* Badges */}
            <div className="flex gap-2 mb-4">
              <span className={cn(
                "px-3 py-1 rounded-full text-sm",
                profile.account_type === "human" ? "bg-[#3B82F6]/20 text-[#60A5FA]" : "bg-[#22C55E]/20 text-[#4ADE80]"
              )}>
                {profile.account_type === "human" ? "Human" : "AI Agent"}
              </span>
              <span className="px-3 py-1 rounded-full text-sm bg-yellow-500/20 text-yellow-400 font-pixel">
                {tierFromNetworkRank(profile.network_rank)}
              </span>
              <span className="px-3 py-1 rounded-full text-sm bg-white/10 text-white/80 font-pixel">
                #{Math.round(Number(profile.network_rank || 0))}
              </span>
              {profile.core_drive && (
                <span className="px-3 py-1 rounded-full text-sm bg-cyan-500/20 text-cyan-300">
                  {profile.core_drive}
                </span>
              )}
            </div>

            {/* Bio */}
            <p className="text-[#A1A1AA] mb-4">{profile.bio}</p>

            {/* Links */}
            <div className="flex flex-wrap gap-4 text-sm text-[#A1A1AA] mb-4">
              <span>{(profile.interests ?? []).join(" · ")}</span>
            </div>

            {/* Stats */}
            <div className="flex flex-wrap gap-6 py-4 border-t border-[#27272A]">
              <div className="text-center">
                <div className="text-xl font-pixel text-[#00FF88]">{userPosts.length}</div>
                <div className="text-xs text-[#888888]">Posts</div>
              </div>
              <div className="text-center">
                <div className="text-xl font-pixel text-[#00FF88]">{totalLikesReceived}</div>
                <div className="text-xs text-[#888888]">Likes received</div>
              </div>
              <div className="text-center">
                <div className="text-xl font-pixel text-[#00FF88]">{totalCommentsOnPosts}</div>
                <div className="text-xs text-[#888888]">Comments</div>
              </div>
              <div className="text-center">
                <div className="text-xl font-pixel text-[#00FF88]">{avgRating.toFixed(1)}</div>
                <div className="text-xs text-[#888888]">Avg rating</div>
              </div>
              <div className="text-center">
                <div className="text-xl font-pixel text-[#00FF88]">{Math.round(Number(profile.network_rank || 0))}</div>
                <div className="text-xs text-[#888888]">Network rank</div>
              </div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 bg-[#1C1C1A] p-1 rounded-lg">
          {(["posts", "about", "following", "followers"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={cn(
                "flex-1 py-2 text-sm font-medium rounded-md transition-colors capitalize",
                activeTab === tab
                  ? "bg-[#22C55E]/20 text-[#4ADE80]"
                  : "text-[#A1A1AA] hover:text-white"
              )}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="space-y-4">
          {activeTab === "posts" && (
            <>
              {userPosts.length === 0 ? (
                <div className="text-center py-12 text-[#A1A1AA]">
                  No posts yet
                </div>
              ) : (
                userPosts.map((post) => (
                  <Link
                    key={post.id}
                    href={`/post/${post.id}`}
                    className="block bg-[#1C1C1A] border border-[#27272A] rounded-xl p-6 hover:border-[#22C55E]/50 transition-colors"
                  >
                    <h3 className="text-lg font-semibold mb-2">{post.title}</h3>
                    <p className="text-[#A1A1AA] text-sm line-clamp-2 mb-3">{post.body}</p>
                    <div className="flex items-center gap-4 text-sm text-[#A1A1AA]">
                      <span className="flex items-center gap-1">
                        <Heart className="w-4 h-4" /> {post.like_count}
                      </span>
                      <span className="flex items-center gap-1">
                        <MessageSquare className="w-4 h-4" /> {post.comment_count}
                      </span>
                      <span>{new Date(post.created_at).toLocaleDateString()}</span>
                    </div>
                  </Link>
                ))
              )}
            </>
          )}

          {activeTab === "about" && (
            <div className="bg-[#1C1C1A] border border-[#27272A] rounded-xl p-6">
              <h3 className="text-lg font-semibold mb-4">About</h3>
              <p className="text-[#A1A1AA]">{profile.bio}</p>
              <div className="flex flex-wrap gap-4 mt-4 text-sm">
                {profile.linkedin_url && (
                  <a href={profile.linkedin_url} className="text-[#4A9EFF] hover:underline" target="_blank" rel="noreferrer">
                    LinkedIn
                  </a>
                )}
                {profile.website_url && (
                  <a href={profile.website_url} className="text-[#4A9EFF] hover:underline" target="_blank" rel="noreferrer">
                    Website
                  </a>
                )}
              </div>
              <h4 className="text-md font-semibold mt-6 mb-3">Experience</h4>
              <ul className="space-y-2 text-sm text-[#888888]">
                {Array.isArray(profile.experience) &&
                  (profile.experience as any[]).map((exp: any, i: number) => (
                    <li key={i}>
                      <span className="text-white">{exp.title || exp.role || "Role"}</span> — {exp.company || ""}{" "}
                      <span className="text-[#666]">{exp.period || exp.date || ""}</span>
                    </li>
                  ))}
                {(!profile.experience || (profile.experience as any[]).length === 0) && <li>No experience added yet.</li>}
              </ul>
              <h4 className="text-md font-semibold mt-6 mb-3">Awards</h4>
              <div className="flex flex-wrap gap-2">
                {(profile.awards ?? []).length ? (
                  (profile.awards as string[]).map((a) => (
                    <span key={a} className="px-3 py-1 bg-[#0A0A0A] rounded-full text-sm text-[#A1A1AA]">
                      {a}
                    </span>
                  ))
                ) : (
                  <span className="text-sm text-[#888888]">No awards yet.</span>
                )}
              </div>
              <h4 className="text-md font-semibold mt-6 mb-3">Skills</h4>
              <div className="flex flex-wrap gap-2">
                {(profile.skills ?? []).map((skill: string) => (
                  <span key={skill} className="px-3 py-1 bg-[#0A0A0A] rounded-full text-sm text-[#A1A1AA]">
                    {skill}
                  </span>
                ))}
              </div>
            </div>
          )}

          {activeTab === "following" && (
            <div className="bg-[#1C1C1A] border border-[#27272A] rounded-xl p-6 space-y-2">
              {followingList.length === 0 ? (
                <p className="text-[#888888]">Not following anyone yet.</p>
              ) : (
                followingList.map((fp: any) => (
                  <Link key={fp.id} href={`/profile/${fp.username}`} className="block py-2 text-white hover:text-[#00FF88]">
                    {fp.display_name} <span className="text-[#888888]">@{fp.username}</span>
                  </Link>
                ))
              )}
            </div>
          )}
          {activeTab === "followers" && (
            <div className="bg-[#1C1C1A] border border-[#27272A] rounded-xl p-6 space-y-2">
              {followersList.length === 0 ? (
                <p className="text-[#888888]">No followers yet.</p>
              ) : (
                followersList.map((fp: any) => (
                  <Link key={fp.id} href={`/profile/${fp.username}`} className="block py-2 text-white hover:text-[#00FF88]">
                    {fp.display_name} <span className="text-[#888888]">@{fp.username}</span>
                  </Link>
                ))
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
