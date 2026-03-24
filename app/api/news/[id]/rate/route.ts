import { NextResponse } from "next/server";
import { createClient as createServerUserClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { computeNewsScore, computeRatingScore, computeRecencyScore } from "@/lib/news-ranking";
import { aggregateRatingsByArticle } from "@/lib/news-ratings";
import { engagementSchemaHint, isColumnSchemaCacheError, isMissingRelationError } from "@/lib/supabase-relation-errors";
import type { RateNewsRequest, RateNewsResponse } from "@/lib/news-feed-types";

export const dynamic = "force-dynamic";

function parseAnonSessionId(req: Request): string | null {
  const header = req.headers.get("x-anon-session-id")?.trim();
  if (!header) return null;
  return header.slice(0, 120);
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  if (process.env.NEWS_SKIP_ENGAGEMENT === "1" || process.env.NEWS_SKIP_ENGAGEMENT === "true") {
    return NextResponse.json(
      { error: "Star ratings are disabled on this deployment (NEWS_SKIP_ENGAGEMENT)." },
      { status: 503 }
    );
  }

  const articleId = params.id;
  let body: RateNewsRequest;
  try {
    body = (await req.json()) as RateNewsRequest;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const rating = Number(body.rating);
  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    return NextResponse.json({ error: "rating must be an integer between 1 and 5" }, { status: 400 });
  }

  const [userRes, articleRes] = await Promise.all([
    createServerUserClient().then((supa) => supa.auth.getUser()).catch(() => ({ data: { user: null } })),
    createServiceRoleClient()
      .from("news_posts")
      .select("id,created_at")
      .eq("id", articleId)
      .maybeSingle(),
  ]);
  if (articleRes.error) {
    return NextResponse.json({ error: articleRes.error.message }, { status: 500 });
  }
  if (!articleRes.data) {
    return NextResponse.json({ error: "Article not found" }, { status: 404 });
  }

  const userId = userRes?.data?.user?.id ?? null;
  const anonSessionId = parseAnonSessionId(req);
  if (!userId && !anonSessionId) {
    return NextResponse.json({ error: "Sign in or provide anon session id to rate" }, { status: 401 });
  }

  const raterKey = userId ? `user:${userId}` : `anon:${anonSessionId}`;
  const admin = createServiceRoleClient();
  const { error: upsertError } = await admin.from("news_ratings").upsert(
    {
      article_id: articleId,
      user_id: userId,
      anon_session_id: userId ? null : anonSessionId,
      rater_key: raterKey,
      rating,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "article_id,rater_key" }
  );
  if (upsertError) {
    console.error("[/api/news/:id/rate POST] upsert failed", upsertError.message);
    if (isMissingRelationError(upsertError)) {
      return NextResponse.json(
        {
          error:
            "Table news_ratings is missing. Run supabase/migrations/20260330_news_ratings.sql in your Supabase project, then reload schema.",
        },
        { status: 503 }
      );
    }
    if (isColumnSchemaCacheError(upsertError)) {
      return NextResponse.json({ error: upsertError.message, hint: engagementSchemaHint() }, { status: 500 });
    }
    return NextResponse.json({ error: upsertError.message }, { status: 500 });
  }

  const { data: allRows, error: aggErr } = await admin
    .from("news_ratings")
    .select("article_id,rating")
    .eq("article_id", articleId);
  if (aggErr) {
    if (isMissingRelationError(aggErr)) {
      return NextResponse.json(
        { error: "news_ratings table missing after write — run migration 20260330 and reload schema." },
        { status: 503 }
      );
    }
    if (isColumnSchemaCacheError(aggErr)) {
      return NextResponse.json({ error: aggErr.message, hint: engagementSchemaHint() }, { status: 500 });
    }
    return NextResponse.json({ error: aggErr.message }, { status: 500 });
  }

  const agg = aggregateRatingsByArticle((allRows ?? []) as Array<{ article_id: string; rating: number }>).get(articleId);
  const avg = Number(agg?.averageRating ?? 0);
  const cnt = Number(agg?.ratingCount ?? 0);
  const recency = computeRecencyScore(articleRes.data.created_at);
  const score = computeNewsScore(recency, computeRatingScore(avg, cnt));

  const out: RateNewsResponse = {
    articleId,
    averageRating: Math.round(avg * 100) / 100,
    ratingCount: cnt,
    score,
    userRating: rating,
  };
  return NextResponse.json(out);
}
