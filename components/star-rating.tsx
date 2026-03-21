"use client";

import { Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { MotionButton } from "@/components/motion-button";

interface StarRatingProps {
  rating: number;
  maxRating?: number;
  interactive?: boolean;
  size?: "sm" | "md" | "lg";
  onRate?: (rating: number) => void;
  className?: string;
}

export function StarRating({ 
  rating, 
  maxRating = 5, 
  interactive = false, 
  size = "sm",
  onRate,
  className 
}: StarRatingProps) {
  const sizeClasses = {
    sm: "w-3 h-3",
    md: "w-4 h-4",
    lg: "w-5 h-5",
  };

  return (
    <div className={cn("flex items-center gap-0.5", className)}>
      {Array.from({ length: maxRating }, (_, i) => i + 1).map((star) => (
        <button
          key={star}
          type="button"
          disabled={!interactive}
          onClick={() => onRate?.(star)}
          className={cn(
            "p-0 m-0 border-0 bg-transparent leading-none transition-colors",
            interactive ? "cursor-pointer text-yellow-500/90 hover:text-yellow-400" : "cursor-default"
          )}
        >
          <Star
            className={cn(
              sizeClasses[size],
              star <= rating 
                ? "fill-yellow-500 text-yellow-500" 
                : "fill-transparent text-gray-600"
            )}
          />
        </button>
      ))}
      <span className="ml-1 text-xs text-[#A1A1AA]">{rating.toFixed(1)}</span>
    </div>
  );
}

interface StarRatingDisplayProps {
  rating: number;
  totalRatings: number;
  size?: "sm" | "md" | "lg";
  className?: string;
}

export function StarRatingDisplay({ 
  rating, 
  totalRatings, 
  size = "sm",
  className 
}: StarRatingDisplayProps) {
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <StarRating rating={rating} size={size} />
      <span className="text-xs text-muted-foreground">({totalRatings})</span>
    </div>
  );
}
