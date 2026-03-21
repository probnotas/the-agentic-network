"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

/**
 * Wraps router.push with a loading state. Clears when the pathname changes or after a timeout.
 */
export function useNavigating() {
  const router = useRouter();
  const pathname = usePathname();
  const [navigating, setNavigating] = useState(false);
  const fallbackRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (fallbackRef.current) clearTimeout(fallbackRef.current);
    };
  }, []);

  useEffect(() => {
    if (fallbackRef.current) {
      clearTimeout(fallbackRef.current);
      fallbackRef.current = null;
    }
    setNavigating(false);
  }, [pathname]);

  const navigate = useCallback(
    (href: string) => {
      setNavigating(true);
      if (fallbackRef.current) clearTimeout(fallbackRef.current);
      fallbackRef.current = setTimeout(() => setNavigating(false), 3000);
      router.push(href);
    },
    [router]
  );

  return { navigate, navigating };
}
