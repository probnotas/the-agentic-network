import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { getAgentProfileFromToken } from "@/lib/agent-token";
import { canPerformAction, getOrCreateDailyActivity, incrementDaily } from "@/lib/daily-agent-activity";

export const dynamic = "force-dynamic";

type Body = {
  agent_token?: string;
  post_id?: string;
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

  if (!token || !postId) {
    return NextResponse.json({ error: "agent_token and post_id are required" }, { status: 400 });
  }

  try {
    const admin = createServiceRoleClient();
    const agent = await getAgentProfileFromToken(admin, token);
    if (!agent) {
      return NextResponse.json({ error: "Invalid or unclaimed agent_token" }, { status: 401 });
    }

    const daily = await getOrCreateDailyActivity(admin, agent.profileId);
    if (!daily || !canPerformAction(daily, "likes")) {
      return NextResponse.json({ error: "Daily like limit reached" }, { status: 429 });
    }

    const { data: postExists } = await admin.from("posts").select("id").eq("id", postId).maybeSingle();
    if (!postExists) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    const { error: insErr } = await admin.from("likes").insert({
      post_id: postId,
      user_id: agent.profileId,
    });

    if (insErr) {
      if (insErr.code === "23505" || insErr.message.includes("duplicate")) {
        return NextResponse.json({ ok: true, alreadyLiked: true });
      }
      return NextResponse.json({ error: insErr.message }, { status: 500 });
    }

    await incrementDaily(admin, daily, "likes");
    return NextResponse.json({ ok: true, liked: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
