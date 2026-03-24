import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AdminNetworkStats } from "./AdminNetworkStats";
import { AdminTanNews, type AgentRow } from "./AdminTanNews";
import { ADMIN_OWNER_EMAIL } from "@/lib/admin-config";
import { TAN_AGENT_USERNAMES } from "@/lib/guardian-api";

export default async function AdminPage() {
  const supabase = await createClient();

  const { data: userData, error: userError } = await supabase.auth.getUser();
  const user = userData.user;

  if (userError || !user || !user.email || user.email !== ADMIN_OWNER_EMAIL) {
    redirect("/feed");
  }

  const { data: statsData, error: statsError } = await supabase
    .from("network_stats")
    .select("*")
    .maybeSingle();

  const startOfUtcDay = new Date();
  startOfUtcDay.setUTCHours(0, 0, 0, 0);

  const { count: newsTodayCount } = await supabase
    .from("news_posts")
    .select("*", { count: "exact", head: true })
    .gte("created_at", startOfUtcDay.toISOString());

  const { data: profileRows } = await supabase
    .from("profiles")
    .select("id, username, display_name")
    .in("username", TAN_AGENT_USERNAMES);

  const byUser = new Map((profileRows ?? []).map((p) => [p.username, p]));

  const lastPosted = await Promise.all(
    TAN_AGENT_USERNAMES.map(async (username) => {
      const row = byUser.get(username);
      if (!row) {
        return { username, at: null as string | null };
      }
      const { data: np } = await supabase
        .from("news_posts")
        .select("created_at")
        .eq("posted_by", row.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      return { username, at: np?.created_at ?? null };
    })
  );

  const lastMap = new Map(lastPosted.map((x) => [x.username, x.at]));

  const { data: tanNewsSettings } = await supabase
    .from("tan_news_settings")
    .select("auto_fetch_enabled, updated_at")
    .eq("id", 1)
    .maybeSingle();

  const initialAgents: AgentRow[] = TAN_AGENT_USERNAMES.map((username) => {
    const p = byUser.get(username);
    return {
      username,
      display_name: p?.display_name ?? `(missing profile: ${username})`,
      lastPostedAt: lastMap.get(username) ?? null,
    };
  });

  const profilesFound = profileRows?.length ?? 0;
  const agentsTotal = TAN_AGENT_USERNAMES.length;

  return (
    <div
      style={{
        width: "100%",
        padding: "2rem",
        paddingBottom: "3rem",
        minHeight: "100vh",
        overflow: "visible",
        display: "flex",
        flexDirection: "column",
        gap: "2rem",
        boxSizing: "border-box",
      }}
    >
      <AdminNetworkStats initialStats={statsError ? null : statsData ?? null} error={statsError?.message ?? null} />

      {/* Server-rendered facts — visible even if client hydration fails */}
      <div
        data-admin-tan-summary
        style={{
          maxWidth: "72rem",
          marginLeft: "auto",
          marginRight: "auto",
          width: "100%",
          padding: "1rem 1.25rem",
          borderRadius: "12px",
          border: "2px solid #22C55E",
          backgroundColor: "rgba(34, 197, 94, 0.08)",
          color: "#fafafa",
          fontSize: "14px",
          lineHeight: 1.5,
        }}
      >
        <strong style={{ color: "#22C55E" }}>TAN News — server status</strong>
        <ul style={{ margin: "0.5rem 0 0", paddingLeft: "1.25rem" }}>
          <li>
            Agent profiles found in DB (usernames tan_*):{" "}
            <strong>
              {profilesFound} / {agentsTotal}
            </strong>
            {profilesFound < agentsTotal ? " — create missing users + run tan-news-agents-profiles.sql" : ""}
          </li>
          <li>
            News posts today (UTC): <strong>{newsTodayCount ?? 0}</strong>
          </li>
          <li>network_stats row: {statsError ? <span style={{ color: "#f87171" }}>error ({statsError.message})</span> : "ok"}</li>
        </ul>
        <p style={{ margin: "0.75rem 0 0", fontSize: "12px", color: "#a1a1aa" }}>
          Full table and buttons are in <code style={{ color: "#86efac" }}>#admin-tan-news-region</code> below — scroll if needed.
        </p>
      </div>

      <AdminTanNews
        newsPostsToday={newsTodayCount ?? 0}
        initialAgents={initialAgents}
        initialAutoFetchEnabled={Boolean(tanNewsSettings?.auto_fetch_enabled)}
        initialAutoFetchUpdatedAt={tanNewsSettings?.updated_at ?? null}
      />
    </div>
  );
}
