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
 * neighbours sideways mid-roll. The travel is measured in `em` rather than `px`
 * so it stays proportional at every clock size, and there is no blur: at one
 * roll per second a blur filter on the digit is a smudge the eye reads as the
 * clock being unstable.
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
          initial={reduceMotion ? false : { y: "0.45em", opacity: 0 }}
          animate={reduceMotion ? { opacity: 1 } : { y: 0, opacity: 1 }}
          exit={reduceMotion ? { opacity: 0 } : { y: "-0.45em", opacity: 0 }}
          transition={{ duration: reduceMotion ? 0.05 : 0.18, ease: "easeOut" }}
        >
          {value}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}
