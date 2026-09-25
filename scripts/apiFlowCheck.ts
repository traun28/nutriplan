/**
 * End-to-end API flow check — run with: npm run test:flow
 *
 * Drives the REAL production server over HTTP (no mocks, no stubbed session)
 * through the flow the product must support:
 *
 *   login → session → GET /api/auth/me → GET /api/profile → POST /api/meal-plans
 *   → 7-day plan saved for the signed-in user → logout → login again
 *
 * plus the checks the planner requirements call out: unauthenticated access is
 * rejected, profile data is loaded server-side (never from the request body),
 * allergies and dietary patterns are respected, a missing profile produces the
 * "complete your profile" answer, and another user can never read or change
 * the first user's rows.
 *
 * By default it starts its own throwaway PostgreSQL (embedded, temp directory)
 * and its own `next start` server, exactly like the other checks in
 * `scripts/`. Set `BASE_URL` to test an already running server instead (that
 * server's database is then left untouched apart from the test users it
 * creates). Requires a production build: `npm run build` first.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import EmbeddedPostgres from "embedded-postgres";
import { FOOD_BY_ID } from "../src/data/foods/foodDatabase";
import {
  violatesAllergy,
  violatesDietaryType,
} from "../src/services/diet/filters";
import { processUserProfile } from "../src/services/nutrition/nutritionProcessor";
import type { WeeklyPlanData } from "../src/services/diet/weeklyPlanner";
import type { UserProfile } from "../src/types/profile";
import { buildProfile } from "./profileFixtures";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const HOST = "127.0.0.1";

let failures = 0;
let passes = 0;
function check(name: string, ok: boolean, extra = "") {
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${extra ? `  — ${extra}` : ""}`);
  if (ok) passes++;
  else failures++;
}

/* ------------------------------------------------------------------ */
/* Tiny HTTP client with a cookie jar (Node's fetch keeps no cookies)   */
/* ------------------------------------------------------------------ */

interface ApiResponse {
  status: number;
  text: string;
  json: unknown;
  setCookie: string[];
}

class Api {
  constructor(
    private baseUrl: string,
    private cookie: string | null = null,
  ) {}

  get cookieHeader(): string | null {
    return this.cookie;
  }

  /** A client with no session, used for the unauthenticated checks. */
  anonymous(): Api {
    return new Api(this.baseUrl, null);
  }

  withCookie(cookie: string | null): Api {
    return new Api(this.baseUrl, cookie);
  }

  async request(
    method: string,
    urlPath: string,
    body?: unknown,
    rawBody?: string,
  ): Promise<ApiResponse> {
    const headers: Record<string, string> = {};
    if (this.cookie) headers.cookie = this.cookie;
    if (body !== undefined || rawBody !== undefined) {
      headers["content-type"] = "application/json";
    }
    const response = await fetch(`${this.baseUrl}${urlPath}`, {
      method,
      headers,
      body: rawBody ?? (body === undefined ? undefined : JSON.stringify(body)),
      redirect: "manual",
    });
    const text = await response.text();
    let json: unknown = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    const setCookie = response.headers.getSetCookie?.() ?? [];
    // Follow the session cookie like a browser would.
    for (const cookie of setCookie) {
      if (cookie.startsWith("pdp_session=")) {
        this.cookie = cookie.split(";")[0];
      }
    }
    return { status: response.status, text, json, setCookie };
  }
}

/** Error bodies collected from the API, scanned for leaked internals. */
const errorBodies: { path: string; text: string }[] = [];

async function api(
  client: Api,
  method: string,
  urlPath: string,
  body?: unknown,
  rawBody?: string,
): Promise<ApiResponse> {
  const response = await client.request(method, urlPath, body, rawBody);
  if (response.status >= 400) errorBodies.push({ path: urlPath, text: response.text });
  return response;
}

/* ------------------------------------------------------------------ */
/* Fixtures                                                            */
/* ------------------------------------------------------------------ */

let emailCounter = 0;
function freshEmail(): string {
  emailCounter += 1;
  // Gmail rules enforced by the app: 6–30 chars, letters/digits only.
  const base = Date.now().toString().slice(-9);
  return `flowcheck${base}${emailCounter}`.slice(0, 24) + "@gmail.com";
}

