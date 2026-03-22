"use client";

import { AnimatePresence, motion, MotionConfig } from "framer-motion";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { APPEARANCE_EVENT } from "@/lib/appearance-events";

function useReduceMotionFromPrefs() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const read = () => {
      setReduced(document.documentElement.dataset.reduceMotion === "true");
    };
    read();
    window.addEventListener(APPEARANCE_EVENT, read);
    window.addEventListener("storage", read);
    return () => {
      window.removeEventListener(APPEARANCE_EVENT, read);
      window.removeEventListener("storage", read);
    };
  }, []);
  return reduced;
}

export function PageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const reduced = useReduceMotionFromPrefs();

  return (
    <MotionConfig reducedMotion={reduced ? "always" : "never"}>
      {/* Framer’s exit/enter wrapper can clip tall pages; outer overflow must stay visible. */}
      <div className="min-h-0 w-full overflow-visible">
        <AnimatePresence mode="wait">
          <motion.div
            key={pathname}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 12 }}
            transition={{ duration: 0.28, ease: "easeInOut" }}
            className="min-h-0 w-full overflow-visible"
            style={{ overflow: "visible" }}
          >
            {children}
          </motion.div>
        </AnimatePresence>
      </div>
    </MotionConfig>
  );
}
