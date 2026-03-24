import { NextResponse } from "next/server";
import { createClient as createServerUserClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { engagementSchemaHint, isColumnSchemaCacheError, isMissingRelationError } from "@/lib/supabase-relation-errors";
import type { LikeNewsResponse } from "@/lib/news-feed-types";

export const dynamic = "force-dynamic";

function parseAnonSessionId(req: Request): string | null {
  const header = req.headers.get("x-anon-session-id")?.trim();
  if (!header) return null;
  return header.slice(0, 120);
}

export async function POST(req: Request, { params }: { params: { id: string } }) {
  if (process.env.NEWS_SKIP_ENGAGEMENT === "1" || process.env.NEWS_SKIP_ENGAGEMENT === "true") {
    return NextResponse.json(
      { error: "Likes are disabled on this deployment (NEWS_SKIP_ENGAGEMENT)." },
      { status: 503 }
    );
  }

  const articleId = params.id;

  const [userRes, articleRes] = await Promise.all([
    createServerUserClient().then((supa) => supa.auth.getUser()).catch(() => ({ data: { user: null } })),
    createServiceRoleClient()
      .from("news_posts")
      .select("id")
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
    return NextResponse.json({ error: "Sign in or allow anonymous session (x-anon-session-id) to like" }, { status: 401 });
  }

  const likerKey = userId ? `user:${userId}` : `anon:${anonSessionId}`;
  const admin = createServiceRoleClient();

  const { data: existing, error: selErr } = await admin
    .from("news_post_likes")
    .select("id")
    .eq("news_post_id", articleId)
    .eq("liker_key", likerKey)
    .maybeSingle();

  if (selErr) {
    if (isMissingRelationError(selErr)) {
      return NextResponse.json(
        {
          error:
            "Table news_post_likes is missing. Run supabase/migrations/20260331_news_post_likes.sql in Supabase, then reload schema.",
        },
        { status: 503 }
      );
    }
    if (isColumnSchemaCacheError(selErr)) {
      return NextResponse.json({ error: selErr.message, hint: engagementSchemaHint() }, { status: 500 });
    }
    return NextResponse.json({ error: selErr.message }, { status: 500 });
  }

  const wasLiked = Boolean(existing?.id);

  if (wasLiked) {
    const { error: delErr } = await admin
      .from("news_post_likes")
      .delete()
      .eq("news_post_id", articleId)
      .eq("liker_key", likerKey);
    if (delErr) {
      if (isMissingRelationError(delErr)) {
        return NextResponse.json({ error: "news_post_likes table missing (see migration 20260331)." }, { status: 503 });
      }
      if (isColumnSchemaCacheError(delErr)) {
        return NextResponse.json({ error: delErr.message, hint: engagementSchemaHint() }, { status: 500 });
      }
      return NextResponse.json({ error: delErr.message }, { status: 500 });
    }
  } else {
    const { error: insErr } = await admin.from("news_post_likes").insert({
      news_post_id: articleId,
      user_id: userId,
      anon_session_id: userId ? null : anonSessionId,
      liker_key: likerKey,
    });
    if (insErr) {
      if (isMissingRelationError(insErr)) {
        return NextResponse.json({ error: "news_post_likes table missing (see migration 20260331)." }, { status: 503 });
      }
      if (isColumnSchemaCacheError(insErr)) {
        return NextResponse.json({ error: insErr.message, hint: engagementSchemaHint() }, { status: 500 });
      }
      return NextResponse.json({ error: insErr.message }, { status: 500 });
    }
  }

  const { data: postRow, error: upErr } = await admin.from("news_posts").select("upvotes").eq("id", articleId).maybeSingle();
  if (upErr) {
    return NextResponse.json({ error: upErr.message }, { status: 500 });
  }

  const out: LikeNewsResponse = {
    articleId,
    liked: !wasLiked,
    likeCount: Number(postRow?.upvotes ?? 0),
  };
  return NextResponse.json(out);
}
