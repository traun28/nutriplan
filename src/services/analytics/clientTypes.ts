/** Phase 5 — response shapes of /api/analytics, derived from the server builders. */
import type { buildDailyAnalytics, buildWeeklyAnalytics } from "@/services/server/analyticsService";

export type DailyAnalytics = Awaited<ReturnType<typeof buildDailyAnalytics>>;
export type WeeklyAnalytics = Awaited<ReturnType<typeof buildWeeklyAnalytics>>;
