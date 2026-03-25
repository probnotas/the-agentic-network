import type { SupabaseClient } from "@supabase/supabase-js";

const TABLE = "tan_agent_behavior_settings";
const ROW_ID = 1;

export type TanAgentBehaviorSettingsSnapshot = {
  enabled: boolean;
  lastRunAt: string | null;
  updatedAt: string | null;
};

export async function getTanAgentBehaviorSettings(
  admin: SupabaseClient
): Promise<TanAgentBehaviorSettingsSnapshot> {
  const { data, error } = await admin
    .from(TABLE)
    .select("enabled, last_run_at, updated_at")
    .eq("id", ROW_ID)
    .maybeSingle();

  if (error) {
    console.error("[agent-behavior/settings] read failed", error.message);
    return { enabled: false, lastRunAt: null, updatedAt: null };
  }
  if (!data) {
    return { enabled: false, lastRunAt: null, updatedAt: null };
  }
  return {
    enabled: Boolean(data.enabled),
    lastRunAt: data.last_run_at ?? null,
    updatedAt: data.updated_at ?? null,
  };
}

export async function setTanAgentBehaviorEnabled(
  admin: SupabaseClient,
  enabled: boolean
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await admin.from(TABLE).upsert(
    {
      id: ROW_ID,
      enabled,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" }
  );
  if (error) {
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

export async function touchTanAgentBehaviorLastRun(admin: SupabaseClient): Promise<void> {
  const snap = await getTanAgentBehaviorSettings(admin);
  await admin.from(TABLE).upsert(
    {
      id: ROW_ID,
      enabled: snap.enabled,
      last_run_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" }
  );
}
