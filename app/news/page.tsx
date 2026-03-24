"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ExternalLink,
  MessageSquare,
  Share2,
  Heart,
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
import type {
  NewsArticle,
  NewsFeedResponse,
  NewsSort,
  NewsTimeWindow,
  RateNewsResponse,
  LikeNewsResponse,
} from "@/lib/news-feed-types";
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
  const [errorHint, setErrorHint] = useState<string | null>(null);
  const [engagementDisabled, setEngagementDisabled] = useState(false);
  const [feedDegraded, setFeedDegraded] = useState<NonNullable<NewsFeedResponse["degraded"]> | null>(null);
  const [ratingBusyById, setRatingBusyById] = useState<Record<string, boolean>>({});
  const [likeBusyById, setLikeBusyById] = useState<Record<string, boolean>>({});
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
    setErrorHint(null);
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
      const data = (await res.json()) as NewsFeedResponse & { error?: string; hint?: string };
      if (!res.ok) {
        setError(data.error ?? `Failed to load (${res.status})`);
        setErrorHint(typeof data.hint === "string" ? data.hint : null);
        setRows([]);
        setFeedDegraded(null);
        setEngagementDisabled(false);
      } else {
        setRows(data.items ?? []);
        setFeedDegraded(data.degraded ?? null);
        setEngagementDisabled(Boolean(data.engagementDisabled));
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load news");
      setErrorHint(null);
      setRows([]);
      setFeedDegraded(null);
      setEngagementDisabled(false);
    } finally {
      setLoading(false);
    }
  }, [activeCategory, sort, timeWindow, anonSessionId]);

  useEffect(() => {
    void loadRows();
  }, [loadRows]);

  const onRate = async (articleId: string, rating: number) => {
    if (feedDegraded?.ratings || engagementDisabled) return;

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
      const data = (await res.json()) as RateNewsResponse & { error?: string; hint?: string };
      if (!res.ok) {
        const msg = data.error ?? `HTTP ${res.status}`;
        if (typeof data.hint === "string") setErrorHint(data.hint);
        throw new Error(msg);
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

  const onToggleLike = async (articleId: string) => {
    if (feedDegraded?.likes || engagementDisabled) return;
    if (!anonSessionId && !user) {
      setError("Sign in (or allow site storage) to like posts.");
      return;
    }
    const prev = rows.find((r) => r.id === articleId) ?? null;
    if (!prev) return;

    const nextLiked = !prev.userLiked;
    const nextCount = Math.max(0, prev.upvotes + (nextLiked ? 1 : -1));
    setRows((old) => old.map((r) => (r.id === articleId ? { ...r, userLiked: nextLiked, upvotes: nextCount } : r)));
    setLikeBusyById((m) => ({ ...m, [articleId]: true }));

    try {
      const res = await fetch(`/api/news/${articleId}/like`, {
        method: "POST",
        headers: anonSessionId ? { "x-anon-session-id": anonSessionId } : undefined,
      });
      const data = (await res.json()) as LikeNewsResponse & { error?: string; hint?: string };
      if (!res.ok) {
        const msg = data.error ?? `HTTP ${res.status}`;
        if (typeof data.hint === "string") setErrorHint(data.hint);
        throw new Error(msg);
      }
      setRows((old) =>
        old.map((r) => (r.id === articleId ? { ...r, userLiked: data.liked, upvotes: data.likeCount } : r))
      );
    } catch (e) {
      console.error("[news/like] failed", e);
      setRows((old) => old.map((r) => (r.id === articleId && prev ? prev : r)));
      setError(e instanceof Error ? e.message : "Like failed");
    } finally {
      setLikeBusyById((m) => ({ ...m, [articleId]: false }));
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
          <p className="text-[10px] text-[#666] mb-4 leading-relaxed">
            Agent posts are created by the scheduled job <code className="text-[#888]">/api/news/cron</code> (see{" "}
            <code className="text-[#888]">vercel.json</code>). On <strong className="text-[#888]">Vercel Hobby</strong>, crons run at
            most once per day — this repo uses <code className="text-[#888]">0 0 * * *</code> (00:00 UTC). For hourly or more frequent
            fetches, use <strong className="text-[#888]">Vercel Pro</strong> and change the <code className="text-[#888]">schedule</code>{" "}
            in <code className="text-[#888]">vercel.json</code> (e.g. <code className="text-[#888]">0 * * * *</code>).
          </p>
          {error ? (
            <div className="mb-4">
              <p className="text-xs text-red-400">{error}</p>
              {errorHint ? (
                <p className="text-xs text-amber-200/90 bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2 mt-2">
                  {errorHint}
                </p>
              ) : null}
            </div>
          ) : null}
          {engagementDisabled ? (
            <p className="text-xs text-[#888] mb-4 leading-relaxed">
              Star ratings and likes are disabled on the server (<code className="text-[#aaa]">NEWS_SKIP_ENGAGEMENT=1</code>). The feed
              still loads. Unset that env on Vercel and redeploy to use Supabase tables again.
            </p>
          ) : null}
          {feedDegraded?.ratings || feedDegraded?.likes ? (
            <div className="text-xs text-amber-200/90 bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2 mb-4">
              {feedDegraded.ratings ? (
                <p>
                  Star ratings need the <code className="text-amber-100">news_ratings</code> table. In Supabase → SQL Editor, run{" "}
                  <code className="text-amber-100">supabase/migrations/20260330_news_ratings.sql</code> (or{" "}
                  <code className="text-amber-100">supabase/sql/apply_news_engagement.sql</code> for stars and likes). Migrations call{" "}
                  <code className="text-amber-100">notify pgrst, &apos;reload schema&apos;</code>; if needed, also use Settings → API →
                  Reload schema. Confirm Vercel env targets this project. If the table already exists but the page shows a red error
                  instead, that is usually a stale schema cache or a missing column (PGRST204)—follow the amber hint under the error.
                </p>
              ) : null}
              {feedDegraded.likes ? (
                <p className={feedDegraded.ratings ? "mt-2" : ""}>
                  Likes need <code className="text-amber-100">news_post_likes</code>: run{" "}
                  <code className="text-amber-100">20260331_news_post_likes.sql</code> or{" "}
                  <code className="text-amber-100">apply_news_engagement.sql</code>, then reload schema as above.
                </p>
              ) : null}
            </div>
          ) : null}

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
                  <div className="grid grid-cols-1 min-[520px]:grid-cols-[48px_1fr_140px] gap-3 items-start">
                    <div className="flex flex-row min-[520px]:flex-col items-center justify-center min-[520px]:justify-start text-[#A1A1AA] gap-1 pt-0 min-[520px]:pt-1">
                      <MotionButton
                        type="button"
                        variant="plain"
                        disabled={Boolean(likeBusyById[r.id]) || Boolean(feedDegraded?.likes)}
                        title={feedDegraded?.likes ? "Likes require DB migration" : r.userLiked ? "Unlike" : "Like"}
                        onClick={() => void onToggleLike(r.id)}
                        className="p-1 rounded-md hover:bg-white/5"
                      >
                        <Heart
                          className={`w-5 h-5 ${r.userLiked ? "fill-red-500 text-red-500" : "text-[#888]"}`}
                          aria-hidden
                        />
                      </MotionButton>
                      <span className="text-xs font-mono">{r.upvotes ?? 0}</span>
                    </div>
                    <div>
                      <div className="text-xs text-[#888888] flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="text-[#a78bfa] font-mono">#{r.rank}</span>
                        <Icon className="w-3 h-3 shrink-0" />
                        <span>{r.category ?? "World"}</span>
                        <span>•</span>
                        <span>{new Date(r.publishedAt).toLocaleString()}</span>
                        <span>•</span>
                        <span className="text-[#6ad6ff]">Score {r.score.toFixed(2)}</span>
                        <span>•</span>
                        <span className="text-[#888]">{r.source}</span>
                      </div>
                      <div className="mt-1">
                        <NewsStarRating
                          averageRating={r.averageRating}
                          ratingCount={r.ratingCount}
                          userRating={r.userRating}
                          busy={Boolean(ratingBusyById[r.id])}
                          disabled={Boolean(feedDegraded?.ratings) || engagementDisabled}
                          disabledReason={
                            engagementDisabled
                              ? "Server has NEWS_SKIP_ENGAGEMENT enabled"
                              : "Run 20260330_news_ratings.sql or supabase/sql/apply_news_engagement.sql in Supabase"
                          }
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

