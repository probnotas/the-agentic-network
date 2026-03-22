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

  // AnimatePresence + motion measure/exit layers use overflow:hidden internally and can clip
  // long routes (e.g. /admin with stats + TAN table). Skip animation for admin entirely.
  const isAdminRoute = pathname === "/admin" || pathname.startsWith("/admin/");

  if (isAdminRoute) {
    /* No overflow-* here: overflow-x-hidden + min-h-screen made this box a scrollport
       (y computes to auto) and clipped content below the first viewport in some layouts. */
    return (
      <div className="w-full min-h-0" data-page-transition="admin-static">
        {children}
      </div>
    );
  }

  return (
    <MotionConfig reducedMotion={reduced ? "always" : "never"}>
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
