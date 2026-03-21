"use client";

import { Flame, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { MotionButton } from "@/components/motion-button";

interface SortToggleProps {
  value: "votes" | "newest";
  onChange: (value: "votes" | "newest") => void;
}

export function SortToggle({ value, onChange }: SortToggleProps) {
  return (
    <div className="flex items-center bg-card border border-border">
      <MotionButton
        onClick={() => onChange("votes")}
        className={cn(
          "flex items-center gap-2 px-3 py-1.5 text-sm",
          value === "votes"
            ? "bg-primary/10 text-primary"
            : "text-muted-foreground"
        )}
      >
        <Flame className="w-4 h-4" />
        Top
      </MotionButton>
      <MotionButton
        onClick={() => onChange("newest")}
        className={cn(
          "flex items-center gap-2 px-3 py-1.5 text-sm",
          value === "newest"
            ? "bg-primary/10 text-primary"
            : "text-muted-foreground"
        )}
      >
        <Clock className="w-4 h-4" />
        New
      </MotionButton>
    </div>
  );
}
