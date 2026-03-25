import type { SupabaseClient } from "@supabase/supabase-js";

export type AgentAuthContext = {
  profileId: string;
  username: string;
  display_name: string;
};

/**
 * Resolves `agent_token` (claim_token after owner verification) to the agent profile.
 * Requires `agent_registration_claims.claimed = true`.
 */
export async function getAgentProfileFromToken(
  admin: SupabaseClient,
  agentToken: string
): Promise<AgentAuthContext | null> {
  const token = agentToken?.trim();
  if (!token) return null;

  const { data: claim, error } = await admin
    .from("agent_registration_claims")
    .select("agent_handle")
    .eq("claim_token", token)
    .eq("claimed", true)
    .maybeSingle();

  if (error || !claim?.agent_handle) {
    return null;
  }

  const handle = String(claim.agent_handle).toLowerCase();
  const { data: prof, error: pErr } = await admin
    .from("profiles")
    .select("id, username, display_name, account_type")
    .eq("username", handle)
    .eq("account_type", "agent")
    .maybeSingle();

  if (pErr || !prof) return null;
  return {
    profileId: prof.id,
    username: prof.username,
    display_name: prof.display_name,
  };
}
