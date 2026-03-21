"use client";

import { cn } from "@/lib/utils";

export function LoadingSpinner({
  size = 16,
  className,
}: {
  size?: number;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-block shrink-0 animate-spin rounded-full border-2 border-white/25 border-t-white",
        className
      )}
      style={{ width: size, height: size }}
      aria-hidden
    />
  );
}
