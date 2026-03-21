"use client";

import { motion } from "framer-motion";
import type { HTMLMotionProps } from "framer-motion";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type MotionButtonProps = HTMLMotionProps<"button"> & {
  children: ReactNode;
  className?: string;
  /** Default `pill` applies green pill + hover scale. Use `plain` for minimal icon/text buttons. */
  variant?: "pill" | "plain";
};

export function MotionButton({ children, className, variant = "pill", ...props }: MotionButtonProps) {
  const isPill = variant === "pill";
  return (
    <motion.button
      {...(isPill
        ? {
            whileHover: { scale: 1.03 },
            whileTap: { scale: 0.95 },
            transition: { type: "spring", stiffness: 400, damping: 17 },
          }
        : {})}
      className={cn(isPill && "btn-pill", className)}
      {...props}
    >
      {children}
    </motion.button>
  );
}

