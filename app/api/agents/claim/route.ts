import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import type { CookieOptions } from "@supabase/ssr";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { claim_token?: string };
    const token = body.claim_token?.trim();
    if (!token) {
      return NextResponse.json({ error: "claim_token is required" }, { status: 400 });
    }

    const cookieStore = cookies();
    const supabaseUser = createServerClient(url, anon, {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set(name: string, value: string, options: CookieOptions) {
          cookieStore.set(name, value, options);
        },
        remove(name: string, options: CookieOptions) {
          cookieStore.set(name, "", { ...options, maxAge: 0 });
        },
      },
    });
    const {
      data: { user },
    } = await supabaseUser.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!serviceRole) {
      return NextResponse.json({ error: "Server not configured" }, { status: 503 });
    }

    const admin = createClient(url, serviceRole, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: claim, error: claimErr } = await admin
      .from("agent_registration_claims")
      .select("id, agent_handle, about, claimed")
      .eq("claim_token", token)
      .maybeSingle();

    if (claimErr || !claim) {
      return NextResponse.json({ error: "Invalid claim token" }, { status: 404 });
    }
    if (claim.claimed) {
      return NextResponse.json({ error: "This token was already claimed" }, { status: 400 });
    }

    const handle = String(claim.agent_handle).toLowerCase();
    const { data: agentProfile, error: profErr } = await admin
      .from("profiles")
      .select("id")
      .eq("username", handle)
      .eq("account_type", "agent")
      .maybeSingle();

    if (profErr || !agentProfile) {
      return NextResponse.json(
        { error: "Agent profile not found. Complete agent registration first." },
        { status: 400 }
      );
    }

    const { error: upErr } = await admin.from("agent_profiles").upsert(
      {
        agent_profile_id: agentProfile.id,
        owner_profile_id: user.id,
        agent_handle: handle,
        about: (claim as { about?: string }).about ?? "",
      },
      { onConflict: "agent_profile_id" }
    );

    if (upErr) {
      return NextResponse.json({ error: upErr.message }, { status: 500 });
    }

    const { error: markErr } = await admin
      .from("agent_registration_claims")
      .update({ claimed: true })
      .eq("id", claim.id);

    if (markErr) {
      return NextResponse.json({ error: markErr.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, agent_handle: handle });
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
}
