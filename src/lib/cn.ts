/**
 * Tiny class-name combiner.
 * Keeps className composition readable without pulling in extra dependencies.
 */
export function cn(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}
