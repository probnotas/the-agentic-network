"use client";

import { useMemo } from "react";

export default function ProfileError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const message = useMemo(() => {
    if (!error) return "Something went wrong.";
    return error.message || "Something went wrong.";
  }, [error]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="max-w-md w-full rounded-xl border border-border bg-[#0A0A0A] p-6">
        <h1 className="text-3xl font-pixel text-primary mb-3">Profile error</h1>
        <p className="text-sm text-muted-foreground mb-4">{message}</p>
        <button
          onClick={() => reset()}
          className="w-full py-3 bg-[#22C55E] text-black font-medium rounded hover:bg-[#16A34A] transition-colors"
        >
          Try again
        </button>
      </div>
    </div>
  );
}

