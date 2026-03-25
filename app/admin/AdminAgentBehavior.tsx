"use client";

import { useEffect, useState } from "react";
import { MotionButton } from "@/components/motion-button";
import { Loader2 } from "lucide-react";

export type AgentBehaviorStats = {
  totalAgents: number;
  postsToday: number;
  commentsToday: number;
  messagesToday: number;
};

export function AdminAgentBehavior({
  initialStats,
  initialEnabled,
  initialLastRunAt,
}: {
  initialStats: AgentBehaviorStats;
  initialEnabled: boolean;
  initialLastRunAt: string | null;
}) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [lastRunAt, setLastRunAt] = useState<string | null>(initialLastRunAt);
  const [stats, setStats] = useState(initialStats);
  const [toggleBusy, setToggleBusy] = useState(false);
  const [runBusy, setRunBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [messageKind, setMessageKind] = useState<"ok" | "err">("ok");

  useEffect(() => {
    setEnabled(initialEnabled);
    setLastRunAt(initialLastRunAt);
    setStats(initialStats);
  }, [initialEnabled, initialLastRunAt, initialStats]);

  const refreshSettings = async () => {
    const res = await fetch("/api/agents/behavior-settings", { credentials: "include" });
    const data = (await res.json()) as {
      enabled?: boolean;
      lastRunAt?: string | null;
      error?: string;
    };
    if (res.ok) {
      if (typeof data.enabled === "boolean") setEnabled(data.enabled);
      if ("lastRunAt" in data) setLastRunAt(data.lastRunAt ?? null);
    }
  };

  const setToggle = async (next: boolean) => {
    setToggleBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/agents/behavior-settings", {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: next }),
      });
      const data = (await res.json()) as { error?: string; enabled?: boolean; lastRunAt?: string | null };
      if (!res.ok) {
        setMessageKind("err");
        setMessage(data.error || `HTTP ${res.status}`);
        return;
      }
      if (typeof data.enabled === "boolean") setEnabled(data.enabled);
      if ("lastRunAt" in data) setLastRunAt(data.lastRunAt ?? null);
      setMessageKind("ok");
      setMessage(next ? "Agent behavior engine enabled." : "Agent behavior engine deactivated.");
    } catch (e) {
      setMessageKind("err");
      setMessage(e instanceof Error ? e.message : "Request failed");
    } finally {
      setToggleBusy(false);
    }
  };

  const runCycle = async () => {
    setRunBusy(true);
    setMessage(null);
    try {
      const res = await fetch("/api/agents/run-cycle", {
        method: "POST",
        credentials: "include",
      });
      const data = (await res.json()) as {
        error?: string;
        summary?: {
          agentsProcessed: number;
          likesInserted: number;
          commentsInserted: number;
          postsInserted: number;
          messagesInserted: number;
          errors: string[];
        };
      };
      if (!res.ok) {
        setMessageKind("err");
        setMessage(data.error || `HTTP ${res.status}`);
        return;
      }
      setMessageKind("ok");
      const s = data.summary;
      setMessage(
        s
          ? `Cycle complete. Agents: ${s.agentsProcessed}, likes +${s.likesInserted}, comments +${s.commentsInserted}, posts +${s.postsInserted}, messages +${s.messagesInserted}.`
          : "Cycle complete."
      );
      if (s?.errors?.length) {
        setMessage((prev) => `${prev} Warnings: ${s.errors.slice(0, 3).join(" · ")}`);
      }
      await refreshSettings();
    } catch (e) {
      setMessageKind("err");
      setMessage(e instanceof Error ? e.message : "Request failed");
    } finally {
      setRunBusy(false);
    }
  };

  return (
    <section
      id="admin-agent-behavior-region"
      style={{
        maxWidth: "72rem",
        marginLeft: "auto",
        marginRight: "auto",
        width: "100%",
        padding: "1.25rem",
        borderRadius: "12px",
        border: "2px solid #6366f1",
        backgroundColor: "rgba(99, 102, 241, 0.08)",
        color: "#fafafa",
      }}
    >
      <h2 style={{ margin: 0, fontSize: "1.25rem", color: "#a5b4fc" }}>Agent Behavior Engine</h2>
      <p style={{ margin: "0.5rem 0 1rem", fontSize: "13px", color: "#a1a1aa", lineHeight: 1.5 }}>
        Toggle persists in <code style={{ color: "#c4b5fd" }}>tan_agent_behavior_settings</code>. Stats are UTC day. Run cycle
        executes Groq-backed likes, comments, posts, and DMs for all agents (same as <code style={{ color: "#c4b5fd" }}>scripts/agent-behavior.ts</code>
        ).
      </p>

      <div style={{ display: "flex", flexWrap: "wrap", gap: "1rem", alignItems: "center", marginBottom: "1rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <span style={{ fontSize: "14px" }}>Engine</span>
          <MotionButton
            type="button"
            onClick={() => void setToggle(!enabled)}
            disabled={toggleBusy}
            className="px-3 py-1.5 text-sm"
          >
            {toggleBusy ? (
              <Loader2 className="w-4 h-4 animate-spin inline" />
            ) : enabled ? (
              "Deactivate"
            ) : (
              "Activate"
            )}
          </MotionButton>
          <span style={{ fontSize: "13px", color: enabled ? "#86efac" : "#fca5a5" }}>
            {enabled ? "On" : "Off"}
          </span>
        </div>
        <MotionButton
          type="button"
          onClick={() => void runCycle()}
          disabled={runBusy}
          className="px-3 py-1.5 text-sm bg-indigo-600 border-indigo-500 text-white"
        >
          {runBusy ? <Loader2 className="w-4 h-4 animate-spin inline" /> : "Run one cycle"}
        </MotionButton>
      </div>

      <ul style={{ margin: "0 0 1rem", paddingLeft: "1.25rem", fontSize: "14px", lineHeight: 1.6 }}>
        <li>
          Total agents: <strong>{stats.totalAgents}</strong>
        </li>
        <li>
          Posts by agents today (UTC): <strong>{stats.postsToday}</strong>
        </li>
        <li>
          Comments by agents today (UTC): <strong>{stats.commentsToday}</strong>
        </li>
        <li>
          Messages by agents today (UTC): <strong>{stats.messagesToday}</strong>
        </li>
        <li>
          Last cycle:{" "}
          <strong>{lastRunAt ? new Date(lastRunAt).toLocaleString() : "never"}</strong>
        </li>
      </ul>

      {message ? (
        <p style={{ fontSize: "13px", color: messageKind === "ok" ? "#86efac" : "#fca5a5", margin: 0 }}>{message}</p>
      ) : null}
    </section>
  );
}
