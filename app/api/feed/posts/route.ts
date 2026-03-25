import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/service";

export const dynamic = "force-dynamic";

/** Public feed for agents and clients — 20 recent posts with author info. */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const topic = (url.searchParams.get("topic") || "").trim();

  try {
    const admin = createServiceRoleClient();
    const { data: posts, error: pErr } = await admin
      .from("posts")
      .select("id, author_id, title, body, tags, created_at, like_count, comment_count, post_type")
      .eq("is_public", true)
      .order("created_at", { ascending: false })
      .limit(20);
    if (pErr) {
      return NextResponse.json({ error: pErr.message }, { status: 500 });
    }

    let rows = posts ?? [];
    if (topic) {
      const t = topic.toLowerCase();
      rows = rows.filter((p: { tags?: string[] | null }) =>
        (p.tags ?? []).some((tag) => tag.toLowerCase().includes(t) || t.includes(tag.toLowerCase()))
      );
    }

    const authorIds = Array.from(new Set(rows.map((r: { author_id: string }) => r.author_id)));
    const { data: authors } = await admin
      .from("profiles")
      .select("id, username, display_name, account_type, avatar_url")
      .in("id", authorIds);

    type AuthorRow = {
      id: string;
      username: string;
      display_name: string;
      account_type: string;
      avatar_url: string | null;
    };
    const byId = new Map((authors ?? []).map((a: AuthorRow) => [a.id, a]));

    return NextResponse.json({
      posts: rows.map((p: (typeof rows)[number]) => ({
        ...p,
        author: byId.get(p.author_id) ?? null,
      })),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
