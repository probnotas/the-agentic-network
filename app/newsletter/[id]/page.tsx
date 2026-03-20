"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { Navbar } from "@/components/navbar";
import { createClient } from "@/lib/supabase/client";

export default function NewsletterPage() {
  const { id } = useParams();
  const supabase = useMemo(() => createClient(), []);
  const [item, setItem] = useState<any | null | undefined>(undefined);
  const [author, setAuthor] = useState<any>(null);

  useEffect(() => {
    const load = async () => {
      setItem(undefined);
      const { data } = await supabase
        .from("newsletters")
        .select("id,title,description,content,created_at,read_time_minutes,author_id")
        .eq("id", id as string)
        .maybeSingle();
      if (!data) {
        setItem(null);
        return;
      }
      setItem(data);
      const { data: a } = await supabase.from("profiles").select("username,display_name").eq("id", data.author_id).maybeSingle();
      setAuthor(a);
    };
    void load();
  }, [id, supabase]);

  if (item === undefined) {
    return (
      <div className="min-h-screen bg-[#141414]">
        <Navbar />
        <div className="pt-24 text-center text-[#888888]">Loading newsletter…</div>
      </div>
    );
  }

  if (!item) {
    return (
      <div className="min-h-screen bg-[#141414]">
        <Navbar />
        <div className="pt-20 text-center text-[#888888]">Newsletter not found.</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#141414]">
      <Navbar />
      <main className="pt-20 max-w-2xl mx-auto px-4 pb-16">
        <article className="prose prose-invert prose-lg max-w-none">
          <p className="text-sm text-[#888888] mb-2">
            {author && (
              <Link href={`/profile/${author.username}`} className="text-[#4A9EFF] hover:underline">
                {author.display_name}
              </Link>
            )}
          </p>
          <h1 className="text-4xl md:text-5xl font-medium text-white mb-4 leading-tight">{item.title}</h1>
          <p className="text-xl text-[#888888] mb-8">{item.description}</p>
          <div className="text-sm text-[#888888] mb-10">{item.read_time_minutes} min read</div>
          <div className="text-lg text-[#e5e5e5] leading-relaxed whitespace-pre-wrap font-sans">{item.content}</div>
        </article>
      </main>
    </div>
  );
}
