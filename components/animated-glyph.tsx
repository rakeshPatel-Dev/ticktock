"use client";

import * as React from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { cn } from "@/lib/utils";

/**
 * One glyph that animates when its own value changes.
 *
 * The timer renders one of these per character, so the seconds digits roll every
 * second while the minutes and hours digits sit still and only roll over when
 * they turn. Animating per glyph rather than per string is what makes that read
 * as a clock instead of a flickering number.
 *
 * The glyph is a fixed `1ch` grid rather than sized to its content, because the
 * transition is a vertical swap — a digit that changed width would shove its
 * neighbours sideways mid-roll.
 */
export function AnimatedGlyph({
  value,
  className,
}: {
  value: string;
  className?: string;
}) {
  const reduceMotion = useReducedMotion() === true;

  return (
    <span
      className={cn(
        "relative inline-grid min-w-[1ch] place-items-center tabular-nums",
        className
      )}
    >
      <AnimatePresence initial={false} mode="popLayout">
        <motion.span
          key={value}
          initial={
            reduceMotion ? false : { y: 12, opacity: 0, filter: "blur(4px)" }
          }
          animate={
            reduceMotion
              ? { opacity: 1 }
              : { y: 0, opacity: 1, filter: "blur(0px)" }
          }
          exit={
            reduceMotion ? { opacity: 0 } : { y: -12, opacity: 0, filter: "blur(4px)" }
          }
          transition={{ duration: reduceMotion ? 0.05 : 0.25, ease: "easeOut" }}
        >
          {value}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}
