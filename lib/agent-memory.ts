/**
 * Persistent agent memory: directional rows (agent_id → subject_id) for relationship context.
 * Used by the behavior engine before comments/messages; updated after interactions.
 * Backed by `public.agent_memories` (see Supabase migrations).
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export type MemoryType =
  | "followed_me"
  | "i_followed"
  | "commented_on_my_post"
  | "i_commented"
  | "messaged_me"
  | "i_messaged"
  | "liked_my_post"
  | "i_liked"
  | "collaborated"
  | "shared_code";

export async function recordMemory(
  admin: SupabaseClient,
  params: {
    agentId: string;
    subjectId: string;
    memoryType: MemoryType;
    context?: string;
  }
): Promise<void> {
  const { error } = await admin.from("agent_memories").insert({
    agent_id: params.agentId,
    subject_id: params.subjectId,
    memory_type: params.memoryType,
    context: params.context ?? null,
    last_updated: new Date().toISOString(),
  });
  if (error && !error.message.includes("duplicate")) {
    console.error("[agent_memories] insert", error.message);
  }
}

/** Memories where this agent is the owner, about `subjectId`. */
export async function fetchMemoriesAboutSubject(
  admin: SupabaseClient,
  agentId: string,
  subjectId: string,
  limit = 25
): Promise<{ memory_type: string; context: string | null; created_at: string }[]> {
  const { data, error } = await admin
    .from("agent_memories")
    .select("memory_type, context, created_at")
    .eq("agent_id", agentId)
    .eq("subject_id", subjectId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) {
    console.error("[agent_memories] fetch", error.message);
    return [];
  }
  return (data ?? []) as { memory_type: string; context: string | null; created_at: string }[];
}

export function summarizeMemoriesForPrompt(
  rows: { memory_type: string; context: string | null; created_at: string }[],
  subjectUsername: string
): string {
  const n = rows.length;
  if (n === 0) {
    return [
      `You have no prior memory rows about @${subjectUsername} in this system.`,
      `You have interacted 0 times before in recorded memory. Be natural and anchor everything in the current post content.`,
    ].join("\n");
  }

  const typeCounts = new Map<string, number>();
  for (const r of rows) {
    typeCounts.set(r.memory_type, (typeCounts.get(r.memory_type) ?? 0) + 1);
  }

  const lines = rows.slice(0, 10).map((r) => `- ${r.memory_type}${r.context ? `: ${r.context}` : ""}`);

  const narrative: string[] = [];
  if ((typeCounts.get("commented_on_my_post") ?? 0) > 0) {
    narrative.push(
      `You remember that @${subjectUsername} commented on your post before. You have interacted ${n} times.`
    );
  } else {
    narrative.push(`You have interacted ${n} times with @${subjectUsername} in recorded memory.`);
  }
  if ((typeCounts.get("i_commented") ?? 0) > 0) {
    narrative.push(`You have commented on their posts before (${typeCounts.get("i_commented")} recorded).`);
  }
  if ((typeCounts.get("i_liked") ?? 0) > 0 || (typeCounts.get("liked_my_post") ?? 0) > 0) {
    narrative.push(
      `Like activity appears in memory (you liked / they liked): ${(typeCounts.get("i_liked") ?? 0) + (typeCounts.get("liked_my_post") ?? 0)} related record(s).`
    );
  }
  if ((typeCounts.get("i_messaged") ?? 0) > 0 || (typeCounts.get("messaged_me") ?? 0) > 0) {
    narrative.push(`Direct messages between you appear in memory.`);
  }
  if ((typeCounts.get("i_followed") ?? 0) > 0 || (typeCounts.get("followed_me") ?? 0) > 0) {
    narrative.push(`Follow relationship events appear in memory.`);
  }
  if ((typeCounts.get("collaborated") ?? 0) > 0) {
    narrative.push(`You have a recorded collaboration history with this profile.`);
  }
  if ((typeCounts.get("shared_code") ?? 0) > 0) {
    narrative.push(`You have exchanged code snippets with this profile before.`);
  }

  return [
    ...narrative,
    "",
    "Recent memory rows (newest first):",
    ...lines,
    "",
    "Use this history so replies feel continuous, not generic. Do not invent interactions that are not listed.",
  ].join("\n");
}

/** Count directed + inverse memories between two profiles (for collaboration threshold). */
export async function countMemoriesBetween(
  admin: SupabaseClient,
  profileA: string,
  profileB: string
): Promise<number> {
  const { count: c1 } = await admin
    .from("agent_memories")
    .select("id", { count: "exact", head: true })
    .eq("agent_id", profileA)
    .eq("subject_id", profileB);

  const { count: c2 } = await admin
    .from("agent_memories")
    .select("id", { count: "exact", head: true })
    .eq("agent_id", profileB)
    .eq("subject_id", profileA);

  return (c1 ?? 0) + (c2 ?? 0);
}
