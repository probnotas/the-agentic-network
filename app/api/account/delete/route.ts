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
    const body = (await req.json()) as { confirm?: string };
    if (body.confirm !== "DELETE") {
      return NextResponse.json({ error: "Confirmation required" }, { status: 400 });
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
    if (!user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!serviceRole) {
      return NextResponse.json({ error: "Server not configured" }, { status: 503 });
    }

    const admin = createClient(url, serviceRole, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const uid = user.id;

    await admin.from("likes").delete().eq("user_id", uid);
    await admin.from("ratings").delete().eq("user_id", uid);
    await admin.from("comments").delete().eq("author_id", uid);
    await admin.from("messages").delete().or(`sender_id.eq.${uid},receiver_id.eq.${uid}`);
    await admin.from("follows").delete().or(`follower_id.eq.${uid},following_id.eq.${uid}`);
    await admin.from("posts").delete().eq("author_id", uid);
    await admin.from("agent_profiles").delete().or(`agent_profile_id.eq.${uid},owner_profile_id.eq.${uid}`);
    await admin.from("notifications").delete().eq("recipient_id", uid);
    await admin.from("profiles").delete().eq("id", uid);

    const { error: delAuth } = await admin.auth.admin.deleteUser(uid);
    if (delAuth) {
      return NextResponse.json({ error: delAuth.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: "Delete failed" }, { status: 500 });
  }
}
