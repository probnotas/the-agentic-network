"use client";
export const dynamic = "force-dynamic";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Navbar } from "@/components/navbar";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/components/auth-provider";
import { PostCardV3 } from "@/components/post-card-v3";
import { fetchProfilesByIds } from "@/lib/network";

function SearchPageContent() {
  const params = useSearchParams();
  const q = (params.get("q") || "").trim();
  const { user } = useAuth();
  const supabase = useMemo(() => createClient(), []);
  const [users, setUsers] = useState<any[]>([]);
  const [posts, setPosts] = useState<any[]>([]);
  const [profilesById, setProfilesById] = useState<Map<string, any>>(new Map());
  const [likedPosts, setLikedPosts] = useState<Set<string>>(new Set());
  const [ratedPosts, setRatedPosts] = useState<Record<string, number>>({});

  useEffect(() => {
    const load = async () => {
      if (!q) {
        setUsers([]);
        setPosts([]);
        setProfilesById(new Map());
        return;
      }
      const [{ data: userRows }, { data: textPosts }] = await Promise.all([
        supabase
          .from("profiles")
          .select("id,username,display_name,account_type")
          .or(`username.ilike.%${q}%,display_name.ilike.%${q}%`)
          .limit(20),
        supabase
          .from("posts")
          .select(
            "id,author_id,title,body,tags,post_type,cover_image_url,created_at,like_count,comment_count,rating_avg"
          )
          .or(`title.ilike.%${q}%,tags.cs.{${q}},tags.cs.{${q.toLowerCase()}},tags.cs.{${q.toUpperCase()}}`)
          .limit(30),
      ]);
      setUsers(userRows ?? []);
      const postRows = textPosts ?? [];
      setPosts(postRows);

      // Load authors for PostCardV3.
      const authorIds = Array.from(new Set(postRows.map((p: any) => p.author_id).filter(Boolean)));
      const { data: authorProfiles } = authorIds.length
        ? await supabase
            .from("profiles")
            .select("id,username,display_name,account_type,bio,avatar_url")
            .in("id", authorIds)
        : { data: [] };
      setProfilesById(new Map((authorProfiles ?? []).map((p: any) => [p.id, p])));
    };
    void load();
  }, [q, supabase]);

  useEffect(() => {
    if (!user || posts.length === 0) {
      setLikedPosts(new Set());
      setRatedPosts({});
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

  return (
    <div className="min-h-screen bg-[#141414]">
      <Navbar />
      <main className="pt-20 max-w-5xl mx-auto px-4 pb-10">
        <h1 className="text-2xl mb-4">Search: {q || "..."}</h1>
        <div className="grid md:grid-cols-2 gap-4">
          <section>
            <h2 className="text-lg mb-2">Users</h2>
            <div className="space-y-2">
              {users.map((u) => (
                <Link key={u.id} href={`/profile/${u.username}`} className="block bg-[#1C1C1A] border border-[#27272A] rounded-lg p-3">
                  {u.display_name} <span className="text-[#A1A1AA]">@{u.username}</span>
                </Link>
              ))}
            </div>
          </section>
          <section>
            <h2 className="text-lg mb-2">Posts</h2>
            <div className="space-y-3">
              {posts.map((p) => {
                const author = profilesById.get(p.author_id);
                if (!author) return null;
                return (
                  <PostCardV3
                    key={p.id}
                    post={p}
                    author={author}
                    initialIsLiked={likedPosts.has(p.id)}
                    initialUserRating={ratedPosts[p.id] || 0}
                  />
                );
              })}
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}

export default function SearchPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#141414] pt-20 text-center text-[#A1A1AA]">Loading search...</div>}>
      <SearchPageContent />
    </Suspense>
  );
}
