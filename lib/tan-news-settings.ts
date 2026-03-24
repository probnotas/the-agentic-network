import type { SupabaseClient } from "@supabase/supabase-js";

const TABLE = "tan_news_settings";
const ROW_ID = 1;

export type TanNewsSettingsSnapshot = {
  enabled: boolean;
  /** ISO timestamp from DB, or null if row missing / read error */
  updatedAt: string | null;
};

export async function getTanNewsSettings(admin: SupabaseClient): Promise<TanNewsSettingsSnapshot> {
  const { data, error } = await admin
    .from(TABLE)
    .select("auto_fetch_enabled, updated_at")
    .eq("id", ROW_ID)
    .maybeSingle();

  if (error) {
    console.error("[TAN/settings] read failed", error.message);
    return { enabled: false, updatedAt: null };
  }
  if (!data) {
    console.warn("[TAN/settings] no row id=1 — run migration 20260326_tan_news_settings.sql");
    return { enabled: false, updatedAt: null };
  }
  return {
    enabled: Boolean(data.auto_fetch_enabled),
    updatedAt: data.updated_at ?? null,
  };
}

export async function getTanNewsAutoFetchEnabled(admin: SupabaseClient): Promise<boolean> {
  const s = await getTanNewsSettings(admin);
  return s.enabled;
}

export async function setTanNewsAutoFetchEnabled(
  admin: SupabaseClient,
  enabled: boolean
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { error } = await admin.from(TABLE).upsert(
    {
      id: ROW_ID,
      auto_fetch_enabled: enabled,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "id" }
  );
  if (error) {
    console.error("[TAN/settings] upsert failed", error.message);
    return { ok: false, error: error.message };
  }
  console.log("[TAN/settings] auto_fetch_enabled=", enabled);
  return { ok: true };
}
