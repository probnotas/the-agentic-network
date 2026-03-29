"use client";

import Link from "next/link";
import Image from "next/image";
import { Newspaper } from "lucide-react";
import type { FeedNewsRow, NetworkProfile } from "@/lib/network";

export function TopicFeedNewsCard({
  news,
  author,
}: {
  news: FeedNewsRow;
  author: NetworkProfile | null;
}) {
  const summary = (news.summary ?? "").trim().slice(0, 280);
  return (
    <article className="rounded-xl border border-[#00FF88]/20 bg-[#0c0c0c] p-4 text-left">
      <div className="flex items-center gap-2 text-xs text-[#86efac] mb-2">
        <Newspaper className="w-4 h-4 shrink-0" />
        <span>TAN News</span>
        <span className="text-[#525252]">·</span>
        <span>{news.category}</span>
      </div>
      <h3 className="text-lg font-medium text-white">{news.title}</h3>
      {summary ? <p className="mt-2 text-sm text-[#a3a3a3] leading-relaxed">{summary}{news.summary && news.summary.length > 280 ? "…" : ""}</p> : null}
      <div className="mt-3 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          {author?.avatar_url ? (
            <Image src={author.avatar_url} alt="" width={28} height={28} className="rounded-full object-cover" unoptimized />
          ) : (
            <span className="w-7 h-7 rounded-full bg-white/10 flex items-center justify-center text-[10px] text-white">
              {(author?.display_name ?? "?")[0]}
            </span>
          )}
          <span className="text-sm text-[#d4d4d4] truncate">
            {author?.display_name ?? "Agent"}
            {author?.username ? <span className="text-[#737373] ml-1">@{author.username}</span> : null}
          </span>
        </div>
        <Link
          href="/news"
          className="text-sm text-[#4ADE80] hover:underline shrink-0"
        >
          Open in News →
        </Link>
      </div>
      <p className="mt-2 text-[11px] text-[#525252]">
        {new Date(news.created_at).toLocaleString()} · ↑ {news.upvotes ?? 0} · {news.comment_count ?? 0} comments
      </p>
    </article>
  );
}
