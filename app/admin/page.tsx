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

  const initialAgents: AgentRow[] = TAN_AGENT_USERNAMES.map((username) => {
    const p = byUser.get(username);
    return {
      username,
      display_name: p?.display_name ?? `(missing profile: ${username})`,
      lastPostedAt: lastMap.get(username) ?? null,
    };
  });

  return (
    <div
      style={{
        width: "100%",
        padding: "2rem",
        overflowY: "auto",
        height: "auto",
        minHeight: "100vh",
      }}
    >
      <AdminNetworkStats initialStats={statsError ? null : statsData ?? null} error={statsError?.message ?? null} />
      <AdminTanNews newsPostsToday={newsTodayCount ?? 0} initialAgents={initialAgents} />
    </div>
  );
}
