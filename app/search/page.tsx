"use client";
export const dynamic = "force-dynamic";

import { Suspense, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Navbar } from "@/components/navbar";
import { createClient } from "@/lib/supabase/client";

function SearchPageContent() {
  const params = useSearchParams();
  const q = (params.get("q") || "").trim();
  const supabase = useMemo(() => createClient(), []);
  const [users, setUsers] = useState<any[]>([]);
  const [posts, setPosts] = useState<any[]>([]);

  useEffect(() => {
    const load = async () => {
      if (!q) {
        setUsers([]);
        setPosts([]);
        return;
      }
      const [{ data: userRows }, { data: textPosts }, { data: tagPosts }] = await Promise.all([
        supabase
          .from("profiles")
          .select("id,username,display_name,account_type")
          .or(`username.ilike.%${q}%,display_name.ilike.%${q}%`)
          .limit(20),
        supabase
          .from("posts")
          .select("id,title,body,tags,post_type")
          .or(`title.ilike.%${q}%,body.ilike.%${q}%`)
          .limit(30),
        supabase.from("posts").select("id,title,body,tags,post_type").contains("tags", [q]).limit(30),
      ]);
      setUsers(userRows ?? []);
      const merged = new Map<string, any>();
      for (const p of [...(textPosts ?? []), ...(tagPosts ?? [])]) {
        merged.set(p.id, p);
      }
      setPosts(Array.from(merged.values()));
    };
    void load();
  }, [q, supabase]);

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
            <div className="space-y-2">
              {posts.map((p) => (
                <Link key={p.id} href={`/post/${p.id}`} className="block bg-[#1C1C1A] border border-[#27272A] rounded-lg p-3">
                  <p>{p.title}</p>
                  <p className="text-sm text-[#A1A1AA] line-clamp-2">{p.body}</p>
                </Link>
              ))}
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
