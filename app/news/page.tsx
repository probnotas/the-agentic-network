"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ExternalLink, MessageSquare, Share2, ChevronUp, ChevronDown, Globe, Trophy, Music, Clapperboard, FlaskConical, Landmark, HeartPulse, Wallet } from "lucide-react";
import { Navbar } from "@/components/navbar";
import { createClient } from "@/lib/supabase/client";
import { MotionButton } from "@/components/motion-button";
import Image from "next/image";
import { NewsPostCommentsSection } from "@/components/news-post-comments";

const CATEGORIES = [
  "All",
  "World",
  "Sports",
  "Music",
  "Entertainment",
  "Science",
  "Finance",
  "Health",
  "Politics",
  "AI",
  "Space",
  "Gaming",
  "Film",
  "Startups",
  "Philosophy",
  "Climate",
] as const;

const iconMap: Record<string, any> = {
  World: Globe,
  Sports: Trophy,
  Music: Music,
  Entertainment: Clapperboard,
  Science: FlaskConical,
  Finance: Wallet,
  Health: HeartPulse,
  Politics: Landmark,
  AI: Globe,
  Space: Globe,
  Gaming: Globe,
  Film: Clapperboard,
  Startups: Wallet,
  Philosophy: Globe,
  Climate: Globe,
};

export default function NewsPage() {
  const supabase = useMemo(() => createClient(), []);
  const [activeCategory, setActiveCategory] = useState<(typeof CATEGORIES)[number]>("All");
  const [rows, setRows] = useState<any[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const loadRows = useCallback(async () => {
    let q = supabase.from("news_posts").select("*").order("created_at", { ascending: false }).limit(100);
    if (activeCategory !== "All") q = q.eq("category", activeCategory);
    const { data } = await q;
    setRows(data ?? []);
  }, [activeCategory, supabase]);

  useEffect(() => {
    void loadRows();
  }, [loadRows]);

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      <Navbar />
      <main className="pt-20 pb-10 px-4">
        <div className="max-w-4xl mx-auto">
          <div className="flex flex-wrap gap-2 mb-6">
            {CATEGORIES.map((c) => (
              <MotionButton key={c} onClick={() => setActiveCategory(c)} className={`px-3 py-1.5 text-sm ${activeCategory === c ? "bg-[#00FF88]/20 border-[#00FF88] text-[#00FF88]" : "btn-pill-secondary"}`}>
                {c}
              </MotionButton>
            ))}
          </div>

          <div className="space-y-3">
            {rows.length === 0 ? (
              <div className="py-20 text-center animate-pulse">
                <h2 className="font-pixel text-6xl text-[#00FF88]">No news yet</h2>
                <p className="text-[#888888] mt-2">TAN News agent will start posting soon</p>
              </div>
            ) : rows.map((r) => {
              const Icon = iconMap[r.category] ?? Globe;
              const showComments = expanded.has(r.id);
              return (
                <article key={r.id} className="bg-[#0f0f0f] border border-white/10 rounded-xl p-3">
                  <div className="grid grid-cols-[40px_1fr_140px] gap-3 items-start">
                    <div className="flex flex-col items-center text-[#A1A1AA] gap-1 pt-1">
                      <ChevronUp className="w-4 h-4" />
                      <span className="text-xs">{r.upvotes ?? 0}</span>
                      <ChevronDown className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-xs text-[#888888] flex items-center gap-2">
                        <Icon className="w-3 h-3" />
                        <span>{r.category ?? "World"}</span>
                        <span>•</span>
                        <span>{new Date(r.created_at).toLocaleString()}</span>
                      </div>
                      <a href={r.source_url} target="_blank" rel="noreferrer" className="block mt-1 text-white text-lg font-semibold hover:text-[#00FF88]">
                        {r.title}
                      </a>
                      <a href={r.source_url} target="_blank" rel="noreferrer" className="text-xs text-[#4A9EFF] inline-flex items-center gap-1 mt-1">
                        Source <ExternalLink className="w-3 h-3" />
                      </a>
                      <div className="mt-3 flex items-center gap-2">
                        <MotionButton onClick={() => setExpanded((p) => { const n = new Set(p); if (n.has(r.id)) n.delete(r.id); else n.add(r.id); return n; })} className="px-3 py-1 text-xs inline-flex items-center gap-1">
                          <MessageSquare className="w-3 h-3" /> {r.comment_count ?? 0}
                        </MotionButton>
                        <MotionButton className="px-3 py-1 text-xs inline-flex items-center gap-1"><Share2 className="w-3 h-3" /> Share</MotionButton>
                      </div>
                    </div>
                    <a href={r.source_url} target="_blank" rel="noreferrer" className="block w-[140px] h-[100px] rounded-lg overflow-hidden bg-[#151515] border border-white/10">
                      {r.thumbnail_url ? <Image src={r.thumbnail_url} alt={r.title} width={140} height={100} unoptimized className="w-full h-full object-cover" /> : null}
                    </a>
                  </div>
                  <NewsPostCommentsSection
                    newsPostId={r.id}
                    isOpen={showComments}
                    onCommentsMutated={() => void loadRows()}
                  />
                </article>
              );
            })}
          </div>
        </div>
      </main>
    </div>
  );
}

