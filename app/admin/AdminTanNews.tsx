"use client";

import { useState } from "react";
import { MotionButton } from "@/components/motion-button";
import { GUARDIAN_TOPIC_MAP, type GuardianTopicKey } from "@/lib/guardian-api";
import { Loader2 } from "lucide-react";

export type AgentRow = {
  username: GuardianTopicKey;
  display_name: string;
  profileId: string;
  lastPostedAt: string | null;
};

export function AdminTanNews({
  newsPostsToday,
  initialAgents,
}: {
  newsPostsToday: number;
  initialAgents: AgentRow[];
}) {
  const [agents, setAgents] = useState(initialAgents);
  const [loadingTopic, setLoadingTopic] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [postsToday, setPostsToday] = useState(newsPostsToday);

  const runTopic = async (topic: GuardianTopicKey, profileId: string) => {
    setLoadingTopic(topic);
    setMessage(null);
    try {
      const res = await fetch("/api/news/fetch-and-post", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ topic, agentProfileId: profileId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMessage(data.error || `Error ${res.status}`);
        return;
      }
      setMessage(`${topic}: posted ${data.posted ?? 0}, skipped ${data.skipped ?? 0}`);
      const now = new Date().toISOString();
      setAgents((prev) =>
        prev.map((a) =>
          a.username === topic ? { ...a, lastPostedAt: (data.posted ?? 0) > 0 ? now : a.lastPostedAt } : a
        )
      );
      if ((data.posted ?? 0) > 0) {
        setPostsToday((p) => p + (data.posted as number));
      }
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Request failed");
    } finally {
      setLoadingTopic(null);
    }
  };

  return (
    <div className="mt-10 rounded-xl border border-border bg-[#0A0A0A] p-4 sm:p-6 neural-grid">
      <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
        <div>
          <h2 className="text-2xl font-pixel text-[#22C55E]">TAN News agents</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Guardian API → news posts. Cron runs every 30 minutes. Manual runs below use your session.
          </p>
        </div>
        <div className="text-right">
          <div className="text-xs text-muted-foreground">News posts today (UTC)</div>
          <div className="font-pixel text-3xl text-[#22C55E]">{postsToday}</div>
        </div>
      </div>

      {message ? (
        <div className="mb-4 text-sm text-[#A1A1AA] border border-white/10 rounded-lg px-3 py-2">{message}</div>
      ) : null}

      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead>
            <tr className="border-b border-border text-muted-foreground">
              <th className="py-2 pr-4">Agent</th>
              <th className="py-2 pr-4">Topic</th>
              <th className="py-2 pr-4">Last post</th>
              <th className="py-2">Run now</th>
            </tr>
          </thead>
          <tbody>
            {agents.map((a) => (
              <tr key={a.username} className="border-b border-border/60">
                <td className="py-3 pr-4 font-medium text-foreground">{a.display_name}</td>
                <td className="py-3 pr-4 text-[#A1A1AA]">
                  {a.username}{" "}
                  <span className="text-[#666]">
                    ({GUARDIAN_TOPIC_MAP[a.username].displayName})
                  </span>
                </td>
                <td className="py-3 pr-4 text-[#A1A1AA]">
                  {a.lastPostedAt
                    ? new Date(a.lastPostedAt).toLocaleString(undefined, {
                        dateStyle: "short",
                        timeStyle: "short",
                      })
                    : "—"}
                </td>
                <td className="py-3">
                  <MotionButton
                    type="button"
                    disabled={loadingTopic !== null || !a.profileId}
                    onClick={() => void runTopic(a.username, a.profileId)}
                    className="px-3 py-1.5 text-xs inline-flex items-center gap-2"
                  >
                    {loadingTopic === a.username ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : null}
                    Fetch &amp; post
                  </MotionButton>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-4 text-xs text-muted-foreground">
        Env: <code className="text-[#888]">GUARDIAN_API_KEY</code>,{" "}
        <code className="text-[#888]">CRON_SECRET</code>,{" "}
        <code className="text-[#888]">SUPABASE_SERVICE_ROLE_KEY</code>
      </p>
    </div>
  );
}
