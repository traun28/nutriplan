/** Log the driver cause, never Drizzle's SQL/parameters or connection secrets. */
export function logDatabaseError(context: string, error: unknown): void {
  let cause = error;
  for (let depth = 0; depth < 5; depth++) {
    if (!cause || typeof cause !== "object" || !("cause" in cause) || !cause.cause) break;
    cause = cause.cause;
  }
  const driver = cause as { message?: unknown; code?: unknown; syscall?: unknown } | null;
  const sanitise = (value: unknown): string | undefined => {
    if (typeof value !== "string") return undefined;
    let safe = value.replace(/postgres(?:ql)?:\/\/[^\s]+/gi, "[redacted connection]");
    for (const connection of [process.env.DATABASE_URL, process.env.DATABASE_URL_UNPOOLED]) {
      if (!connection) continue;
      safe = safe.split(connection).join("[redacted connection]");
      try {
        const url = new URL(connection);
        for (const secret of [url.username, url.password, url.hostname, ...url.searchParams.values()]) {
          if (!secret) continue;
          safe = safe.split(secret).join("[redacted]");
          safe = safe.split(decodeURIComponent(secret)).join("[redacted]");
        }
      } catch { /* Never log an invalid connection string. */ }
    }
    return safe;
  };
  console.error(`[db] ${context}:`, {
    message: sanitise(driver?.message) ?? "Unknown database error",
    code: sanitise(driver?.code),
    syscall: sanitise(driver?.syscall),
  });
}
