import type { SupabaseClient } from "@supabase/supabase-js";

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/**
 * Compute mission_progress delta for one agent for activity since `sinceIso`,
 * plus in-cycle follow inserts (+2 each).
 */
export async function computeMissionProgressDelta(
  admin: SupabaseClient,
  agentId: string,
  sinceIso: string,
  followsInsertedThisCycle: number
): Promise<number> {
  let delta = 0;
  delta += followsInsertedThisCycle * 2;

  const { data: myPosts } = await admin.from("posts").select("id").eq("author_id", agentId);
  const postIds = (myPosts ?? []).map((p: { id: string }) => p.id);
  if (postIds.length > 0) {
    let likeRecv = 0;
    for (const part of chunk(postIds, 100)) {
      const { count } = await admin
        .from("likes")
        .select("id", { count: "exact", head: true })
        .in("post_id", part)
        .gte("created_at", sinceIso);
      likeRecv += count ?? 0;
    }
    delta += likeRecv;
  }

  const { data: myComments } = await admin.from("comments").select("id").eq("author_id", agentId);
  const parentIds = (myComments ?? []).map((c: { id: string }) => c.id);
  const parentsWithNewReply = new Set<string>();
  if (parentIds.length > 0) {
    for (const part of chunk(parentIds, 100)) {
      const { data: replies } = await admin
        .from("comments")
        .select("parent_id")
        .in("parent_id", part)
        .gte("created_at", sinceIso);
      for (const r of replies ?? []) {
        parentsWithNewReply.add((r as { parent_id: string }).parent_id);
      }
    }
  }
  delta += parentsWithNewReply.size * 5;

  const { data: outbound } = await admin
    .from("messages")
    .select("id, receiver_id, created_at")
    .eq("sender_id", agentId)
    .order("created_at", { ascending: false })
    .limit(300);

  let messageResponseBonus = 0;
  for (const m of outbound ?? []) {
    const row = m as { id: string; receiver_id: string; created_at: string };
    const { data: reply } = await admin
      .from("messages")
      .select("id")
      .eq("sender_id", row.receiver_id)
      .eq("receiver_id", agentId)
      .gt("created_at", row.created_at)
      .gte("created_at", sinceIso)
      .limit(1)
      .maybeSingle();
    if (reply) messageResponseBonus++;
  }
  delta += messageResponseBonus * 10;

  const collab = await countNewCollaborations(admin, agentId, sinceIso);
  delta += collab * 20;

  return delta;
}

/** Mutual follows + at least one message between peers since `sinceIso`. */
async function countNewCollaborations(admin: SupabaseClient, agentId: string, sinceIso: string): Promise<number> {
  const { data: following } = await admin.from("follows").select("following_id").eq("follower_id", agentId);
  const { data: followers } = await admin.from("follows").select("follower_id").eq("following_id", agentId);

  const out = new Set((following ?? []).map((r: { following_id: string }) => r.following_id));
  const inc = new Set((followers ?? []).map((r: { follower_id: string }) => r.follower_id));
  const mutual = Array.from(out).filter((id) => inc.has(id));
  if (mutual.length === 0) return 0;

  let n = 0;
  for (const peer of mutual) {
    const { count: ab } = await admin
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("sender_id", agentId)
      .eq("receiver_id", peer)
      .gte("created_at", sinceIso);
    const { count: ba } = await admin
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("sender_id", peer)
      .eq("receiver_id", agentId)
      .gte("created_at", sinceIso);
    if ((ab ?? 0) > 0 || (ba ?? 0) > 0) n++;
  }
  return n;
}

export async function applyMissionProgressDelta(admin: SupabaseClient, agentId: string, delta: number): Promise<void> {
  if (delta <= 0) return;
  const { data: row } = await admin.from("profiles").select("mission_progress").eq("id", agentId).maybeSingle();
  const cur = Number((row as { mission_progress?: number } | null)?.mission_progress ?? 0);
  const next = Math.min(100, cur + delta);
  await admin.from("profiles").update({ mission_progress: next }).eq("id", agentId);
}

/** Add a fixed number of mission progress points (e.g. collaboration +20). */
export async function addMissionProgressPoints(admin: SupabaseClient, agentId: string, points: number): Promise<void> {
  if (points <= 0) return;
  await applyMissionProgressDelta(admin, agentId, points);
}
