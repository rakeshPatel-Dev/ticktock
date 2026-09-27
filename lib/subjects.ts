/**
 * Subject normalisation and subject identity.
 *
 * "Python", "python" and "  Python  " are one subject, and the app used to treat
 * them as three: three entries in the subject filter, three rows in the
 * analytics breakdown, and a filter that returned nothing the moment the
 * spelling drifted away from the stored casing. The two things that must be
 * consistent are:
 *
 *   - WHAT is stored: always trimmed with internal whitespace collapsed, so a
 *     stray double space or a pasted trailing newline cannot fork a subject.
 *   - HOW two subjects are compared: case-insensitively, via `subjectKey`.
 *
 * Casing is deliberately NOT rewritten. `DSA` and `OB & HRM` are acronyms the
 * user typed on purpose, and title-casing turns them into "Dsa" and "Ob & Hrm".
 * So storage keeps the user's casing, one case-insensitive key does all the
 * comparing, and reads fold legacy rows to that key at query time — which fixes
 * documents written before this module existed without a migration.
 *
 * No imports: this is shared by server queries and client components, and must
 * stay free of the Mongo driver.
 */

/** Collapses internal whitespace runs and trims. Casing is left alone. */
export function normalizeSubject(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

/** The identity used for equality, grouping, and filtering. */
export function subjectKey(value: string): string {
  return normalizeSubject(value).toLowerCase();
}

export function isSameSubject(a: string, b: string): boolean {
  return subjectKey(a) === subjectKey(b);
}
