"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ExternalLink,
  MessageSquare,
  Share2,
  ChevronUp,
  ChevronDown,
  Globe,
  Trophy,
  Music,
  Clapperboard,
  FlaskConical,
  Landmark,
  HeartPulse,
  Wallet,
} from "lucide-react";
import { Navbar } from "@/components/navbar";
import { MotionButton } from "@/components/motion-button";
import Image from "next/image";
import { NewsPostCommentsSection } from "@/components/news-post-comments";
import { NewsStarRating } from "@/components/news-star-rating";
import { useAuth } from "@/components/auth-provider";
import type { NewsArticle, NewsFeedResponse, NewsSort, NewsTimeWindow, RateNewsResponse } from "@/lib/news-feed-types";
import { computeNewsScore, computeRatingScore, computeRecencyScore } from "@/lib/news-ranking";

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
  const { user } = useAuth();
  const [activeCategory, setActiveCategory] = useState<(typeof CATEGORIES)[number]>("All");
  const [sort, setSort] = useState<NewsSort>("relevant");
  const [timeWindow, setTimeWindow] = useState<NewsTimeWindow>("7d");
  const [rows, setRows] = useState<NewsArticle[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ratingBusyById, setRatingBusyById] = useState<Record<string, boolean>>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const anonSessionId = useMemo(() => {
    if (typeof window === "undefined") return null;
    const key = "tan_news_anon_session";
    const existing = window.localStorage.getItem(key);
    if (existing) return existing;
    const id = `anon_${crypto.randomUUID()}`;
    window.localStorage.setItem(key, id);
    return id;
  }, []);

  const loadRows = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        page: "1",
        limit: "100",
        sort,
        timeWindow,
      });
      if (activeCategory !== "All") params.set("topic", activeCategory);
      const res = await fetch(`/api/news?${params.toString()}`, {
        headers: anonSessionId ? { "x-anon-session-id": anonSessionId } : undefined,
      });
      const data = (await res.json()) as NewsFeedResponse & { error?: string };
      if (!res.ok) {
        setError(data.error ?? `Failed to load (${res.status})`);
        setRows([]);
      } else {
        setRows(data.items ?? []);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load news");
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [activeCategory, sort, timeWindow, anonSessionId]);

  useEffect(() => {
    void loadRows();
  }, [loadRows]);

  const onRate = async (articleId: string, rating: number) => {
    const prev = rows.find((r) => r.id === articleId) ?? null;
    if (!prev) return;

    // Optimistic update: keeps UI snappy while network request runs.
    setRows((old) =>
      old.map((r) => {
        if (r.id !== articleId) return r;
        const previousUser = r.userRating;
        const nextCount = previousUser == null ? r.ratingCount + 1 : r.ratingCount;
        const nextAvg =
          previousUser == null
            ? (r.averageRating * r.ratingCount + rating) / Math.max(1, nextCount)
            : (r.averageRating * r.ratingCount - previousUser + rating) / Math.max(1, r.ratingCount);
        const score = computeNewsScore(computeRecencyScore(r.publishedAt), computeRatingScore(nextAvg, nextCount));
        return {
          ...r,
          userRating: rating,
          averageRating: Math.round(nextAvg * 100) / 100,
          ratingCount: nextCount,
          score,
        };
      })
    );
    setRatingBusyById((m) => ({ ...m, [articleId]: true }));

    try {
      const res = await fetch(`/api/news/${articleId}/rate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(anonSessionId ? { "x-anon-session-id": anonSessionId } : {}),
        },
        body: JSON.stringify({ rating }),
      });
      const data = (await res.json()) as RateNewsResponse & { error?: string };
      if (!res.ok) {
        throw new Error(data.error ?? `HTTP ${res.status}`);
      }
      setRows((old) =>
        old.map((r) =>
          r.id === articleId
            ? {
                ...r,
                averageRating: data.averageRating,
                ratingCount: data.ratingCount,
                score: data.score,
                userRating: data.userRating,
              }
            : r
        )
      );
    } catch (e) {
      console.error("[news/rate] failed", e);
      // Revert optimistic change when request fails.
      setRows((old) => old.map((r) => (r.id === articleId && prev ? prev : r)));
      setError(e instanceof Error ? e.message : "Rating failed");
    } finally {
      setRatingBusyById((m) => ({ ...m, [articleId]: false }));
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0a0a]">
      <Navbar />
      <main className="pt-20 pb-10 px-4">
        <div className="max-w-4xl mx-auto">
          <div className="flex flex-wrap gap-2 mb-4">
            {CATEGORIES.map((c) => (
              <MotionButton key={c} onClick={() => setActiveCategory(c)} className={`px-3 py-1.5 text-sm ${activeCategory === c ? "bg-[#00FF88]/20 border-[#00FF88] text-[#00FF88]" : "btn-pill-secondary"}`}>
                {c}
              </MotionButton>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2 mb-6">
            <MotionButton
              onClick={() => setSort("relevant")}
              className={`px-3 py-1.5 text-xs ${sort === "relevant" ? "bg-[#00FF88]/20 border-[#00FF88] text-[#00FF88]" : "btn-pill-secondary"}`}
            >
              Most Relevant
            </MotionButton>
            <MotionButton
              onClick={() => setSort("newest")}
              className={`px-3 py-1.5 text-xs ${sort === "newest" ? "bg-[#00FF88]/20 border-[#00FF88] text-[#00FF88]" : "btn-pill-secondary"}`}
            >
              Latest
            </MotionButton>
            <MotionButton
              onClick={() => setSort("top-rated")}
              className={`px-3 py-1.5 text-xs ${sort === "top-rated" ? "bg-[#00FF88]/20 border-[#00FF88] text-[#00FF88]" : "btn-pill-secondary"}`}
            >
              Top Rated
            </MotionButton>
            <select
              value={timeWindow}
              onChange={(e) => setTimeWindow(e.target.value as NewsTimeWindow)}
              className="ml-auto bg-[#151515] text-[#d4d4d4] border border-white/10 rounded-md px-2 py-1.5 text-xs"
              aria-label="Time window"
            >
              <option value="24h">Last 24 hours</option>
              <option value="7d">Last 7 days</option>
              <option value="30d">Last 30 days</option>
            </select>
          </div>
          {error ? <p className="text-xs text-red-400 mb-4">{error}</p> : null}

          <div className="space-y-3">
            {loading ? (
              <div className="py-20 text-center animate-pulse">
                <h2 className="font-pixel text-4xl text-[#00FF88]">Loading news…</h2>
              </div>
            ) : rows.length === 0 ? (
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
                        <span>{new Date(r.publishedAt).toLocaleString()}</span>
                        <span>•</span>
                        <span className="text-[#6ad6ff]">Score {r.score.toFixed(2)}</span>
                      </div>
                      <div className="mt-1">
                        <NewsStarRating
                          averageRating={r.averageRating}
                          ratingCount={r.ratingCount}
                          userRating={r.userRating}
                          busy={Boolean(ratingBusyById[r.id])}
                          onRate={(v) => void onRate(r.id, v)}
                        />
                      </div>
                      <a href={r.url} target="_blank" rel="noreferrer" className="block mt-1 text-white text-lg font-semibold hover:text-[#00FF88]">
                        {r.title}
                      </a>
                      {r.summary ? <p className="text-sm text-[#a0a0a0] mt-1">{r.summary}</p> : null}
                      <a href={r.url} target="_blank" rel="noreferrer" className="text-xs text-[#4A9EFF] inline-flex items-center gap-1 mt-1">
                        Source <ExternalLink className="w-3 h-3" />
                      </a>
                      <div className="mt-3 flex items-center gap-2">
                        <MotionButton onClick={() => setExpanded((p) => { const n = new Set(p); if (n.has(r.id)) n.delete(r.id); else n.add(r.id); return n; })} className="px-3 py-1 text-xs inline-flex items-center gap-1">
                          <MessageSquare className="w-3 h-3" /> {r.commentCount ?? 0}
                        </MotionButton>
                        <MotionButton className="px-3 py-1 text-xs inline-flex items-center gap-1"><Share2 className="w-3 h-3" /> Share</MotionButton>
                      </div>
                    </div>
                    <a href={r.url} target="_blank" rel="noreferrer" className="block w-[140px] h-[100px] rounded-lg overflow-hidden bg-[#151515] border border-white/10">
                      {r.imageUrl ? <Image src={r.imageUrl} alt={r.title} width={140} height={100} unoptimized className="w-full h-full object-cover" /> : null}
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

