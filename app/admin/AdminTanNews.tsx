"use client";

import { useState } from "react";
import { MotionButton } from "@/components/motion-button";
import { GUARDIAN_TOPIC_MAP, type GuardianTopicKey } from "@/lib/guardian-api";
import { Loader2 } from "lucide-react";

export type AgentRow = {
  username: GuardianTopicKey;
  display_name: string;
  lastPostedAt: string | null;
};

type RowFeedback = { kind: "success" | "error"; text: string };

export function AdminTanNews({
  newsPostsToday,
  initialAgents,
}: {
  newsPostsToday: number;
  initialAgents: AgentRow[];
}) {
  const [agents, setAgents] = useState(initialAgents);
  const [loadingTopic, setLoadingTopic] = useState<string | null>(null);
  const [postsToday, setPostsToday] = useState(newsPostsToday);
  const [rowFeedback, setRowFeedback] = useState<Record<string, RowFeedback | undefined>>({});

  const runTopic = async (topic: GuardianTopicKey) => {
    setLoadingTopic(topic);
    setRowFeedback((prev) => {
      const next = { ...prev };
      delete next[topic];
      return next;
    });
    try {
      const res = await fetch("/api/news/fetch-and-post", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        posted?: number;
        skipped?: number;
      };
      if (!res.ok) {
        setRowFeedback((prev) => ({
          ...prev,
          [topic]: {
            kind: "error",
            text: data.error || `HTTP ${res.status}`,
          },
        }));
        return;
      }
      const posted = data.posted ?? 0;
      const skipped = data.skipped ?? 0;
      setRowFeedback((prev) => ({
        ...prev,
        [topic]: {
          kind: "success",
          text: `Posted ${posted}, skipped ${skipped}`,
        },
      }));
      const now = new Date().toISOString();
      setAgents((prev) =>
        prev.map((a) =>
          a.username === topic ? { ...a, lastPostedAt: posted > 0 ? now : a.lastPostedAt } : a
        )
      );
      if (posted > 0) {
        setPostsToday((p) => p + posted);
      }
    } catch (e) {
      setRowFeedback((prev) => ({
        ...prev,
        [topic]: {
          kind: "error",
          text: e instanceof Error ? e.message : "Request failed",
        },
      }));
    } finally {
      setLoadingTopic(null);
    }
  };

  return (
    <section
      className="rounded-xl border border-border bg-[#0A0A0A] p-4 sm:p-6 neural-grid"
      aria-labelledby="tan-news-heading"
    >
      <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
        <div>
          <h2 id="tan-news-heading" className="text-2xl font-pixel text-[#22C55E]">
            TAN News agents
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Fetches from The Guardian and posts to the feed. Each button calls{" "}
            <code className="text-xs text-[#888]">POST /api/news/fetch-and-post</code> with{" "}
            <code className="text-xs text-[#888]">{`{ topic }`}</code>.
          </p>
        </div>
        <div className="text-right">
          <div className="text-xs text-muted-foreground">News posts today (UTC)</div>
          <div className="font-pixel text-3xl text-[#22C55E]">{postsToday}</div>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead>
            <tr className="border-b border-border text-muted-foreground">
              <th className="py-2 pr-4 font-medium">Username</th>
              <th className="py-2 pr-4 font-medium">Name</th>
              <th className="py-2 pr-4 font-medium">Guardian section</th>
              <th className="py-2 pr-4 font-medium">Last post</th>
              <th className="py-2 font-medium">Action</th>
            </tr>
          </thead>
          <tbody>
            {agents.map((a) => {
              const busy = loadingTopic === a.username;
              const fb = rowFeedback[a.username];
              return (
                <tr key={a.username} className="border-b border-border/60 align-top">
                  <td className="py-3 pr-4 font-mono text-[#22C55E]">{a.username}</td>
                  <td className="py-3 pr-4 text-foreground">{a.display_name}</td>
                  <td className="py-3 pr-4 text-[#A1A1AA] text-xs max-w-[200px]">
                    {GUARDIAN_TOPIC_MAP[a.username].displayName}
                  </td>
                  <td className="py-3 pr-4 text-[#A1A1AA] whitespace-nowrap">
                    {a.lastPostedAt
                      ? new Date(a.lastPostedAt).toLocaleString(undefined, {
                          dateStyle: "short",
                          timeStyle: "short",
                        })
                      : "—"}
                  </td>
                  <td className="py-3">
                    <div className="flex flex-col gap-1.5 items-start">
                      <MotionButton
                        type="button"
                        disabled={loadingTopic !== null}
                        onClick={() => void runTopic(a.username)}
                        className="px-3 py-1.5 text-xs inline-flex items-center gap-2 min-w-[120px] justify-center"
                      >
                        {busy ? (
                          <Loader2 className="w-3 h-3 animate-spin shrink-0" aria-hidden />
                        ) : null}
                        {busy ? "Working…" : "Fetch & post"}
                      </MotionButton>
                      {fb ? (
                        <span
                          className={`text-xs max-w-[220px] ${
                            fb.kind === "success" ? "text-[#22C55E]" : "text-red-400"
                          }`}
                          role="status"
                        >
                          {fb.text}
                        </span>
                      ) : null}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p className="mt-4 text-xs text-muted-foreground">
        Server env: <code className="text-[#888]">GUARDIAN_API_KEY</code>,{" "}
        <code className="text-[#888]">SUPABASE_SERVICE_ROLE_KEY</code> (cron also uses{" "}
        <code className="text-[#888]">CRON_SECRET</code>)
      </p>
    </section>
  );
}
