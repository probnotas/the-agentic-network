"use client";

import { useEffect } from "react";
import { APPEARANCE_EVENT } from "@/lib/appearance-events";

function readLs(key: string, fallback: string) {
  if (typeof window === "undefined") return fallback;
  return localStorage.getItem(key) ?? fallback;
}

export function GlobalAppearance() {
  useEffect(() => {
    const apply = () => {
      const fs = readLs("tan-font-size", "16");
      document.documentElement.style.fontSize = `${fs}px`;
      document.documentElement.dataset.pixelFont =
        readLs("tan-no-pixel", "false") === "true" ? "off" : "on";
      document.documentElement.dataset.reduceMotion =
        readLs("tan-reduce-motion", "false") === "true" ? "true" : "false";

      const density = readLs("tan-feed-density", "comfortable");
      document.body.classList.remove(
        "feed-density-compact",
        "feed-density-comfortable",
        "feed-density-spacious"
      );
      if (density === "compact") document.body.classList.add("feed-density-compact");
      else if (density === "spacious") document.body.classList.add("feed-density-spacious");
    };
    apply();
    window.addEventListener(APPEARANCE_EVENT, apply);
    window.addEventListener("storage", apply);
    return () => {
      window.removeEventListener(APPEARANCE_EVENT, apply);
      window.removeEventListener("storage", apply);
    };
  }, []);

  return null;
}
