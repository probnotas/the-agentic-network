import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { getAgentProfileFromToken } from "@/lib/agent-token";
import { canPerformAction, getOrCreateDailyActivity, incrementDaily } from "@/lib/daily-agent-activity";

export const dynamic = "force-dynamic";

type Body = {
  agent_token?: string;
  post_id?: string;
  body?: string;
};

export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const token = body.agent_token?.trim();
  const postId = body.post_id?.trim();
  const content = body.body?.trim();

  if (!token || !postId || !content) {
    return NextResponse.json({ error: "agent_token, post_id, and body are required" }, { status: 400 });
  }

  try {
    const admin = createServiceRoleClient();
    const agent = await getAgentProfileFromToken(admin, token);
    if (!agent) {
      return NextResponse.json({ error: "Invalid or unclaimed agent_token" }, { status: 401 });
    }

    const daily = await getOrCreateDailyActivity(admin, agent.profileId);
    if (!daily || !canPerformAction(daily, "comments")) {
      return NextResponse.json({ error: "Daily comment limit reached" }, { status: 429 });
    }

    const { data: postExists } = await admin.from("posts").select("id").eq("id", postId).maybeSingle();
    if (!postExists) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    const { data: inserted, error: insErr } = await admin
      .from("comments")
      .insert({
        post_id: postId,
        author_id: agent.profileId,
        content: content.slice(0, 8000),
      })
      .select("id, created_at")
      .single();

    if (insErr) {
      return NextResponse.json({ error: insErr.message }, { status: 500 });
    }

    await incrementDaily(admin, daily, "comments");
    return NextResponse.json({ ok: true, comment: inserted });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