const PASSWORD = "flowcheck-password";

/** The exact body the 7-day plan page sends (planner controls only). */
function pageBody(overrides: Record<string, unknown> = {}) {
  return { name: "My Weekly Plan", budget: "medium", startDate: null, preferPantry: false, ...overrides };
}

/* ------------------------------------------------------------------ */
/* Environment management                                             */
/* ------------------------------------------------------------------ */

function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, HOST, () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("Could not find a free port"));
        return;
      }
      server.close(() => resolve(address.port));
    });
  });
}

async function waitForHealth(baseUrl: string, timeoutMs = 90_000): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/api/health`);
      if (response.ok) return true;
    } catch {
      // not listening yet
    }
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
  return false;
}

interface Harness {
  baseUrl: string;
  stop: () => Promise<void>;
}

/** BASE_URL provided → test that server; otherwise start an isolated one. */
async function startHarness(): Promise<Harness> {
  const provided = process.env.BASE_URL?.trim();
  if (provided) {
    const baseUrl = provided.replace(/\/$/, "");
    const healthy = await waitForHealth(baseUrl, 5_000);
    if (!healthy) throw new Error(`BASE_URL ${baseUrl} did not answer /api/health`);
    console.log(`Using the already running server at ${baseUrl}\n`);
    return { baseUrl, stop: async () => undefined };
  }

  if (!existsSync(path.join(repoRoot, ".next", "BUILD_ID"))) {
    throw new Error("No production build found. Run `npm run build` before `npm run test:flow`.");
  }

  const pgPort = await freePort();
  const appPort = await freePort();
  const dataDir = await mkdtemp(path.join(os.tmpdir(), "nutriplan-flow-"));
  const pg = new EmbeddedPostgres({
    databaseDir: dataDir,
    user: "nutriplan",
    password: "nutriplan",
    port: pgPort,
    persistent: true, // removed in stop(); never touches a real database
  });
  await pg.initialise();
  await pg.start();
  await pg.createDatabase("nutriplan");

  const databaseUrl = `postgresql://nutriplan:nutriplan@${HOST}:${pgPort}/nutriplan`;
  const server: ChildProcess = spawn(
    "npx",
    ["next", "start", "-H", HOST, "-p", String(appPort)],
    {
      cwd: repoRoot,
      env: {
        ...process.env,
        DATABASE_URL: databaseUrl,
        DATABASE_URL_UNPOOLED: databaseUrl,
        NODE_ENV: "production",
      },
      stdio: ["ignore", "pipe", "pipe"],
    },
  );
  let serverLog = "";
  server.stdout?.on("data", (chunk: Buffer) => {
    serverLog += chunk.toString();
  });
  server.stderr?.on("data", (chunk: Buffer) => {
    serverLog += chunk.toString();
  });

  const baseUrl = `http://${HOST}:${appPort}`;
  const healthy = await waitForHealth(baseUrl);
  if (!healthy) {
    server.kill("SIGKILL");
    await pg.stop().catch(() => undefined);
    throw new Error(`The production server did not become healthy.\n${serverLog.slice(-2000)}`);
  }
  console.log(`Isolated production server ready at ${baseUrl} (throwaway PostgreSQL, temp dir)\n`);

  return {
    baseUrl,
    stop: async () => {
      server.kill("SIGTERM");
      await new Promise((resolve) => setTimeout(resolve, 400));
      if (!server.killed) server.kill("SIGKILL");
      await pg.stop().catch(() => undefined);
      await rm(dataDir, { recursive: true, force: true }).catch(() => undefined);
    },
  };
}

/* ------------------------------------------------------------------ */
/* The flow                                                            */
/* ------------------------------------------------------------------ */

