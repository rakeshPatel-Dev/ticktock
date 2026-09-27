/**
 * Turns a server action error code into something worth showing a person.
 *
 * Actions return short codes (`DATABASE_ERROR`, `SESSION_NOT_FOUND`) so the wire
 * format stays stable and the copy can change without touching the server. Zod
 * validation messages are returned as-is and deliberately NOT in this table:
 * an unknown string is treated as a human message and passed through, which is
 * exactly right for "Subject is required".
 */

const MESSAGES: Record<string, string> = {
  UNAUTHORIZED: "Your session expired. Sign in again and retry.",
  ACTIVE_SESSION_EXISTS:
    "You already have a session active or paused. Finish or resume it before starting a new one.",
  SESSION_NOT_FOUND:
    "That session no longer exists. Refresh to see your current data.",
  INVALID_SESSION_STATE:
    "That session is not in a state where this action applies. Refresh and try again.",
  SESSION_ALREADY_COMPLETED: "That session is already finished.",
  DATABASE_ERROR:
    "Something went wrong on our end and nothing was saved. Please try again.",
};

/**
 * `fallback` is used when the action returned no error at all, which should not
 * happen but must never render as an empty red box.
 */
export function describeActionError(
  error: string | undefined | null,
  fallback: string
): string {
  if (!error) return fallback;
  return MESSAGES[error] ?? error;
}
