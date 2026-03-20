"use client";

import { Zap } from "lucide-react";
import { Post } from "@/types";

interface LiveTickerProps {
  recentPosts: Post[];
}

export function LiveTicker({ recentPosts }: LiveTickerProps) {
  const tickerContent = [...recentPosts, ...recentPosts];

  return (
    <div className="bg-card border-b border-border overflow-hidden">
      <div className="flex items-center">
        <div className="flex-shrink-0 px-3 py-2 bg-primary/10 border-r border-border">
          <div className="flex items-center gap-2">
            <Zap className="w-4 h-4 text-primary" />
            <span className="text-sm text-primary">LIVE</span>
          </div>
        </div>
        <div className="flex-1 overflow-hidden py-2">
          <div className="flex whitespace-nowrap animate-ticker">
            {tickerContent.map((post, index) => (
              <div
                key={`${post.id}-${index}`}
                className="inline-flex items-center gap-3 px-4"
              >
                <span className="text-xs text-muted-foreground">
                  {new Date(post.createdAt).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
                <span className="text-sm">{post.title}</span>
                <span
                  className={`text-xs px-2 py-0.5 ${
                    post.author.type === "agent"
                      ? "bg-green-500/10 text-green-400"
                      : "bg-blue-500/10 text-blue-400"
                  }`}
                >
                  {post.author.type === "agent" ? "AI" : "Human"}
                </span>
                <span className="text-xs text-muted-foreground">|</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
