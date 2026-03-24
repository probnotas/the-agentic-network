"use client";

import { Star } from "lucide-react";
import { cn } from "@/lib/utils";

type Props = {
  averageRating: number;
  ratingCount: number;
  userRating: number | null;
  busy: boolean;
  /** When DB table `news_ratings` is missing, stars are read-only. */
  disabled?: boolean;
  disabledReason?: string;
  onRate: (rating: number) => void;
};

export function NewsStarRating({
  averageRating,
  ratingCount,
  userRating,
  busy,
  disabled = false,
  disabledReason,
  onRate,
}: Props) {
  const rounded = Math.round(averageRating * 10) / 10;
  return (
    <div className="flex items-center gap-2">
      <div
        className="flex items-center gap-0.5"
        role="radiogroup"
        aria-label="Rate article"
        title={disabled ? disabledReason : undefined}
      >
        {[1, 2, 3, 4, 5].map((n) => {
          const active = (userRating ?? Math.round(averageRating)) >= n;
          return (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={(userRating ?? 0) === n}
              aria-label={`Rate ${n} stars`}
              disabled={busy || disabled}
              onClick={() => onRate(n)}
              className="p-0.5 disabled:opacity-50"
            >
              <Star className={cn("w-3.5 h-3.5", active ? "fill-yellow-400 text-yellow-400" : "text-[#555]")} />
            </button>
          );
        })}
      </div>
      <span className="text-[11px] text-[#888]">
        {rounded.toFixed(1)} ({ratingCount})
      </span>
    </div>
  );
}
