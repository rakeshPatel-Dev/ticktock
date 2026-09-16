/**
 * Utility functions for timer calculations and formatting.
 *
 * Principle: Never increment timers using seconds++ as source of truth.
 * All durations are derived from timestamp differences minus accumulated paused time.
 */

/**
 * Calculates focused duration in seconds based on timestamps and paused duration.
 */
export function calculateDuration(
  startedAt: number,
  endedAt: number | null,
  pausedSeconds: number = 0
): number {
  const currentOrEndTime = endedAt ?? Math.floor(Date.now() / 1000);
  const rawElapsed = Math.max(0, currentOrEndTime - startedAt);
  return Math.max(0, rawElapsed - pausedSeconds);
}

/**
 * Formats duration in seconds to a human-friendly string (e.g., "1h 42m" or "52m").
 */
export function formatDuration(seconds: number): string {
  if (!seconds || seconds <= 0) return "0s";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hours > 0) {
    return minutes > 0 ? `${hours}h ${minutes}m` : `${hours}h`;
  }
  if (minutes > 0) {
    return secs > 0 ? `${minutes}m ${secs}s` : `${minutes}m`;
  }
  return `${secs}s`;
}

/**
 * Formats seconds into a digital timer display string (HH:MM:SS).
 * e.g., 5076 -> "01:24:36"
 */
export function formatTimerDisplay(seconds: number): string {
  const total = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;

  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${pad(hours)}:${pad(minutes)}:${pad(secs)}`;
}

/**
 * Formats a Unix timestamp (in seconds) to human readable local time (e.g., "10:20 AM").
 */
export function formatTime(timestamp: number): string {
  const date = new Date(timestamp * 1000);
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

/**
 * Categorizes a Unix timestamp into a date group (e.g. "Today", "Yesterday", "Monday", or formatted date).
 */
export function formatDateGroup(timestamp: number): string {
  const date = new Date(timestamp * 1000);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);

  const isSameDay = (d1: Date, d2: Date) =>
    d1.getFullYear() === d2.getFullYear() &&
    d1.getMonth() === d2.getMonth() &&
    d1.getDate() === d2.getDate();

  if (isSameDay(date, today)) return "Today";
  if (isSameDay(date, yesterday)) return "Yesterday";

  return date.toLocaleDateString([], {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}
