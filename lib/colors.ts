/**
 * Playful, vibrant color utility for TickTock.
 * Provides deterministic colorful themes for subjects, days, and metrics.
 * Palette: sky (light blue accent), orange, rose, pink, red, emerald, amber.
 */

import { subjectKey } from "@/lib/subjects";

export interface ColorTheme {
  name: string;
  badge: string;
  pill: string;
  dot: string;
  card: string;
  bar: string;
  text: string;
}

export const PLAYFUL_THEMES: ColorTheme[] = [
  {
    name: "sky",
    badge: "bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30",
    pill: "bg-sky-500/10 hover:bg-sky-500/20 text-sky-700 dark:text-sky-300 border-sky-500/20",
    dot: "bg-sky-500",
    card: "border-sky-500/20 bg-sky-500/5",
    bar: "bg-sky-500",
    text: "text-sky-700 dark:text-sky-300",
  },
  {
    name: "orange",
    badge: "bg-orange-500/15 text-orange-700 dark:text-orange-300 border-orange-500/30",
    pill: "bg-orange-500/10 hover:bg-orange-500/20 text-orange-700 dark:text-orange-300 border-orange-500/20",
    dot: "bg-orange-500",
    card: "border-orange-500/20 bg-orange-500/5",
    bar: "bg-orange-500",
    text: "text-orange-700 dark:text-orange-300",
  },
  {
    name: "rose",
    badge: "bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30",
    pill: "bg-rose-500/10 hover:bg-rose-500/20 text-rose-700 dark:text-rose-300 border-rose-500/20",
    dot: "bg-rose-500",
    card: "border-rose-500/20 bg-rose-500/5",
    bar: "bg-rose-500",
    text: "text-rose-700 dark:text-rose-300",
  },
  {
    name: "emerald",
    badge: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
    pill: "bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border-emerald-500/20",
    dot: "bg-emerald-500",
    card: "border-emerald-500/20 bg-emerald-500/5",
    bar: "bg-emerald-500",
    text: "text-emerald-700 dark:text-emerald-300",
  },
  {
    name: "amber",
    badge: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30",
    pill: "bg-amber-500/10 hover:bg-amber-500/20 text-amber-700 dark:text-amber-300 border-amber-500/20",
    dot: "bg-amber-500",
    card: "border-amber-500/20 bg-amber-500/5",
    bar: "bg-amber-500",
    text: "text-amber-700 dark:text-amber-300",
  },
  {
    name: "pink",
    badge: "bg-pink-500/15 text-pink-700 dark:text-pink-300 border-pink-500/30",
    pill: "bg-pink-500/10 hover:bg-pink-500/20 text-pink-700 dark:text-pink-300 border-pink-500/20",
    dot: "bg-pink-500",
    card: "border-pink-500/20 bg-pink-500/5",
    bar: "bg-pink-500",
    text: "text-pink-700 dark:text-pink-300",
  },
  {
    name: "red",
    badge: "bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/30",
    pill: "bg-red-500/10 hover:bg-red-500/20 text-red-700 dark:text-red-300 border-red-500/20",
    dot: "bg-red-500",
    card: "border-red-500/20 bg-red-500/5",
    bar: "bg-red-500",
    text: "text-red-700 dark:text-red-300",
  },
];

/**
 * Returns a cheerful deterministic theme based on string value.
 *
 * Hashed from the case-insensitive subject key, not the raw string: subjects
 * are stored with the user's own casing, so "Python" and "python" are the same
 * subject and must not come back as two different colours in one list.
 */
export function getSubjectColor(subject: string): ColorTheme {
  if (!subject) return PLAYFUL_THEMES[0];
  const value = subjectKey(subject);
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = value.charCodeAt(i) + ((hash << 5) - hash);
  }
  const index = Math.abs(hash) % PLAYFUL_THEMES.length;
  return PLAYFUL_THEMES[index];
}

/**
 * Returns a color theme for days of the week (0 = Mon, 6 = Sun).
 */
export function getDayColor(dayIndex: number): ColorTheme {
  return PLAYFUL_THEMES[dayIndex % PLAYFUL_THEMES.length];
}
