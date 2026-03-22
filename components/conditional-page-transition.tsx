"use client";

import { usePathname } from "next/navigation";
import { PageTransition } from "@/components/page-transition";

/**
 * Renders /admin without PageTransition (plain document flow).
 * All other routes keep the animated transition.
 */
export function ConditionalPageTransition({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAdmin = pathname === "/admin" || pathname.startsWith("/admin/");
  if (isAdmin) {
    return <>{children}</>;
  }
  return <PageTransition>{children}</PageTransition>;
}
