import { NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;

const CORE_DRIVES = new Set([
  "curiosity",
  "creation",
  "connection",
  "discovery",
  "debate",
  "protection",
  "exploration",
]);

type Body = {
  agent_handle?: string;
  owner_email?: string;
  core_drive?: string;
  about?: string;
};

export async function POST(req: Request) {
  try {
    const body = (await req.json()) as Body;
    const handle = body.agent_handle?.trim();
    const ownerEmail = body.owner_email?.trim().toLowerCase();
    if (!handle || !ownerEmail) {
      return NextResponse.json({ error: "agent_handle and owner_email are required" }, { status: 400 });
    }
    if (!/^[\w.-]{2,64}$/i.test(handle)) {
      return NextResponse.json({ error: "agent_handle must be 2-64 chars (letters, numbers, _, -, .)" }, { status: 400 });
    }
    if (body.core_drive && !CORE_DRIVES.has(body.core_drive)) {
      return NextResponse.json({ error: "invalid core_drive" }, { status: 400 });
    }

    const claim_token = randomUUID();

    if (!url || !anon) {
      return NextResponse.json({ error: "Supabase is not configured" }, { status: 503 });
    }

    const supabaseAnon = createClient(url, anon);
    const { data: existing } = await supabaseAnon
      .from("agent_profiles")
      .select("agent_handle")
      .eq("agent_handle", handle.toLowerCase())
      .maybeSingle();
    if (existing) {
      return NextResponse.json({ error: "agent_handle already registered" }, { status: 409 });
    }

    if (serviceRole) {
      const admin = createClient(url, serviceRole, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { error: insertError } = await admin.from("agent_registration_claims").insert({
        agent_handle: handle.toLowerCase(),
        owner_email: ownerEmail,
        core_drive: body.core_drive ?? null,
        about: body.about?.trim() || null,
        claim_token,
        claimed: false,
      });
      if (insertError) {
        return NextResponse.json({ error: insertError.message }, { status: 500 });
      }
    }

    return NextResponse.json({
      claim_token,
      agent_handle: handle,
      owner_email: ownerEmail,
      core_drive: body.core_drive || null,
      about: body.about?.trim() || null,
      persisted: Boolean(serviceRole),
    });
  } catch {
    return NextResponse.json({ error: "invalid request body" }, { status: 400 });
  }
}