async function run(baseUrl: string) {
  const anon = new Api(baseUrl);
  const userOne = new Api(baseUrl);

  /* ---------------- public pages + anonymous access ---------------- */

  const mealPlanPage = await anon.request("GET", "/meal-plan");
  check("D. /meal-plan page loads", mealPlanPage.status === 200, `HTTP ${mealPlanPage.status}`);

  const anonProfile = await api(anon, "GET", "/api/profile");
  check(
    "C. unauthenticated GET /api/profile is rejected",
    anonProfile.status === 401,
    `HTTP ${anonProfile.status}`,
  );
  const anonPlans = await api(anon, "GET", "/api/meal-plans");
  check("unauthenticated GET /api/meal-plans is rejected", anonPlans.status === 401);
  const anonGenerate = await api(anon, "POST", "/api/meal-plans", pageBody());
  check("unauthenticated POST /api/meal-plans is rejected", anonGenerate.status === 401);

  const anonMe = await anon.request("GET", "/api/auth/me");
  const anonMeUser = (anonMe.json as { user?: unknown } | null)?.user ?? null;
  check(
    "A. /api/auth/me answers 200 with no user when signed out",
    anonMe.status === 200 && anonMeUser === null,
    `HTTP ${anonMe.status}, user=${JSON.stringify(anonMeUser)}`,
  );

  /* ------------------------- register + session -------------------- */

  const email = freshEmail();
  const register = await api(userOne, "POST", "/api/auth/register", {
    email,
    password: PASSWORD,
    fullName: "Flow Check",
  });
  check(
    "A. registration succeeds and starts a session",
    register.status === 200 && userOne.cookieHeader !== null,
    `HTTP ${register.status}, cookie=${userOne.cookieHeader ? "set" : "missing"}`,
  );

  const me = await api(userOne, "GET", "/api/auth/me");
  const meUser = (me.json as { user?: { email?: string } } | null)?.user ?? null;
  check(
    "B. GET /api/auth/me returns the signed-in user",
    me.status === 200 && meUser?.email === email,
    `HTTP ${me.status}, email=${meUser?.email ?? "none"}`,
  );

  /* ------------------- missing profile (Part 7) -------------------- */

  const noProfileGenerate = await api(userOne, "POST", "/api/meal-plans", pageBody());
  const noProfileBody = noProfileGenerate.json as { error?: string; code?: string } | null;
  check(
    "N. missing profile → 409 PROFILE_INCOMPLETE with a completion message",
    noProfileGenerate.status === 409 &&
      noProfileBody?.code === "PROFILE_INCOMPLETE" &&
      /profile/i.test(noProfileBody?.error ?? ""),
    `HTTP ${noProfileGenerate.status}, ${noProfileBody?.code ?? "no code"}`,
  );
  const plannerPage = await userOne.request("GET", "/planner");
  check(
    "N. the profile page the message links to loads",
    plannerPage.status === 200,
    `HTTP ${plannerPage.status}`,
  );

  /* -------------------- invalid meal-plan requests ----------------- */

  const badDate = await api(userOne, "POST", "/api/meal-plans", pageBody({ startDate: "02-03-2026" }));
  check("invalid start date is rejected with 400", badDate.status === 400, `HTTP ${badDate.status}`);
  const badJson = await api(userOne, "POST", "/api/meal-plans", undefined, "{not json");
  check("malformed JSON body is rejected with 400", badJson.status === 400, `HTTP ${badJson.status}`);

  /* -------------------- save + read the profile ------------------- */

  const profile = buildProfile({ fullName: "Flow Check", dietaryType: "non_vegetarian" });
  const putProfile = await api(userOne, "PUT", "/api/profile", payloadFor(profile));
  check("profile saves through the existing endpoint", putProfile.status === 200, `HTTP ${putProfile.status}`);

  const readProfile = await api(userOne, "GET", "/api/profile");
  const storedProfile = (readProfile.json as { profile?: UserProfile } | null)?.profile ?? null;
  check(
    "C. authenticated GET /api/profile returns the saved profile",
    readProfile.status === 200 && storedProfile?.personalDetails?.fullName === "Flow Check",
    `HTTP ${readProfile.status}`,
  );

  /* ------------------------ generate the plan --------------------- */

  const generate = await api(userOne, "POST", "/api/meal-plans", pageBody());
  const plan = (generate.json as { plan?: { id: number; data: WeeklyPlanData } } | null)?.plan ?? null;
  check(
    "E. POST /api/meal-plans succeeds for a complete profile",
    generate.status === 201 && plan !== null,
    `HTTP ${generate.status}${generate.status === 422 ? ` — ${(generate.json as { error?: string })?.error}` : ""}`,
  );
  if (!plan) return;
  check("F. the generated plan has exactly 7 days", plan.data.days.length === 7, `${plan.data.days.length} days`);
  check(
    "F. every planned day has meals",
    plan.data.days.every((day) => day.plan.meals.length > 0),
  );

  /* ----------------------- saved-plan ownership -------------------- */

  const current = await api(userOne, "GET", "/api/meal-plans/current");
  const currentPlan = (current.json as { plan?: { id: number } } | null)?.plan ?? null;
  check("G. the generated plan is the user's current plan", currentPlan?.id === plan.id);

  const listOne = await api(userOne, "GET", "/api/meal-plans");
  const plansOne = (listOne.json as { plans?: { id: number }[] } | null)?.plans ?? [];
  check("G. the plan appears in the user's saved plans", plansOne.some((entry) => entry.id === plan.id));

  // A second account must never see the first account's data.
  const userTwo = new Api(baseUrl);
  const registerTwo = await api(userTwo, "POST", "/api/auth/register", {
    email: freshEmail(),
    password: PASSWORD,
    fullName: "Other User",
  });
  check("second account registers", registerTwo.status === 200);

  const twoProfile = await api(userTwo, "GET", "/api/profile");
  const twoProfileBody = twoProfile.json as { profile?: unknown } | null;
  check(
    "G. a different user cannot read the first user's profile",
    twoProfile.status === 200 && twoProfileBody?.profile === null,
  );
  const twoPlans = await api(userTwo, "GET", "/api/meal-plans");
  const twoPlanList = (twoPlans.json as { plans?: unknown[] } | null)?.plans ?? [];
  check("G. a different user's plan list is empty", twoPlanList.length === 0);
  const twoCurrent = await api(userTwo, "GET", "/api/meal-plans/current");
  check(
    "G. a different user has no current plan",
    ((twoCurrent.json as { plan?: unknown } | null)?.plan ?? null) === null,
  );
  const twoFetch = await api(userTwo, "GET", `/api/meal-plans/${plan.id}`);
  check("G. a different user cannot open that plan by id", twoFetch.status === 404, `HTTP ${twoFetch.status}`);
  const twoDelete = await api(userTwo, "DELETE", `/api/meal-plans/${plan.id}`);
  check("G. a different user cannot delete that plan", twoDelete.status === 404, `HTTP ${twoDelete.status}`);
  const stillThere = await api(userOne, "GET", `/api/meal-plans/${plan.id}`);
  check("G. the owner's plan is untouched", stillThere.status === 200, `HTTP ${stillThere.status}`);

  /* ------------------ repeated generation protection --------------- */

  const generateAgain = await api(userOne, "POST", "/api/meal-plans", pageBody({ name: "Second Plan" }));
  const secondPlan = (generateAgain.json as { plan?: { id: number } } | null)?.plan ?? null;
  check("repeated generation succeeds", generateAgain.status === 201 && secondPlan !== null);
  const listTwo = await api(userOne, "GET", "/api/meal-plans");
  const plansTwo = (listTwo.json as { plans?: { id: number }[] } | null)?.plans ?? [];
  check(
    "previously saved plans are preserved (no overwrite)",
    plansTwo.some((entry) => entry.id === plan.id) &&
      Boolean(secondPlan && plansTwo.some((entry) => entry.id === secondPlan.id)),
    `${plansTwo.length} plans`,
  );

  /* ------------- profile data is loaded server-side (Part 3/4) ---- */

  const injected = buildProfile({ fullName: "Flow Check", dailyCalorieTarget: null });
  const expected = processUserProfile(injected);
  const expectedCalories = expected.success ? expected.processed.energy.selectedCalories : null;
  const inject = await api(userOne, "POST", "/api/meal-plans", pageBody({
    name: "Injection attempt",
    weightKg: 250,
    heightCm: 100,
    calorieTarget: 6000,
    allergies: [],
    dietaryType: "non_vegetarian",
    targets: { calories: 6000 },
  }));
  const injectedPlan = (inject.json as { plan?: { data: WeeklyPlanData } } | null)?.plan ?? null;
  check(
    "the request body cannot change the nutrition targets",
    inject.status === 201 &&
      injectedPlan !== null &&
      injectedPlan.data.targets.calories === expectedCalories,
    `target ${injectedPlan?.data.targets.calories ?? "?"} vs server profile ${expectedCalories}`,
  );

  /* ------------------- allergy + dietary guarantees ---------------- */

  const allergenProfile = buildProfile({
    fullName: "Flow Check",
    allergies: ["peanuts", "tree_nuts"],
  });
  await api(userOne, "PUT", "/api/profile", payloadFor(allergenProfile));
  const allergyGenerate = await api(userOne, "POST", "/api/meal-plans", pageBody({ name: "Allergy safe" }));
  const allergyPlan = (allergyGenerate.json as { plan?: { data: WeeklyPlanData } } | null)?.plan ?? null;
  check("J. allergy profile still generates a plan", allergyGenerate.status === 201 && allergyPlan !== null);
  if (allergyPlan) {
    const offenders = plannedFoodNames(allergyPlan.data).filter(({ foodId }) => {
      const food = FOOD_BY_ID.get(foodId);
      return food ? violatesAllergy(food, allergenProfile.allergies) : false;
    });
    check(
      "J. no planned dish contains a declared allergen",
      offenders.length === 0,
      offenders.map((entry) => entry.foodId).join(", "),
    );
  }

  const veganProfile = buildProfile({
    fullName: "Flow Check",
    dietaryType: "vegan",
    mealsPerDay: 5,
  });
  await api(userOne, "PUT", "/api/profile", payloadFor(veganProfile));
  const veganGenerate = await api(userOne, "POST", "/api/meal-plans", pageBody({ name: "Vegan week" }));
  const veganPlan = (veganGenerate.json as { plan?: { data: WeeklyPlanData } } | null)?.plan ?? null;
  check("K. vegan profile still generates a plan", veganGenerate.status === 201 && veganPlan !== null);
  if (veganPlan) {
    const offenders = plannedFoodNames(veganPlan.data).filter(({ foodId }) => {
      const food = FOOD_BY_ID.get(foodId);
      return food ? violatesDietaryType(food, "vegan") : false;
    });
    check("K. every planned dish matches the dietary pattern", offenders.length === 0);
  }

  /* ------------- the production 422 shape, end to end ------------- */

  // A complete, realistic profile with a high calorie target used to fail
  // with 422 INSUFFICIENT_OPTIONS even though nothing was excluded.
  const highTargetProfile = buildProfile({
    fullName: "Flow Check",
    activityLevel: "very_active",
    goal: "weight_gain",
    dailyCalorieTarget: 3200,
  });
  await api(userOne, "PUT", "/api/profile", payloadFor(highTargetProfile));
  const highTarget = await api(userOne, "POST", "/api/meal-plans", pageBody({ name: "High target week" }));
  const highTargetPlan =
    (highTarget.json as { plan?: { data: WeeklyPlanData } } | null)?.plan ?? null;
  check(
    "high calorie target (3200 kcal) generates a plan instead of 422",
    highTarget.status === 201 && highTargetPlan !== null,
    `HTTP ${highTarget.status}${highTargetPlan ? `, ${highTargetPlan.data.summary.averageCalories} kcal avg vs ${highTargetPlan.data.targets.calories}` : ""}`,
  );
  check(
    "high calorie target: 7 days, every day within the plan tolerance",
    highTargetPlan !== null &&
      highTargetPlan.data.days.length === 7 &&
      validateCalories(highTargetPlan.data),
  );

  /* ------------------------ pantry mode (L/M) ---------------------- */

  const safeProfile = buildProfile({ fullName: "Flow Check" });
  await api(userOne, "PUT", "/api/profile", payloadFor(safeProfile));

  const pantryOff = await api(userOne, "POST", "/api/meal-plans", pageBody({ name: "Pantry off", preferPantry: false }));
  check("L. pantry OFF: plan generated from the normal food database", pantryOff.status === 201);

  const addPantry = await api(userOne, "POST", "/api/pantry", { name: "rice", quantity: 2, unit: "kg" });
  check("pantry item saved", addPantry.status === 201, `HTTP ${addPantry.status}`);
  const pantryOn = await api(userOne, "POST", "/api/meal-plans", pageBody({ name: "Pantry on", preferPantry: true }));
  const pantryPlan = (pantryOn.json as { plan?: { data: WeeklyPlanData } } | null)?.plan ?? null;
  check("M. pantry ON: plan generated", pantryOn.status === 201 && pantryPlan !== null);
  check(
    "M. pantry preference is recorded on the plan",
    pantryPlan?.data.options.preferPantry === true,
  );
  if (pantryPlan) {
    check(
      "M. pantry plan still respects restrictions and reaches the target",
      validateCalories(pantryPlan.data) &&
        plannedFoodNames(pantryPlan.data).every(({ foodId }) => Boolean(FOOD_BY_ID.get(foodId))),
    );
  }

  /* ------------------------ logout + login (H/I) -------------------- */

  const logout = await userOne.request("POST", "/api/auth/logout");
  check("H. logout answers 200", logout.status === 200, `HTTP ${logout.status}`);
  const afterLogoutProfile = await api(userOne, "GET", "/api/profile");
  check("H. GET /api/profile is rejected after logout", afterLogoutProfile.status === 401, `HTTP ${afterLogoutProfile.status}`);
  const afterLogoutPlans = await api(userOne, "GET", "/api/meal-plans");
  check("H. GET /api/meal-plans is rejected after logout", afterLogoutPlans.status === 401);
  const afterLogoutMe = await userOne.request("GET", "/api/auth/me");
  check(
    "H. /api/auth/me reports no user after logout",
    ((afterLogoutMe.json as { user?: unknown } | null)?.user ?? null) === null,
  );

  const loginAgain = new Api(baseUrl);
  const login = await api(loginAgain, "POST", "/api/auth/login", { email, password: PASSWORD });
  check("I. signing in again succeeds", login.status === 200 && loginAgain.cookieHeader !== null);

  const profileAfterLogin = await api(loginAgain, "GET", "/api/profile");
  const restored = (profileAfterLogin.json as { profile?: UserProfile } | null)?.profile ?? null;
  check(
    "I. the saved profile is still available after signing in again",
    profileAfterLogin.status === 200 && restored?.personalDetails?.fullName === "Flow Check",
    `HTTP ${profileAfterLogin.status}`,
  );

  const plansAfterLogin = await api(loginAgain, "GET", "/api/meal-plans");
  const restoredPlans = (plansAfterLogin.json as { plans?: { id: number }[] } | null)?.plans ?? [];
  check(
    "I. the saved plans are still available after signing in again",
    restoredPlans.some((entry) => entry.id === plan.id),
    `${restoredPlans.length} plans`,
  );

  /* --------------------------- security ---------------------------- */

  const leaked = errorBodies.filter(({ text }) =>
    /postgres(ql)?:\/\//i.test(text) ||
    /(relation|column) "[^"]+" does not exist/i.test(text) ||
    /at (Object|Module)\./i.test(text) ||
    /node_modules|scrypt\$|password/i.test(text),
  );
  check(
    "no error response leaks SQL, stack traces, credentials or internals",
    leaked.length === 0,
    leaked.map((entry) => entry.path).join(", "),
  );

  const sessionCookie = loginAgain.cookieHeader;
  check(
    "the session cookie is httpOnly and scoped to the site",
    Boolean(sessionCookie?.startsWith("pdp_session=")),
    sessionCookie ?? "missing",
  );
}

function payloadFor(profile: UserProfile) {
  return { profile };
}

function plannedFoodNames(data: WeeklyPlanData) {
  return data.days.flatMap((day) =>
    day.plan.meals.flatMap((meal) => meal.items.map((item) => ({ foodId: item.foodId }))),
  );
}

function validateCalories(data: WeeklyPlanData): boolean {
  const target = data.targets.calories;
  if (!(target > 0)) return false;
  return data.days.every((day) => {
    const drift = Math.abs(day.plan.dailyTotals.calories - target) / target;
    return drift <= 0.2;
  });
}

/* ------------------------------------------------------------------ */

async function main() {
  const harness = await startHarness();
  try {
    await run(harness.baseUrl);
  } finally {
    await harness.stop();
  }
  console.log(
    failures === 0
      ? `\nFLOW: ALL ${passes} PASS`
      : `\nFLOW: ${failures} FAILURES / ${passes} pass`,
  );
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((error) => {
  console.error(`\nFLOW: could not run — ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
