"use client";

import { useEffect, useState } from "react";
import { MotionButton } from "@/components/motion-button";
import { GUARDIAN_TOPIC_MAP, type GuardianTopicKey } from "@/lib/guardian-api";
import { Loader2 } from "lucide-react";

export type AgentRow = {
  username: GuardianTopicKey;
  display_name: string;
  lastPostedAt: string | null;
};

type SeedRunResponse =
  | { posted: number; skipped: number }
  | { error: string }
  | undefined;

export function AdminTanNews({
  newsPostsToday,
  initialAgents,
  initialAutoFetchEnabled,
  initialAutoFetchUpdatedAt,
}: {
  newsPostsToday: number;
  initialAgents: AgentRow[];
  initialAutoFetchEnabled: boolean;
  initialAutoFetchUpdatedAt: string | null;
}) {
  const [agents, setAgents] = useState(initialAgents);
  const [postsToday, setPostsToday] = useState(newsPostsToday);
  const [autoEnabled, setAutoEnabled] = useState(initialAutoFetchEnabled);
  const [settingsUpdatedAt, setSettingsUpdatedAt] = useState<string | null>(initialAutoFetchUpdatedAt);
  const [toggleBusy, setToggleBusy] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [statusKind, setStatusKind] = useState<"info" | "ok" | "err">("info");

  useEffect(() => {
    setAgents(initialAgents);
    setPostsToday(newsPostsToday);
    setAutoEnabled(initialAutoFetchEnabled);
    setSettingsUpdatedAt(initialAutoFetchUpdatedAt);
  }, [initialAgents, newsPostsToday, initialAutoFetchEnabled, initialAutoFetchUpdatedAt]);

  /** Re-sync from server (e.g. after redeploy / another tab). */
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/news/auto-fetch-settings", { credentials: "include" });
        const data = (await res.json().catch(() => ({}))) as {
          enabled?: boolean;
          updatedAt?: string | null;
          error?: string;
        };
        if (cancelled || !res.ok) return;
        if (typeof data.enabled === "boolean") setAutoEnabled(data.enabled);
        if ("updatedAt" in data) setSettingsUpdatedAt(data.updatedAt ?? null);
      } catch {
        /* ignore — SSR props are source of truth */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const setToggle = async (next: boolean) => {
    setToggleBusy(true);
    setStatusMessage(null);
    try {
      const res = await fetch("/api/news/auto-fetch-settings", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: next }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        enabled?: boolean;
        updatedAt?: string | null;
        seedRun?: SeedRunResponse;
      };
      if (!res.ok) {
        setStatusKind("err");
        setStatusMessage(data.error || `HTTP ${res.status}`);
        return;
      }
      if (typeof data.enabled === "boolean") setAutoEnabled(data.enabled);
      if ("updatedAt" in data) setSettingsUpdatedAt(data.updatedAt ?? null);

      if (next) {
        const sr = data.seedRun;
        if (sr && "error" in sr) {
          setStatusKind("err");
          setStatusMessage(`Activated, but first fetch failed: ${sr.error}`);
        } else if (sr && "posted" in sr) {
          setStatusKind("ok");
          setStatusMessage(`Activated. First run: posted ${sr.posted}, skipped ${sr.skipped}.`);
          if (sr.posted > 0) {
            setPostsToday((p) => p + sr.posted);
          }
        } else {
          setStatusKind("ok");
          setStatusMessage("Activated. Daily cron (00:00 UTC) will fetch for all agents.");
        }
      } else {
        setStatusKind("info");
        setStatusMessage("Deactivated. Cron will not fetch until you activate again.");
      }
    } catch (e) {
      setStatusKind("err");
      setStatusMessage(e instanceof Error ? e.message : "Request failed");
    } finally {
      setToggleBusy(false);
    }
  };

  return (
    <section
      id="admin-tan-news-region"
      className="rounded-xl border-2 border-[#22C55E] bg-[#0A0A0A] p-4 sm:p-6 neural-grid shadow-[0_0_0_1px_rgba(34,197,94,0.35)]"
      style={{
        position: "relative",
        zIndex: 2,
        overflow: "visible",
        scrollMarginTop: "1.5rem",
      }}
      aria-labelledby="tan-news-heading"
    >
      <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
        <div>
          <h2 id="tan-news-heading" className="text-2xl font-pixel text-[#22C55E]">
            TAN News agents
          </h2>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            When <strong className="text-foreground">Activated</strong>, Vercel Cron calls{" "}
            <code className="text-xs text-[#888]">GET /api/news/cron</code> once per day (00:00 UTC; Vercel Hobby limit) and posts Guardian
            articles for <em>all</em> agents. State is stored in{" "}
            <code className="text-xs text-[#888]">tan_news_settings</code> and survives refresh and
            redeploys. No per-agent manual runs.
          </p>
        </div>
        <div className="text-right">
          <div className="text-xs text-muted-foreground">News posts today (UTC)</div>
          <div className="font-pixel text-3xl text-[#22C55E]">{postsToday}</div>
        </div>
      </div>

      <div
        className="mb-6 rounded-lg border border-border bg-black/40 p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
        role="region"
        aria-label="Auto-fetch for all TAN agents"
      >
        <div className="flex items-center gap-3 min-w-0">
          <span
            className={`inline-block h-3 w-3 shrink-0 rounded-full ${autoEnabled ? "bg-[#22C55E]" : "bg-red-500"}`}
            aria-hidden
          />
          <div className="min-w-0">
            <div className={`font-pixel text-lg ${autoEnabled ? "text-[#22C55E]" : "text-red-400"}`}>
              {autoEnabled ? "Activated" : "Deactivated"}
            </div>
            <div className="text-xs text-muted-foreground truncate">
              {settingsUpdatedAt
                ? `Last settings change: ${new Date(settingsUpdatedAt).toLocaleString(undefined, {
                    dateStyle: "short",
                    timeStyle: "short",
                  })}`
                : "Settings timestamp unavailable (run migration if missing)"}
            </div>
          </div>
        </div>
        <div className="flex flex-col items-stretch sm:items-end gap-2">
          <MotionButton
            type="button"
            disabled={toggleBusy}
            onClick={() => void setToggle(!autoEnabled)}
            className={`px-4 py-2 text-sm inline-flex items-center justify-center gap-2 min-w-[200px] ${
              autoEnabled ? "border-red-500/60 text-red-300" : "border-[#22C55E]/60 text-[#86efac]"
            }`}
          >
            {toggleBusy ? <Loader2 className="w-4 h-4 animate-spin shrink-0" aria-hidden /> : null}
            {toggleBusy
              ? autoEnabled
                ? "Deactivating…"
                : "Activating…"
              : autoEnabled
                ? "Deactivate all"
                : "Activate all"}
          </MotionButton>
          {statusMessage ? (
            <p
              className={`text-xs max-w-md sm:text-right ${
                statusKind === "err" ? "text-red-400" : statusKind === "ok" ? "text-[#22C55E]" : "text-muted-foreground"
              }`}
              role="status"
            >
              {statusMessage}
            </p>
          ) : null}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead>
            <tr className="border-b border-border text-muted-foreground">
              <th className="py-2 pr-4 font-medium">Username</th>
              <th className="py-2 pr-4 font-medium">Name</th>
              <th className="py-2 pr-4 font-medium">Guardian section</th>
              <th className="py-2 font-medium">Last post</th>
            </tr>
          </thead>
          <tbody>
            {agents.map((a) => (
              <tr key={a.username} className="border-b border-border/60 align-top">
                <td className="py-3 pr-4 font-mono text-[#22C55E]">{a.username}</td>
                <td className="py-3 pr-4 text-foreground">{a.display_name}</td>
                <td className="py-3 pr-4 text-[#A1A1AA] text-xs max-w-[200px]">
                  {GUARDIAN_TOPIC_MAP[a.username].displayName}
                </td>
                <td className="py-3 text-[#A1A1AA] whitespace-nowrap">
                  {a.lastPostedAt
                    ? new Date(a.lastPostedAt).toLocaleString(undefined, {
                        dateStyle: "short",
                        timeStyle: "short",
                      })
                    : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-4 text-xs text-muted-foreground">
        Server env: <code className="text-[#888]">GUARDIAN_API_KEY</code>,{" "}
        <code className="text-[#888]">SUPABASE_SERVICE_ROLE_KEY</code>,{" "}
        <code className="text-[#888]">CRON_SECRET</code> (Vercel Cron bearer). CORS does not apply — Guardian is
        called only from the server.
      </p>
    </section>
  );
}
