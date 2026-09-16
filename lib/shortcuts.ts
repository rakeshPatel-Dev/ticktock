/**
 * Central definition of every keyboard shortcut in TickTock.
 *
 * Change a binding, its key hint, or its mobile visibility here. The keydown
 * handler in the timer reads keys from this list, hint <kbd>s and the navbar
 * shortcuts dialog render from it, so everything stays in sync.
 *
 * Note: hiding a hint with `showOnMobile` only affects display — the binding
 * always stays active.
 */

export type ShortcutId =
  | "start"
  | "pauseResume"
  | "finish"
  | "toggleFullScreen"
  | "exitFullScreen";

export interface Shortcut {
  id: ShortcutId;
  /** e.key matched on keydown (compared case-insensitively) */
  key: string;
  /** Human-readable key rendered inside <kbd> hints */
  label: string;
  /** What the shortcut does */
  action: string;
  /** Keep the hint (not the binding) visible on small screens */
  showOnMobile?: boolean;
}

export const SHORTCUTS: Shortcut[] = [
  { id: "start", key: "s", label: "S", action: "Start session" },
  {
    id: "pauseResume",
    key: " ",
    label: "Space",
    action: "Pause / Resume timer",
  },
  {
    id: "toggleFullScreen",
    key: "m",
    label: "M",
    action: "Full page focus mode",
  },
  { id: "finish", key: "f", label: "F", action: "Finish session" },
  {
    id: "exitFullScreen",
    key: "Escape",
    label: "Esc",
    action: "Exit / Close modal",
  },
];

export function getShortcut(id: ShortcutId): Shortcut {
  const shortcut = SHORTCUTS.find((s) => s.id === id);
  if (!shortcut) throw new Error(`Unknown shortcut id: ${id}`);
  return shortcut;
}

export function matchesShortcut(shortcut: Shortcut, event: KeyboardEvent): boolean {
  const shownKey = shortcut.key.toLowerCase();
  if (shortcut.key === "Escape") {
    return event.key.toLowerCase() === shownKey;
  }
  return event.key.toLowerCase() === shownKey;
}

/** Visibility class for a hint paragraph containing the given shortcuts. */
export function shortcutHintClass(...ids: ShortcutId[]): string {
  const allVisibleOnMobile = ids.every((id) => getShortcut(id).showOnMobile);
  return allVisibleOnMobile ? "block" : "hidden sm:block";
}

/** Visibility class for a bare <kbd> rendered for a single shortcut. */
export function shortcutKbdClass(id: ShortcutId): string {
  return getShortcut(id).showOnMobile ? "inline-block" : "hidden sm:inline-block";
}