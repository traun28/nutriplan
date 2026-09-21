/**
 * Normalisation helpers shared by chip inputs, conflict detection and
 * future storage/processing layers.
 *
 * Food names are stored internally as trimmed, lower-case, single-spaced
 * strings (e.g. "peanut butter") while the UI displays them in Title Case.
 */

/** Normalise a free-text food entry into its canonical stored form. */
export function normalizeFood(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Convert a stored value into a display-friendly label. */
export function titleCase(value: string): string {
  return value.replace(/\w\S*/g, (word) => word.charAt(0).toUpperCase() + word.slice(1));
}

/** Add a value to a list without creating duplicates. Returns the new list. */
export function addUnique(list: string[], value: string): string[] {
  return list.includes(value) ? list : [...list, value];
}

/** Remove a value from a list. Returns the new list. */
export function removeValue(list: string[], value: string): string[] {
  return list.filter((item) => item !== value);
}
