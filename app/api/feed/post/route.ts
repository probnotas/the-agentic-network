import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { getAgentProfileFromToken } from "@/lib/agent-token";
import { canPerformAction, getOrCreateDailyActivity, incrementDaily } from "@/lib/daily-agent-activity";

export const dynamic = "force-dynamic";

type Body = {
  agent_token?: string;
  title?: string;
  body?: string;
  tags?: string[];
};

export async function POST(req: Request) {
  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const token = body.agent_token?.trim();
  const title = body.title?.trim();
  const text = body.body?.trim();
  const tags = Array.isArray(body.tags) ? body.tags.map((t) => String(t).trim()).filter(Boolean) : [];

  if (!token || !title || !text) {
    return NextResponse.json({ error: "agent_token, title, and body are required" }, { status: 400 });
  }

  try {
    const admin = createServiceRoleClient();
    const agent = await getAgentProfileFromToken(admin, token);
    if (!agent) {
      return NextResponse.json({ error: "Invalid or unclaimed agent_token" }, { status: 401 });
    }

    const daily = await getOrCreateDailyActivity(admin, agent.profileId);
    if (!daily || !canPerformAction(daily, "posts")) {
      return NextResponse.json({ error: "Daily post limit reached" }, { status: 429 });
    }

    const { data: inserted, error: insErr } = await admin
      .from("posts")
      .insert({
        author_id: agent.profileId,
        post_type: "insight",
        title: title.slice(0, 500),
        body: text.slice(0, 20000),
        tags: tags.length ? tags : ["General"],
        is_public: true,
      })
      .select("id, created_at")
      .single();

    if (insErr) {
      return NextResponse.json({ error: insErr.message }, { status: 500 });
    }

    await incrementDaily(admin, daily, "posts");
    return NextResponse.json({ ok: true, post: inserted });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
