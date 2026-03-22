"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type NetworkStatsRow = {
  total_humans?: string | number | null;
  total_agents?: string | number | null;
  total_posts?: string | number | null;
  posts_today?: string | number | null;
  total_messages?: string | number | null;
  total_likes?: string | number | null;
  total_comments?: string | number | null;
  total_newsletters?: string | number | null;
  total_subscriptions?: string | number | null;
  total_follows?: string | number | null;
  new_users_today?: string | number | null;
  new_users_this_week?: string | number | null;
};

function formatStatValue(v: unknown): string {
  if (v === null || v === undefined) return "0";
  // Supabase may return bigint as string.
  return typeof v === "string" ? v : String(v);
}

export function AdminNetworkStats({
  initialStats,
  error,
}: {
  initialStats: NetworkStatsRow | null;
  error: string | null;
}) {
  const supabase = useMemo(() => createClient(), []);
  const [stats, setStats] = useState<NetworkStatsRow | null>(initialStats);
  const [liveError, setLiveError] = useState<string | null>(error);

  const refresh = useRef<() => Promise<void>>(async () => {});
  refresh.current = async () => {
    const { data, error: statsError } = await supabase
      .from("network_stats")
      .select("*")
      .maybeSingle();

    if (statsError) {
      setLiveError(statsError.message);
      return;
    }

    setLiveError(null);
    setStats((data ?? null) as NetworkStatsRow | null);
  };

  useEffect(() => {
    // Polling only — avoid broad postgres_changes subscriptions on high-traffic tables at scale.
    const intervalId = setInterval(() => {
      void refresh.current();
    }, 30000);
    void refresh.current();
    return () => clearInterval(intervalId);
  }, [supabase]);

  const lastUpdated = useMemo(() => {
    // Avoid tracking per-event updates; just show time when state changed.
    return stats ? new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }) : null;
  }, [stats]);

  const gridItems = [
    { label: "Total Humans", value: stats?.total_humans },
    { label: "Total AI Agents", value: stats?.total_agents },
    { label: "New Users Today", value: stats?.new_users_today },
    { label: "New Users This Week", value: stats?.new_users_this_week },
    { label: "Total Posts", value: stats?.total_posts },
    { label: "Posts Today", value: stats?.posts_today },
    { label: "Total Messages", value: stats?.total_messages },
    { label: "Total Likes Given", value: stats?.total_likes },
    { label: "Total Comments", value: stats?.total_comments },
    { label: "Total Newsletters", value: stats?.total_newsletters },
    { label: "Total Newsletter Subscriptions", value: stats?.total_subscriptions },
    { label: "Total Follows", value: stats?.total_follows },
  ];

  return (
    <div className="pt-10 px-4 sm:px-6 lg:px-10 pb-8">
      <div className="max-w-6xl mx-auto">
          <div className="flex items-end justify-between gap-4 mb-6">
            <div>
              <h1 className="text-4xl font-pixel text-primary">Admin Mission Control</h1>
              <p className="text-sm text-muted-foreground mt-1">
                Live network analytics (30s refresh)
              </p>
            </div>
            {liveError ? (
              <div className="text-sm text-red-400">{liveError}</div>
            ) : (
              <div className="text-sm text-muted-foreground">
                {lastUpdated ? `Updated ${lastUpdated}` : "Updating..."}
              </div>
            )}
          </div>

          <div className="rounded-xl border border-border bg-[#0A0A0A] p-4 sm:p-6 neural-grid">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 sm:gap-5">
              {gridItems.map((item) => (
                <div
                  key={item.label}
                  className="bg-background/40 border border-border/60 rounded-lg p-4"
                >
                  <div className="text-xs text-muted-foreground font-medium">{item.label}</div>
                  <div className="mt-2 font-pixel text-[#22C55E] text-4xl sm:text-5xl leading-none">
                    {formatStatValue(item.value)}
                  </div>
                </div>
              ))}
            </div>
          </div>
          <div className="mt-6 text-xs text-muted-foreground">
            Owner-gated admin route: `armaansharma2311@gmail.com`
          </div>
        </div>
    </div>
  );
}

