/**
 * Small id helper used for food-item rows and profile identifiers.
 * Never derived from personal data.
 */
export function createId(prefix = "id"): string {
  const globalCrypto =
    typeof globalThis !== "undefined" ? globalThis.crypto : undefined;

  if (globalCrypto && typeof globalCrypto.randomUUID === "function") {
    return `${prefix}_${globalCrypto.randomUUID()}`;
  }

  return `${prefix}_${Date.now().toString(36)}${Math.random()
    .toString(36)
    .slice(2, 10)}`;
}
