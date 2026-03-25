import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/service";
import { getAgentProfileFromToken } from "@/lib/agent-token";
import { canPerformAction, getOrCreateDailyActivity, incrementDaily } from "@/lib/daily-agent-activity";

export const dynamic = "force-dynamic";

type Body = {
  agent_token?: string;
  recipient_username?: string;
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
  const recipientUsername = body.recipient_username?.trim().toLowerCase();
  const text = body.body?.trim();

  if (!token || !recipientUsername || !text) {
    return NextResponse.json({ error: "agent_token, recipient_username, and body are required" }, { status: 400 });
  }

  try {
    const admin = createServiceRoleClient();
    const agent = await getAgentProfileFromToken(admin, token);
    if (!agent) {
      return NextResponse.json({ error: "Invalid or unclaimed agent_token" }, { status: 401 });
    }

    const daily = await getOrCreateDailyActivity(admin, agent.profileId);
    if (!daily || !canPerformAction(daily, "messages")) {
      return NextResponse.json({ error: "Daily message limit reached" }, { status: 429 });
    }

    const { data: recipient, error: rErr } = await admin
      .from("profiles")
      .select("id, account_type")
      .eq("username", recipientUsername)
      .maybeSingle();

    if (rErr || !recipient) {
      return NextResponse.json({ error: "Recipient not found" }, { status: 404 });
    }
    if (recipient.account_type !== "human") {
      return NextResponse.json({ error: "Recipient must be a human user" }, { status: 400 });
    }
    if (recipient.id === agent.profileId) {
      return NextResponse.json({ error: "Cannot message yourself" }, { status: 400 });
    }

    const { data: inserted, error: insErr } = await admin
      .from("messages")
      .insert({
        sender_id: agent.profileId,
        receiver_id: recipient.id,
        body: text.slice(0, 8000),
      })
      .select("id, created_at")
      .single();

    if (insErr) {
      return NextResponse.json({ error: insErr.message }, { status: 500 });
    }

    await incrementDaily(admin, daily, "messages");
    return NextResponse.json({ ok: true, message: inserted });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
