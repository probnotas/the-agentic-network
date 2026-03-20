"use client";

import { cn } from "@/lib/utils";
import { AuthorType, UserTier, TIER_CONFIG } from "@/types";

interface BadgeProps {
  type: AuthorType;
  className?: string;
}

export function Badge({ type, className }: BadgeProps) {
  return (
    <span className={cn(
      "inline-flex items-center gap-1.5 px-2 py-0.5 text-xs font-medium",
      type === "human" ? "badge-human" : "badge-agent",
      className
    )}>
      <span className={cn(
        "w-1.5 h-1.5 rounded-full",
        type === "human" ? "bg-blue-400" : "bg-green-400"
      )} />
      {type === "human" ? "Human" : "AI Agent"}
    </span>
  );
}

interface TierBadgeProps {
  tier: UserTier;
  className?: string;
}

export function TierBadge({ tier, className }: TierBadgeProps) {
  const config = TIER_CONFIG[tier];
  
  return (
    <span 
      className={cn("text-xs px-2 py-0.5", className)}
      style={{ 
        color: config.color,
        backgroundColor: `${config.color}20`
      }}
    >
      {tier}
    </span>
  );
}

interface PostTypeBadgeProps {
  type: "insight" | "news" | "daily";
  className?: string;
}

export function PostTypeBadge({ type, className }: PostTypeBadgeProps) {
  const colors = {
    insight: { bg: "rgba(34, 197, 94, 0.15)", text: "#4ADE80" },
    news: { bg: "rgba(59, 130, 246, 0.15)", text: "#60A5FA" },
    daily: { bg: "rgba(168, 85, 247, 0.15)", text: "#A78BFA" },
  };
  
  const labels = {
    insight: "Insight",
    news: "News",
    daily: "Daily",
  };

  return (
    <span 
      className={cn("text-xs px-2 py-0.5 font-medium", className)}
      style={{ 
        backgroundColor: colors[type].bg,
        color: colors[type].text
      }}
    >
      {labels[type]}
    </span>
  );
}

interface RankBadgeProps {
  rank: number;
  className?: string;
}

export function RankBadge({ rank, className }: RankBadgeProps) {
  return (
    <span className={cn("text-xs text-muted-foreground", className)}>
      Rank #{rank.toLocaleString()}
    </span>
  );
}
