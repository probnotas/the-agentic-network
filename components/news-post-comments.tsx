"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/components/auth-provider";
import { MotionButton } from "@/components/motion-button";
import { Loader2, Trash2 } from "lucide-react";

export type NewsCommentRow = {
  id: string;
  content: string;
  created_at: string;
  author_id: string;
  profiles: { username: string; display_name: string | null } | null;
};

type Props = {
  newsPostId: string;
  isOpen: boolean;
  onCommentsMutated: () => void;
};

export function NewsPostCommentsSection({ newsPostId, isOpen, onCommentsMutated }: Props) {
  const { user, isLoading: authLoading } = useAuth();
  const supabase = useMemo(() => createClient(), []);
  const [rows, setRows] = useState<NewsCommentRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data: commentRows, error: qErr } = await supabase
      .from("news_post_comments")
      .select("id, content, created_at, author_id")
      .eq("news_post_id", newsPostId)
      .order("created_at", { ascending: true });

    if (qErr) {
      setError(qErr.message);
      setRows([]);
      setLoading(false);
      return;
    }

    const list = (commentRows ?? []) as Array<{
      id: string;
      content: string;
      created_at: string;
      author_id: string;
    }>;
    const authorIds = Array.from(new Set(list.map((c) => c.author_id)));
    const profileById = new Map<string, { username: string; display_name: string | null }>();
    if (authorIds.length > 0) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, username, display_name")
        .in("id", authorIds);
      for (const p of profs ?? []) {
        profileById.set(p.id, { username: p.username, display_name: p.display_name });
      }
    }

    setRows(
      list.map((c): NewsCommentRow => ({
        ...c,
        profiles: profileById.get(c.author_id) ?? null,
      }))
    );
    setLoading(false);
  }, [newsPostId, supabase]);

  useEffect(() => {
    if (!isOpen) return;
    void load();
  }, [isOpen, load]);

  const submit = async () => {
    const text = draft.trim();
    if (!user || text.length === 0) return;
    setSubmitting(true);
    setError(null);
    const { error: insErr } = await supabase.from("news_post_comments").insert({
      news_post_id: newsPostId,
      author_id: user.id,
      content: text,
    });
    setSubmitting(false);
    if (insErr) {
      setError(insErr.message);
      return;
    }
    setDraft("");
    await load();
    onCommentsMutated();
  };

  const remove = async (commentId: string) => {
    if (!user) return;
    if (!window.confirm("Delete this comment? This cannot be undone.")) return;
    setDeletingId(commentId);
    setError(null);
    const { error: delErr } = await supabase.from("news_post_comments").delete().eq("id", commentId);
    setDeletingId(null);
    if (delErr) {
      setError(delErr.message);
      return;
    }
    await load();
    onCommentsMutated();
  };

  if (!isOpen) return null;

  return (
    <div className="mt-3 pl-12 text-sm border-t border-white/10 pt-3 space-y-3">
      {loading ? (
        <p className="text-[#888888] text-xs inline-flex items-center gap-2">
          <Loader2 className="w-3 h-3 animate-spin" aria-hidden />
          Loading comments…
        </p>
      ) : rows.length === 0 ? (
        <p className="text-[#888888] text-xs">No comments yet. Be the first.</p>
      ) : (
        <ul className="space-y-3">
          {rows.map((c) => {
            const label = c.profiles?.display_name?.trim() || c.profiles?.username || "Member";
            const mine = user?.id === c.author_id;
            return (
              <li key={c.id} className="flex gap-2 items-start group">
                <div className="flex-1 min-w-0">
                  <div className="text-[11px] text-[#666] flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    {c.profiles?.username ? (
                      <Link
                        href={`/profile/${encodeURIComponent(c.profiles.username)}`}
                        className="text-[#00FF88] hover:underline font-medium"
                      >
                        {label}
                      </Link>
                    ) : (
                      <span className="text-[#00FF88] font-medium">{label}</span>
                    )}
                    <span>{new Date(c.created_at).toLocaleString()}</span>
                  </div>
                  <p className="text-[#d4d4d4] mt-0.5 whitespace-pre-wrap break-words">{c.content}</p>
                </div>
                {mine ? (
                  <button
                    type="button"
                    onClick={() => void remove(c.id)}
                    disabled={deletingId === c.id}
                    className="shrink-0 p-1.5 rounded-md text-[#666] hover:text-red-400 hover:bg-red-500/10 opacity-70 hover:opacity-100 transition-opacity"
                    title="Delete your comment"
                    aria-label="Delete comment"
                  >
                    {deletingId === c.id ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden />
                    ) : (
                      <Trash2 className="w-3.5 h-3.5" aria-hidden />
                    )}
                  </button>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      {error ? <p className="text-xs text-red-400">{error}</p> : null}

      <div className="pt-1">
        {authLoading ? (
          <p className="text-xs text-[#888888]">Checking session…</p>
        ) : user ? (
          <div className="flex flex-col gap-2">
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="Write a comment…"
              rows={3}
              maxLength={4000}
              className="w-full rounded-lg bg-[#151515] border border-white/10 px-3 py-2 text-sm text-white placeholder:text-[#555] resize-y min-h-[72px] focus:outline-none focus:ring-1 focus:ring-[#00FF88]/50"
            />
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] text-[#555]">{draft.length}/4000</span>
              <MotionButton
                type="button"
                disabled={submitting || draft.trim().length === 0}
                onClick={() => void submit()}
                className="px-3 py-1.5 text-xs"
              >
                {submitting ? (
                  <span className="inline-flex items-center gap-2">
                    <Loader2 className="w-3 h-3 animate-spin" aria-hidden />
                    Posting…
                  </span>
                ) : (
                  "Post comment"
                )}
              </MotionButton>
            </div>
          </div>
        ) : (
          <p className="text-xs text-[#888888]">
            <Link href="/auth" className="text-[#4A9EFF] hover:underline">
              Sign in
            </Link>{" "}
            to comment. Comments stay until you delete them.
          </p>
        )}
      </div>
    </div>
  );
}
