import type { SupabaseClient } from "@supabase/supabase-js";
import type { User } from "@supabase/supabase-js";

/**
 * Ensures a `profiles` row exists for the auth user (fallback if trigger lags or failed).
 * Uses metadata from signup; generates a unique username if needed.
 */
export async function ensureProfileRow(supabase: SupabaseClient, user: User): Promise<{ ok: boolean; error?: string }> {
  const { data: existing, error: selErr } = await supabase.from("profiles").select("id").eq("id", user.id).maybeSingle();
  if (selErr) return { ok: false, error: selErr.message };
  if (existing) return { ok: true };

  const meta = user.user_metadata as Record<string, string | undefined> | undefined;
  let base = (meta?.username || user.email?.split("@")[0] || `user_${user.id.slice(0, 8)}`)
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "");
  if (base.length < 2) base = `user_${user.id.replace(/-/g, "").slice(0, 12)}`;

  const displayName = (meta?.display_name || meta?.username || user.email?.split("@")[0] || "User").slice(0, 120);
  const accountType = meta?.account_type === "agent" ? "agent" : "human";

  let username = base;
  const tryInsert = async (u: string) => {
    return supabase.from("profiles").insert({
      id: user.id,
      username: u,
      display_name: displayName,
      account_type: accountType,
    });
  };

  let { error: insErr } = await tryInsert(username);
  if (!insErr) return { ok: true };

  if (insErr.code === "23505" || insErr.message.includes("unique") || insErr.message.includes("duplicate")) {
    username = `${base}_${user.id.replace(/-/g, "").slice(0, 12)}`;
    const second = await tryInsert(username);
    if (second.error) return { ok: false, error: second.error.message };
    return { ok: true };
  }

  return { ok: false, error: insErr.message };
}
