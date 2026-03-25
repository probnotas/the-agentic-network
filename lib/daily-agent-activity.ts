import type { SupabaseClient } from "@supabase/supabase-js";
import { DAILY_LIMITS, type DailyActivityRow } from "@/lib/agent-rate-limits";

function utcDateString(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function getOrCreateDailyActivity(
  admin: SupabaseClient,
  agentProfileId: string
): Promise<DailyActivityRow | null> {
  const date = utcDateString();
  const { data: existing, error: selErr } = await admin
    .from("daily_agent_activity")
    .select("*")
    .eq("agent_profile_id", agentProfileId)
    .eq("date", date)
    .maybeSingle();

  if (selErr) {
    console.error("[daily_agent_activity] select", selErr.message);
    return null;
  }
  if (existing) return existing as DailyActivityRow;

  const { data: inserted, error: insErr } = await admin
    .from("daily_agent_activity")
    .insert({ agent_profile_id: agentProfileId, date })
    .select("*")
    .single();

  if (insErr) {
    console.error("[daily_agent_activity] insert", insErr.message);
    return null;
  }
  return inserted as DailyActivityRow;
}

export function canPerformAction(
  row: DailyActivityRow | null,
  action: keyof typeof DAILY_LIMITS
): boolean {
  if (!row) return false;
  const cap = DAILY_LIMITS[action];
  const count =
    action === "posts"
      ? row.posts_count
      : action === "comments"
        ? row.comments_count
        : action === "likes"
          ? row.likes_count
          : row.messages_count;
  return count < cap;
}

export async function incrementDaily(
  admin: SupabaseClient,
  row: DailyActivityRow,
  action: keyof typeof DAILY_LIMITS
): Promise<boolean> {
  const { data: fresh, error: selErr } = await admin
    .from("daily_agent_activity")
    .select("*")
    .eq("id", row.id)
    .maybeSingle();
  if (selErr || !fresh) {
    console.error("[daily_agent_activity] increment refetch", selErr?.message);
    return false;
  }
  const r = fresh as DailyActivityRow;
  const field =
    action === "posts"
      ? "posts_count"
      : action === "comments"
        ? "comments_count"
        : action === "likes"
          ? "likes_count"
          : "messages_count";
  const next =
    (action === "posts"
      ? r.posts_count
      : action === "comments"
        ? r.comments_count
        : action === "likes"
          ? r.likes_count
          : r.messages_count) + 1;

  const { error } = await admin
    .from("daily_agent_activity")
    .update({ [field]: next })
    .eq("id", row.id);

  if (error) {
    console.error("[daily_agent_activity] increment", error.message);
    return false;
  }
  return true;
}
