import { NextResponse } from "next/server";
import { createClient as createServerUserClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { computeNewsScore, computeRatingScore, computeRecencyScore } from "@/lib/news-ranking";
import { aggregateRatingsByArticle } from "@/lib/news-ratings";
import { engagementSchemaHint, isColumnSchemaCacheError, isMissingRelationError } from "@/lib/supabase-relation-errors";
import type { NewsArticle, NewsFeedResponse, NewsSort, NewsTimeWindow } from "@/lib/news-feed-types";

export const dynamic = "force-dynamic";

function toInt(value: string | null, fallback: number): number {
  if (!value) return fallback;
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.trunc(n);
}

function parseTimeWindow(v: string | null): NewsTimeWindow {
  if (v === "24h" || v === "7d" || v === "30d") return v;
  return "7d";
}

function parseSort(v: string | null): NewsSort {
  if (v === "newest" || v === "top-rated" || v === "relevant") return v;
  return "relevant";
}

function cutoffForWindow(window: NewsTimeWindow): Date {
  const now = Date.now();
  const ms = window === "24h" ? 24 * 3600 * 1000 : window === "7d" ? 7 * 24 * 3600 * 1000 : 30 * 24 * 3600 * 1000;
  return new Date(now - ms);
}

function parseAnonSessionId(req: Request): string | null {
  const header = req.headers.get("x-anon-session-id")?.trim();
  if (!header) return null;
  return header.slice(0, 120);
}

type NewsPostRow = {
  id: string;
  title: string;
  summary: string | null;
  source_url: string;
  thumbnail_url: string | null;
  created_at: string;
  category: string;
  upvotes: number;
  comment_count: number;
};

export async function GET(req: Request) {
  const url = new URL(req.url);
  const topic = (url.searchParams.get("topic") || "").trim() || null;
  const page = Math.max(1, toInt(url.searchParams.get("page"), 1));
  const limit = Math.max(1, Math.min(100, toInt(url.searchParams.get("limit"), 20)));
  const sort = parseSort(url.searchParams.get("sort"));
  const timeWindow = parseTimeWindow(url.searchParams.get("timeWindow"));
  const cutoffIso = cutoffForWindow(timeWindow).toISOString();
  const from = (page - 1) * limit;
  const to = from + limit - 1;

  const admin = createServiceRoleClient();
  let query = admin
    .from("news_posts")
    .select("id,title,summary,source_url,thumbnail_url,created_at,category,upvotes,comment_count", { count: "exact" })
    .gte("created_at", cutoffIso)
    .order("created_at", { ascending: false })
    .range(from, to);

  if (topic && topic.toLowerCase() !== "all") {
    query = query.eq("category", topic);
  }

  const [{ data, error, count }, userResult] = await Promise.all([
    query,
    createServerUserClient().then((supa) => supa.auth.getUser()).catch(() => ({ data: { user: null } })),
  ]);

  if (error) {
    console.error("[/api/news GET] news_posts query failed", error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (data ?? []) as NewsPostRow[];
  const ids = rows.map((r) => r.id);

  const userId = userResult?.data?.user?.id ?? null;
  const anonId = parseAnonSessionId(req);
  const likerKey = userId ? `user:${userId}` : anonId ? `anon:${anonId}` : null;

  const skipEngagement =
    process.env.NEWS_SKIP_ENGAGEMENT === "1" || process.env.NEWS_SKIP_ENGAGEMENT === "true";

  let ratingsMissing = false;
  let likesMissing = false;
  let ratingRows: Array<{ article_id: string; rating: number }> = [];
  const myRatingByArticle = new Map<string, number>();
  const myLikedArticles = new Set<string>();

  if (ids.length > 0) {
    const allRatingsRes = await admin.from("news_ratings").select("article_id,rating").in("article_id", ids);
    if (allRatingsRes.error) {
      if (isMissingRelationError(allRatingsRes.error)) {
        ratingsMissing = true;
        console.warn("[/api/news GET] news_ratings missing — stars disabled until migration 20260330");
      } else if (isColumnSchemaCacheError(allRatingsRes.error)) {
        console.error("[/api/news GET] news_ratings schema/cache mismatch", allRatingsRes.error.message);
        return NextResponse.json(
          { error: allRatingsRes.error.message, hint: engagementSchemaHint() },
          { status: 500 }
        );
      } else {
        console.error("[/api/news GET] ratings query failed", allRatingsRes.error.message);
        return NextResponse.json({ error: allRatingsRes.error.message }, { status: 500 });
      }
    } else {
      ratingRows = (allRatingsRes.data ?? []) as Array<{ article_id: string; rating: number }>;
    }

    if (!ratingsMissing && (userId || anonId)) {
      let q = admin.from("news_ratings").select("article_id,rating").in("article_id", ids).limit(500);
      if (userId) q = q.eq("user_id", userId);
      else q = q.eq("anon_session_id", anonId!);
      const ur = await q;
      if (ur.error) {
        if (isMissingRelationError(ur.error)) {
          ratingsMissing = true;
        } else if (isColumnSchemaCacheError(ur.error)) {
          console.error("[/api/news GET] user ratings schema/cache mismatch", ur.error.message);
          return NextResponse.json(
            { error: ur.error.message, hint: engagementSchemaHint() },
            { status: 500 }
          );
        } else {
          console.error("[/api/news GET] user ratings query failed", ur.error.message);
          return NextResponse.json({ error: ur.error.message }, { status: 500 });
        }
      } else {
        for (const r of (ur.data ?? []) as Array<{ article_id: string; rating: number }>) {
          myRatingByArticle.set(r.article_id, Number(r.rating));
        }
      }
    }

    if (likerKey) {
      const lr = await admin.from("news_post_likes").select("news_post_id").in("news_post_id", ids).eq("liker_key", likerKey);
      if (lr.error) {
        if (isMissingRelationError(lr.error)) {
          likesMissing = true;
          console.warn("[/api/news GET] news_post_likes missing — likes disabled until migration 20260331");
        } else if (isColumnSchemaCacheError(lr.error)) {
          console.error("[/api/news GET] news_post_likes schema/cache mismatch", lr.error.message);
          return NextResponse.json(
            { error: lr.error.message, hint: engagementSchemaHint() },
            { status: 500 }
          );
        } else {
          console.error("[/api/news GET] likes query failed", lr.error.message);
          return NextResponse.json({ error: lr.error.message }, { status: 500 });
        }
      } else {
        for (const row of lr.data ?? []) {
          myLikedArticles.add((row as { news_post_id: string }).news_post_id);
        }
      }
    }
  }

  const aggMap = ratingsMissing
    ? new Map<string, { averageRating: number; ratingCount: number }>()
    : aggregateRatingsByArticle(ratingRows);

  const items: NewsArticle[] = rows.map((r) => {
    const agg = aggMap.get(r.id) ?? { averageRating: 0, ratingCount: 0 };
    const recencyScore = computeRecencyScore(r.created_at);
    const ratingScore = computeRatingScore(agg.averageRating, agg.ratingCount);
    return {
      id: r.id,
      title: r.title,
      summary: r.summary,
      source: "The Guardian",
      url: r.source_url,
      publishedAt: r.created_at,
      imageUrl: r.thumbnail_url,
      rank: 0,
      score: computeNewsScore(recencyScore, ratingScore),
      averageRating: Math.round(agg.averageRating * 100) / 100,
      ratingCount: agg.ratingCount,
      userRating: skipEngagement || ratingsMissing ? null : myRatingByArticle.get(r.id) ?? null,
      category: r.category,
      upvotes: Number(r.upvotes ?? 0),
      userLiked: skipEngagement || likesMissing ? false : myLikedArticles.has(r.id),
      commentCount: Number(r.comment_count ?? 0),
    };
  });

  if (sort === "relevant") {
    items.sort((a, b) => b.score - a.score || +new Date(b.publishedAt) - +new Date(a.publishedAt));
  } else if (sort === "top-rated") {
    items.sort(
      (a, b) =>
        b.averageRating - a.averageRating ||
        b.ratingCount - a.ratingCount ||
        b.score - a.score ||
        +new Date(b.publishedAt) - +new Date(a.publishedAt)
    );
  } else {
    items.sort((a, b) => +new Date(b.publishedAt) - +new Date(a.publishedAt));
  }

  items.forEach((item, idx) => {
    item.rank = from + idx + 1;
  });

  const degraded =
    ratingsMissing || likesMissing
      ? { ...(ratingsMissing ? { ratings: true as const } : {}), ...(likesMissing ? { likes: true as const } : {}) }
      : undefined;

  const out: NewsFeedResponse = {
    items,
    page,
    limit,
    total: count ?? items.length,
    hasMore: (count ?? 0) > page * limit,
    sort,
    topic,
    timeWindow,
    degraded,
    ...(skipEngagement ? { engagementDisabled: true as const } : {}),
  };
  return NextResponse.json(out);
}
