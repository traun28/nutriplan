# NutriPlan — Personalised Diet Planner

NutriPlan collects a user's personal details, goals, dietary preferences,
allergies, current food intake and lifestyle constraints, stores them as a
structured profile in PostgreSQL, derives estimated nutrition targets, and
generates a validated personalised diet chart. Around that core it offers a
daily food & water log, a 7-day meal planner with smart meal replacement,
recipes, grocery list and pantry, nutrition analytics and progress tracking, a
grounded (rule-based, optionally LLM-phrased) nutrition assistant, a document
attachment reader and a Student Dataset Analyzer for classroom cohorts.

Built as a multi-phase college project. **It is not a medical device and does
not give medical advice** — BMI is shown as a general screening measure, and
all nutrition figures are estimates.

---

## 1. Overview

```
Sign up (Gmail) → Planner questionnaire → Review & save profile
   → Nutrition processing (BMI · energy · macros)
   → Diet chart / 7-day meal plan  (filter → score → validate)
   → Log food & water · Recipes · Grocery · Pantry
   → Analytics · Progress · Assistant
   → Student Dataset Analyzer (upload → validate → import → review → export)
```

Everything a signed-in user creates is stored server-side under their account.
The browser keeps a small `localStorage` cache of the profile, targets and diet
chart so pages paint instantly, but the server copy is authoritative.

## 2. Technology stack

| Technology | Used for |
|---|---|
| Next.js 16 (App Router, route handlers) | Pages, API routes, production build |
| React 19 + TypeScript | UI and client state (React context only — no extra state library) |
| Tailwind CSS v4 | Design system and responsive styling |
| PostgreSQL + Drizzle ORM (`pg`) | Persistent storage for every entity |
| `embedded-postgres` (dev only) | Zero-install local PostgreSQL via `npm run db:local` |
| pdf.js, jszip | Server-side PDF / Office / XLSX extraction |
| lucide-react, framer-motion | Icons and small transitions |

No external service is required. An LLM provider is **optional** (see §11).

## 3. Features

| Area | Route(s) | What it does |
|---|---|---|
| Accounts | `/login` | Gmail-only e-mail + password accounts, scrypt-hashed passwords, httpOnly session cookie |
| Profile questionnaire | `/planner`, `/review`, `/profile` | Personal details, goals, dietary pattern, allergies/intolerances, six meal slots, habits, water, constraints; explicit save, versioning, delete |
| Nutrition processing | `/nutrition` | BMI, Mifflin-St Jeor resting energy, maintenance, goal target, protein/carb/fat targets, "How was this calculated?" |
| Diet chart | `/diet-plan` | Filter → score → portion-scale → balance → independent safety validation; regenerate; print |
| Daily dashboard & food log | `/dashboard`, `/history` | Consumed vs target, log/edit/repeat/delete food entries, favourites, water tracker with target, day switcher, paginated history |
| 7-day meal planner | `/meal-plan` | Server-generated week from the same engine, per-plan/day/meal regeneration, ranked & labelled meal replacement, serving sizes, saved plans |
| Recipes, grocery, pantry | `/recipes`, `/grocery`, `/pantry` | Recipe library with restriction verdicts and favourites, grocery list built from a plan (pantry-aware), pantry CRUD, "what can I cook" suggestions, cook-and-deduct |
| Analytics & progress | `/analytics`, `/progress` | Daily gap analysis, weekly aggregates, planned-vs-actual, week-over-week, weight tracking, insights |
| AI assistant | `/assistant` | Grounded answers from the user's own data, recommendations, confirmed actions (log food, replace meal, add water); optional LLM phrasing |
| Attachments | `/attachments` | Server-side extraction from PDF/DOCX/XLSX/CSV/JSON/…; magic-byte detection; review-before-import |
| Student Dataset Analyzer | `/datasets`, `/health-screening` | Staged upload → validation report → column mapping → import valid rows → searchable/filterable records, dashboard statistics, review workflow, CSV/HTML export, aggregate-only explanations |

Detailed per-feature notes (behaviour, storage tables and API routes) are in
§22–§27 below.

## 4. Installation

Requirements: **Node.js 20+** (22 recommended) and npm. No native build tools.

```bash
git clone <this repository>
cd nutriplan
npm ci            # installs exactly what package-lock.json pins
cp .env.example .env
```

Then configure the database (§5–§6) and run `npm run dev` (§7).

## 5. Environment variables

All variables are read **server-side only**; nothing sensitive is exposed to
the browser bundle. `.env` is git-ignored; `.env.example` contains placeholders
and descriptions only.

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | **Yes** (production) | Pooled PostgreSQL connection for application queries (also used by the existing Drizzle CLI config). Without it, `npm run dev` falls back to a temporary in-memory store for accounts and datasets; `npm run start` refuses to sign users in (HTTP 503) so nothing is silently lost. |
| `DATABASE_URL_UNPOOLED` | Recommended on Vercel + Neon | Direct/non-pooled PostgreSQL connection for automatic startup migrations. If unset, migrations fall back to `DATABASE_URL`; configure the direct URL to serialize concurrent serverless starts safely. |
| `AI_PROVIDER` | No | `openai`, `anthropic` or `none` (default). Enables LLM-phrased assistant replies and dataset explanations. |
| `AI_API_KEY` | No | Provider API key. Never logged, never returned to the client. |
| `AI_MODEL` | No | Model name; defaults `gpt-4o-mini` / `claude-3-5-haiku-latest`. |
| `AI_BASE_URL` | No | OpenAI-compatible gateway/proxy URL. |
| `AI_TIMEOUT_MS` | No | Provider request timeout (default 20000). |
| `DEV_ALLOWED_ORIGINS` | No | Comma-separated extra origins allowed to reach `next dev` (e.g. a phone on the LAN). Ignored in production. |
| `PORT` | No | Port for `next start` (default 3000). |

## 6. Database setup

NutriPlan uses **PostgreSQL** through **Drizzle ORM**. The schema lives in
`src/db/schema.ts` (users, sessions, profiles, processed_profiles, diet_plans,
datasets, dataset_records, attachments, food_logs, food_favorites, water_logs,
user_settings, meal_plans, recipe_favorites, grocery_lists, grocery_items,
pantry_items, progress_entries, ai_conversations, ai_messages). Every row is
keyed by `user_id`; identity always comes from the session cookie, never from
the request body.

**Option A — hosted PostgreSQL (production and shared development)**

1. Create a database at your provider (Neon, Supabase, RDS, Railway, …).
2. Put its connection string in `.env` as `DATABASE_URL` (include
   `?sslmode=require` if the provider needs TLS).
3. Create/update the tables:

```bash
npm run db:push
```

`db:push` is additive (`drizzle-kit push`); it never drops user data on its own.

**Option B — zero-install local PostgreSQL**

```bash
npm run db:local     # starts an embedded PostgreSQL on 127.0.0.1:5432 (data in ./.pgdata, git-ignored)
```

Keep that terminal open, set in `.env`:

```
DATABASE_URL=postgresql://nutriplan:nutriplan@127.0.0.1:5432/nutriplan
```

and run `npm run db:push` in a second terminal. Delete `.pgdata/` only if you
intentionally want a fresh local database.

## 7. Development

```bash
npm run dev          # http://localhost:3000 with hot reload
```

Accounts are **Gmail-only** (`src/lib/email.ts`): sign-up and sign-in accept
`@gmail.com` addresses and reject other domains on both the form and the API.

## 8. Production build

```bash
rm -rf node_modules .next
npm ci
npm run typecheck    # tsc --noEmit
npm run lint         # eslint . (0 errors / 0 warnings expected)
npm run build        # next build — must complete with no errors
npm run start        # serves the production build (add -- -p 8080 for another port)
```

`next.config.ts` disables the `X-Powered-By` header, enables compression and
allows no remote image hosts. Test the production build, not just `npm run
dev`, before deploying.

## 9. Testing & quality gates

There is no unit-test framework in this project; verification is done with the
following commands (all exist in `package.json`) plus manual/API-level testing:

| Command | What it checks |
|---|---|
| `npm run typecheck` | Strict TypeScript across app, scripts and API routes |
| `npm run lint` | ESLint (`eslint-config-next`) — no rules are disabled globally |
| `npm run build` | Production compilation of every page and route |
| `npm run engine:check` | 34 regression checks on the nutrition engine (BMI/energy/macro edge cases: null, zero, negative, NaN, Infinity, extreme values), diet generator, safety validator and food-database integrity |

Manual QA scripts and results are recorded in `docs/TESTING.md`. Synthetic
fixtures for the dataset and attachment features live in `scripts/fixtures/`.

## 10. Dataset usage (Student Dataset Analyzer)

1. Open **/datasets** and upload a CSV/TSV/XLSX (or a PDF/DOCX/JSON containing a
   table). The file is **staged**, not imported: you get a validation report
   (type/size/signature checks, required columns, numeric ranges, duplicates,
   missing values).
2. Map any unrecognised headers (e.g. `Student ID → Participant ID`) and
   re-validate.
3. Click **Import valid rows** — only rows that pass are written; rejected rows
   are listed with reasons. Nothing is imputed.
4. Use the table (search, filters, sort, pagination), the dashboard statistics
   (shown only when ≥ 5 valid records), the per-student detail with review /
   exclude / edit history, and the CSV or printable HTML export.
5. **Explain** produces aggregate-only text (rule-based, or LLM-phrased if a
   provider is configured); it never receives individual student rows and can
   never modify records.

Try it with `scripts/fixtures/phase7-students-synthetic.csv` (67 synthetic rows
→ 64 importable, 3 rejected, 1 duplicate flagged after mapping `Student ID`).
Datasets are private to the account that uploaded them.

## 11. AI configuration

The assistant (`/assistant`) and dataset explanations work **without any API
key**: intents are detected deterministically and answers are composed from the
user's own logged, planned and calculated data. To have replies phrased by a
language model, set `AI_PROVIDER`, `AI_API_KEY` and optionally `AI_MODEL` /
`AI_BASE_URL` / `AI_TIMEOUT_MS` in `.env` (§5).

Safety properties regardless of provider:

- Keys stay on the server; the client only learns *whether* a provider is configured.
- The model receives a minimal, per-user context (never other users' data, never raw student rows).
- Model output is text only. Actions (log food, replace meal, add water) go through
  `POST /api/assistant/actions`, which re-validates every field against the
  same rules as the regular API. The assistant has no direct database access.
- If the provider fails or times out, the rule-based answer is returned instead.
- Chat is rate-limited (20/min) and actions (30/min) per user.

## 12. Deployment

Any Node host that can run `next start` and reach a PostgreSQL database
(Vercel + Neon, Render, Railway, Fly.io, a VPS). Static export is **not**
supported — authentication, file processing and the API are server routes.

1. Set `DATABASE_URL` to the pooled connection and, for Neon, `DATABASE_URL_UNPOOLED` to the direct connection (and optional `AI_*`) in the host's environment — never commit them. At startup, committed Drizzle migrations use the direct connection while API/auth queries use the pooled one. Without `DATABASE_URL_UNPOOLED`, startup migrations fall back to `DATABASE_URL`. Set `DB_AUTO_MIGRATE=false` only if migrations are managed separately.
2. Run `npm ci && npm run build`. The existing Drizzle CLI config (`npm run db:push`) still reads `DATABASE_URL`; it is not run as part of this deployment fix.
3. Start with `npm run start` behind HTTPS. The session cookie is `httpOnly`,
   `sameSite=lax` and `secure` in production, so plain HTTP will not keep users signed in.
4. Health check: `GET /api/health` → `{ ok: true, database: "connected" }`.

Notes: the API is same-origin (no CORS setup needed); no absolute URLs are
hard-coded; rate limits and the dataset statistics cache are in-process, so a
multi-instance deployment resets them per instance (they are conveniences, not
security boundaries).

## 13. Project structure

```
src/
├── app/                    Routes (App Router) — pages listed in §3, plus:
│   ├── api/                Route handlers (auth, profile, plan, day, food-logs, water,
│   │                       meal-plans, recipes, recipe-favorites, grocery, pantry,
│   │                       analytics, progress, assistant, datasets, process-attachment, health)
│   ├── error.tsx, not-found.tsx
├── components/             UI by feature: auth, layout, ui, home, planner, review, nutrition,
│                           diet-plan, dashboard, food-log, meal-plan, recipes, grocery, pantry,
│                           analytics, progress, assistant, attachments, dataset, common
├── context/                Auth, Profile, Nutrition, DietPlan, DayLog, MealPlan, Kitchen,
│                           Assistant, Attachments providers (React context only)
├── data/                   Option catalogue, food database (+ integrity checker), recipes,
│                           participant dataset schema / mappings / normaliser / validator
├── db/                     Drizzle client (index.ts) and schema (schema.ts)
├── hooks/                  useAsyncData, useAppStatus, useUnsavedChangesWarning
├── lib/                    validation, profileNormalize, email (Gmail rule), appStatus, numbers
├── services/
│   ├── nutrition/          bmi, energy, macronutrients, nutritionProcessor — the ONLY nutrition maths
│   ├── diet/               filters, scoring, dietGenerator, planValidator, weeklyPlanner
│   ├── foodLog/, recipes/, grocery/, analytics/, ai/, attachments/, dataset/
│   ├── server/             auth, guard (session → user), repositories, services, rateLimit
│   ├── apiClient.ts        Browser fetch wrapper (ApiError with status/details)
│   └── planSync.ts         Shared /api/plan loader (deduplicates start-up requests)
└── types/                  Canonical data models (profile.ts, attachment.ts, …)

scripts/engineCheck.ts      Engine regression checks (npm run engine:check)
scripts/importDataset.ts    Offline participant-dataset importer (Node 22+)
scripts/testAttachments.mjs Attachment pipeline smoke test (needs a running server)
scripts/fixtures/           Synthetic fixtures only — never real people
docs/                       Architecture, testing, dataset and viva notes
drizzle.config.ts           Drizzle Kit config (reads DATABASE_URL from .env)
start-pg.mjs                Embedded PostgreSQL launcher (npm run db:local)
```

---

# Technical reference

## 14. Architecture

```
                       USER
                        │
                  REACT / UI  (src/app, src/components)
                        │
            FORM + CENTRAL STATE  (src/context)
                        │
                 VALIDATION  (src/lib/validation.ts)
                        │
                  USER PROFILE  (src/types/profile.ts)
                        │
              STORAGE  (PostgreSQL via src/services/server/*; localStorage cache via src/services/profileStorage.ts)
                        │
           NUTRITION PROCESSOR  (src/services/nutrition/*)
                        │
              PROCESSED PROFILE
                        │
                FOOD DATABASE  (src/data/foods/*)
                        │
         FILTER + SCORE ENGINE  (src/services/diet/filters, scoring)
                        │
        DIET GENERATION ENGINE  (src/services/diet/dietGenerator.ts)
                        │
             SAFETY VALIDATOR  (src/services/diet/planValidator.ts)
                        │
                   DIET PLAN
                        │
                  DASHBOARD  (src/app/diet-plan)
                        │
          PRINT / DISPLAY / REGENERATE
```

Each layer has exactly one owner:

| Concern | Owner | Rule |
|---|---|---|
| Where data is stored | `services/server/*` repositories (PostgreSQL); `services/profileStorage.ts` is the only module touching the `localStorage` cache | one owner per store |
| Nutrition maths | `services/nutrition/*` | nothing else calculates BMI/BMR/targets |
| Meal selection | `services/diet/*` | the UI never generates meals |
| Safety verdict | `services/diet/planValidator.ts` | runs independently of the filters |
| Next user action | `lib/appStatus.ts` | every page reads the same state machine |

## 15. Complete workflow

```
Enter details → Validate → Review → Save → Stored profile
      → Process → BMI / energy / macro targets
      → Filter food database → Score → Select meals → Balance
      → Final safety validation → Diet chart → Regenerate / Print
```

## 16. Data model

| Model | Purpose |
|---|---|
| `UserProfile` | Everything the user entered, plus storage metadata. Source of truth. |
| `ProcessedProfile` | Derived BMI / energy / macro targets. Never overwrites the profile. |
| `FoodItemRecord` | One dataset entry: nutrition, ingredients, allergens, cuisine, prep time. |
| `PlannedMeal` / `PlannedFoodItem` | One generated meal and its scaled food lines. |
| `DietPlan` | Summary, meals, daily totals, personalisation factors, recommendations, validation report. |

Machine-readable ids are stored (`weight_loss`, `moderately_active`,
`milk_dairy`); the UI maps them to labels ("Weight Loss", "Milk / Dairy").
Numbers are stored numerically (`weightKg: 65`, never `"65 kg"`).

## 17. Nutrition processing

All constants live in `src/services/nutrition/constants.ts`.

- **BMI** = `weight(kg) / height(m)²`, categorised with the conventional adult
  screening thresholds (18.5 / 25 / 30).
- **Resting energy (BMR)** — Mifflin-St Jeor:
  `10·weight + 6.25·height − 5·age + c`, where `c = +5` (male) or `−161`
  (female). For *Other* / *Prefer not to say* the application does **not**
  assume a sex; it uses the midpoint (`−78`) and says so in the results.
- **Maintenance** = BMR × activity factor (1.2 → 1.9).
- **Goal target** = maintenance × (1 + adjustment), e.g. −15% for weight loss,
  then clamped to a sensible range (never below resting energy, 1200–5000 kcal).
- **Protein** = weight × goal factor (1.2–1.8 g/kg).
- **Fat** = 25% of calories; **carbohydrates** = the remainder.
  Atwater factors: protein 4, carbohydrate 4, fat 9 kcal/g.
- **Priority**: a valid user-provided target always beats the estimate, and
  both values are kept side by side so the UI can show which is in use.

## 18. Diet generation algorithm

1. Read the saved profile and the processed targets.
2. Decide the meal slots (respecting skipped meals and meals-per-day).
3. Split the calorie target across the slots using a distribution template.
4. **Filter**: remove foods breaking the dietary pattern, then allergies, then
   intolerances, then foods to avoid.
5. **Score** the survivors: calorie fit, protein fit, goal tags, preferred
   foods, cuisine, current habits, prep time, variety.
6. Pick from the top few candidates using a seeded random choice.
7. Scale portions towards the slot's budget within realistic bounds.
8. Balance the day towards the calorie target.
9. **Validate independently**; on failure exclude the offending foods and retry
   (max 4 attempts), otherwise return a safe structured failure.

Safety priority, enforced in this order:

```
ALLERGY > INTOLERANCE > DIETARY PATTERN > FOODS TO AVOID > PREFERENCE > VARIETY
```

Scoring only ever sees already-filtered foods, so no preference can bring back
an excluded item. There is no "random fallback meal".

## 19. Safety and validation

Validation happens at six levels: form field → section → whole profile →
processing inputs → generation filtering → final plan validation.

The final validator re-checks every meal → item → ingredient from the raw
dataset record, and reports per category:

```
allergies · intolerances · dietaryType · foodsToAvoid · mealStructure · nutrition
```

A plan with any failed check is **discarded**, never shown with a warning.
Errors (blocking) are distinguished from warnings (e.g. "calories 8% below
target"). Conflicting answers are explained to the user but never silently
deleted from their saved profile.

## 20. Reference dataset (offline importer)

An offline ingestion layer supports a supplied participant dataset:

```
PDF → data/raw/participants.tsv → scripts/importDataset.ts
    → src/data/dataset/participants.clean.json → datasetService
```

The importer normalises fields, maps activity/gender labels through documented
assumptions, splits meal text only on reliable separators, **flags** ambiguous
concatenations rather than guessing, rejects negative values, records source
page/row provenance, checks macro-derived calories against reported calories
without overwriting either, and reports duplicate IDs, ID gaps and outliers.

The dataset is strictly separate from `UserProfile`. It powers the
`/dataset` insights page (analytics, quality report, demo sample participants)
and contributes one lightly-weighted ranking signal that sits *below* every
user preference and can never override a restriction. If it fails to load, the
planner behaves exactly as before.

> **Current status:** no PDF was present in the repository, so the committed
> artifact holds 0 records and `populated: false`. The pipeline was verified
> against a clearly-labelled synthetic fixture. See [`docs/DATASET.md`](docs/DATASET.md).

## 21. Attachments

Documents are processed **server-side** through `/api/process-attachment` —
the browser uploads bytes, the server runs pdf.js / jszip and returns a
structured extraction result. The original binary is never stored.

```
File → magic-byte detection → format processor → structured-value extraction
     → provenance + confidence → review screen → user selects → import
     → profile patched → save → recalculate
```

Extracted values are **candidates**: the review screen shows each one beside
the current profile value, and nothing is applied until the user confirms.
Allergy/intolerance/avoid-list changes are **append-only** — the profile's
existing restrictions are never overwritten. Scanned PDFs and images without
OCR are detected and explained rather than guessed.

| Format | Processing | Notes |
|---|---|---|
| PDF | pdf.js text extraction, page provenance | scanned PDFs detected, not guessed |
| DOCX | jszip XML text + tables | macros never executed |
| XLSX | jszip shared strings, sheet names | multi-sheet |
| PPTX | jszip slide text | slide provenance |
| ODT | jszip content.xml | paragraphs + headings |
| TXT / RTF / HTML / XML | direct parsing | scripts stripped from HTML |
| CSV / TSV | delimiter + quote handling | dataset routing when detected |
| JSON | depth-limited render | malformed → kept as text |
| JPG / PNG / WEBP | no OCR in this deployment | honest limitation explained |
| DOC / XLS / PPT (legacy) | not extracted | conversion suggestion |
| ZIP | not extracted | security (path traversal, bombs) |

## 22. Daily dashboard & food logging (Phase 2)

`/dashboard` is the daily command centre. It reads the saved profile
(greeting, goal), the Part 6 processed targets (calories / macros) and the
Phase 2 day log, and never calculates nutrition itself.

- **Daily summary** — consumed / target / remaining for calories, protein,
  carbohydrates and fat with progress bars; exceeding a target is shown
  explicitly rather than by overflowing the bar.
- **Today's meals** — logged entries grouped by Breakfast · Morning Snack ·
  Lunch · Evening Snack · Dinner · Other, with edit / repeat / delete.
- **Log Food dialog** — date → meal → search (all / recent / favourites /
  category) → food details (serving, macros, tags, allergens) → quantity →
  live preview → save. The same dialog edits an entry.
- **Next meal** — the next unlogged slot from the generated plan (only when a
  plan exists). **Water tracker** — persistent entries with an adjustable
  target. **Recommendations** — short notes derived from the logged data.
- **Day switcher** — previous / next / today; each day is fetched separately.
- `/history` — paginated table of everything logged, with edit / repeat / delete.

Storage: `food_logs`, `food_favorites`, `water_logs`, `user_settings`
(all keyed by `user_id`; see `src/db/schema.ts`). Nutrition on an entry is a
snapshot computed by `services/foodLog/calculations.ts`, which delegates to
the Part 7 `buildPlannedItem` scaler, so logged and planned food agree.

API (session cookie required; user id is never accepted from the client):

| Method | Route | Purpose |
|---|---|---|
| GET | `/api/day?date=` | entries + totals + water + favourites + recents |
| GET / POST | `/api/food-logs` | `?date=` day view, `?page=` history / create |
| GET / PATCH / DELETE | `/api/food-logs/:id` | one entry (owner only) |
| GET | `/api/food-logs/recent` | recent + favourite food ids |
| GET | `/api/food-favorites` · PUT/DELETE `/api/food-favorites/:foodId` | favourites |
| GET / POST | `/api/water?date=` | water entries / add |
| PATCH / DELETE | `/api/water/:id` | edit / remove |
| PUT | `/api/water/target` | daily target |

## 23. 7-day meal planner & smart replacement (Phase 3)

`/meal-plan` builds a full week (Day 1–7, each with the meals enabled in the
profile) on the **server** from the stored profile and nutrition targets.
Each day is a Part 7 `DietPlan` produced by the same `generateDietPlan`
engine — one calorie system, the same restriction filters, portion rules
and independent safety validator — orchestrated by
`services/diet/weeklyPlanner.ts`, which adds cross-day variety exclusions,
per-day / per-meal regeneration, ranked & labelled alternatives, serving-size
updates and the weekly summary. Fibre is reported as "not available"
because the food database has no fibre values.

- **Generate 7-Day Plan** — name, optional start date (Day 1 maps to that
  date; otherwise Day 1 = Monday) and a budget level. Budget is a priority
  over the existing `budget` food tag only — there are no prices.
- **Day selector → meals → Daily total** with `consumed / target` indicators;
  **Weekly summary** (averages, meals planned, days on calorie target).
- **Regenerate plan / day / meal** — each changes only its own scope.
- **Replace meal** — alternatives pass the same allergy / intolerance /
  dietary filters, are scaled to the slot's calorie budget and carry
  computed labels ("Similar calories", "More protein", "Quicker to prepare",
  dietary type, "Budget-friendly") plus a factual comparison sentence. The
  swapped day is re-validated before it is saved.
- **Serving sizes** re-scale through `buildPlannedItem`; restriction
  failures block the change.
- **Saved plans** — open, rename, duplicate, delete, set dates, mark as the
  dashboard's current plan. Generating a new plan never deletes old ones.
- **Dashboard** — "Planned meals" for the selected date with ✓ Logged / Not
  logged and "Log this meal" through the Phase 2 logger.

Storage: `meal_plans` (`user_id`, `name`, `start_date`, `is_current`,
`data` jsonb, timestamps). API (session cookie required; ownership enforced
on every route, the user id is never read from the client):

| Method | Route | Purpose |
|---|---|---|
| GET / POST | `/api/meal-plans` | list own plans / generate + save a new one |
| GET | `/api/meal-plans/current` | plan shown on the dashboard |
| GET / PATCH / DELETE | `/api/meal-plans/:id` | open / rename, dates, set current / delete |
| POST | `/api/meal-plans/:id/regenerate` | `{}` whole plan · `{dayIndex}` · `{dayIndex, slot}` |
| GET | `/api/meal-plans/:id/alternatives?dayIndex=&slot=` | ranked, labelled alternatives |
| POST | `/api/meal-plans/:id/replace` | `{dayIndex, slot, foodId}` validated swap |
| POST | `/api/meal-plans/:id/servings` | `{dayIndex, slot, foodId, servings}` |
| POST | `/api/meal-plans/:id/duplicate` | copy an owned plan |

Failure codes: `PROFILE_INCOMPLETE` / `TARGETS_UNAVAILABLE` (409),
`INSUFFICIENT_OPTIONS` / `VALIDATION_FAILED` (422), database unavailable (503).

## 24. Recipes, grocery list & pantry (Phase 4)

Phase 4 layers a kitchen workflow over the existing data and engines — no
second food database, no second plan system.

**Recipes.** Every food-database entry *is* a recipe (shared, read-only).
`src/data/recipes/recipeDetails.ts` adds an authored detail layer for 35 of
the 53 entries: description, per-serving quantified ingredients, method steps
and cook time. Where a detail is not authored, the UI says
“Information not available” / “Quantity not available” — quantities, fibre,
cooking times and images are never invented. Search and filters
(`/recipes`) only cover data the recipes actually carry: text, meal type,
cuisine, dietary type, prep time, calories, protein, difficulty, and (when
signed in) “hide recipes that conflict with my profile”, which reuses
`filterFoods`. The detail page (`/recipes/[id]`) shows nutrition per serving,
ingredients, method, allergens/intolerance flags, and the per-user actions:

- **Save** — `recipe_favorites` (user-scoped).
- **Add to meal plan** — pick day + meal slot; goes through the Phase 3
  `/api/meal-plans/:id/replace` path, so the day is re-validated and a
  conflicting recipe is rejected (422), never silently placed.
- **Log this meal** — opens the Phase 2 `FoodLogDialog` pre-filled.
- **Add ingredients to grocery** — appends the recipe's ingredients to the list.
- **Cooked this recipe** — previews pantry deductions (only for ingredients
  with comparable units) and applies them *only after confirmation*.

**Grocery list (`/grocery`).** Built from the user's saved 7-day plan (whole
week or selected days) by `services/grocery/groceryBuilder.ts`: ingredients
are combined only when units are dimensionally compatible (g↔kg, ml↔l,
tsp↔tbsp, count units), grouped into Vegetables / Fruits / Grains / Protein /
Dairy / Pantry / Spices / Other, and traced back to meals (“Used in: Day 1
Dinner”). Items can be ticked, quantity-edited, deleted, added as custom
items, cleared when purchased, printed, or exported as CSV. Regenerating
replaces plan-derived items but keeps custom items and remembered
“purchased” ticks. Pantry stock is subtracted only when the pantry unit is
compatible; otherwise the full requirement is shown with a note.

**Pantry (`/pantry`).** Private per-user items (name, quantity, unit,
category, use-by date, notes) with search/filter, ±quantity buttons,
“used up”, edit and remove. Use-by dates are shown as *storage reminders*
using the dates the user entered — not safety guarantees. “Cook with what
you have” lists recipes ranked by ingredient coverage, filtered through the
profile's allergies/diet first. In the 7-day planner, **Prefer pantry
ingredients** adds a small ranking nudge (`GenerationOptions.preferIngredients`)
that never relaxes restriction filters or nutrition fit; the choice is stored
on the plan and honoured by regenerate/alternatives.

Tables: `recipe_favorites`, `grocery_lists` (one per user), `grocery_items`,
`pantry_items` — all owned by `user_id` resolved from the session.

| Method | Route | Purpose |
|---|---|---|
| GET | `/api/recipes` | search/filter shared recipes (`q, mealType, cuisine, dietaryType, maxPrep, maxCalories, minProtein, difficulty, safe=1, favorites=1`) |
| GET | `/api/recipes/:id` | full recipe (+ restriction verdict and favourite flag when signed in) |
| GET / PUT / DELETE | `/api/recipe-favorites[/:recipeId]` | user's saved recipes |
| GET / POST | `/api/grocery` | list; add custom items `{items:[…]}` or a recipe's ingredients `{recipeId, servings}` |
| POST | `/api/grocery/generate` | `{mealPlanId?, dayIndexes?, usePantry?}` → rebuild from the plan |
| PATCH / DELETE | `/api/grocery/items/:id` | purchased / quantity / unit / name; remove |
| POST | `/api/grocery/clear-purchased` | remove ticked items |
| GET / POST | `/api/pantry` · PATCH / DELETE `/api/pantry/:id` | pantry CRUD |
| GET | `/api/pantry/suggestions` | recipes matching pantry items (restriction-filtered) |
| POST | `/api/pantry/cook` | `{recipeId, servings, confirm}` preview or apply deductions |

## 25. Nutrition gap analysis, progress tracking & insights (Phase 5)

Phase 5 adds an analysis layer over stored records — never a second
nutrition engine. Targets are the Part 6 calculated targets
(`targetsFromProcessed`); intake is the snapshot saved with each Phase 2
food-log entry; planned values come from the Phase 3 current plan.

**Vocabulary (shown as compact labels):** *Target* · *Estimated* (logged
foods) · *Planned* · *Logged* · *Calculated*. Fibre has no data in the food
database and is shown as “Information not available”.

**Daily view (`/analytics`)** — for any date: target vs estimated per
nutrient with status (±10 % = within target); gap analysis split into
*Potential gaps / Strengths / Above target*; per-gap details (estimated,
target, difference, %, contributing foods, restriction-filtered food
suggestions from the shared database); “Where it came from” by meal and by
food with a factual sentence (“Most of today's protein came from lunch and
dinner (78 %)”); planned vs actual per slot (“Not logged” — never assumed
skipped) with logging % and calorie/macro differences; today vs yesterday
table; water; a transparent **daily score** (40 calories · 25 protein · 10
carbs · 10 fat — full marks within ±10 %, zero at ±50 % · 10 planned meals
logged · 5 water) with its breakdown; and 4 prioritised insights (show more).

**Weekly view** — Monday-based week: averages over *days with entries only*,
bar charts for calories / protein / water with target lines and gaps for
unlogged days, weight points, this-week vs previous-week, weekly insights.
Charts are dependency-free SVG with visually-hidden data tables.

**Progress (`/progress`)** — weight entries (one per date) add / edit /
delete, chronological history with deltas, weight-over-time chart (30d /
90d / 1y / all; a single record is shown as a point, not a trend), body
metrics via the existing `calculateBmi`, and neutral goal context (profile
weight vs latest recorded). No predictions or completion dates.

Table: `progress_entries` (user_id, entry_date, weight_kg, note; unique per
user+date). All routes derive the user from the session.

| Method | Route | Purpose |
|---|---|---|
| GET | `/api/analytics?view=day&date=` | daily analysis (gaps, contributions, suggestions, score, planned-vs-actual, comparison, insights) |
| GET | `/api/analytics?view=week&date=` | weekly points, averages, week-vs-week, weight points, insights |
| GET / POST | `/api/progress` | history + body metrics; add `{entryDate, weightKg, note?}` |
| PATCH / DELETE | `/api/progress/:id` | edit / remove an owned entry |

## 26. AI nutrition assistant, recommendations & safe actions (Phase 6)

Phase 6 upgrades the Part 13 in-browser assistant into a server-side,
data-grounded assistant with optional AI phrasing, a small recommendation
engine and confirm-to-apply actions. Nothing in the design changed: the
`/assistant` page keeps the same card, header and bubble styling.

**How a message is answered** — `POST /api/assistant/chat`

1. `detectIntent` (deterministic rules) classifies the message.
2. The handler loads only the context groups it needs through `AiContext`
   (`src/services/ai/contextBuilder.ts`): Profile, Nutrition (today's logs +
   targets from the existing engine), MealPlan, Pantry, Recipe favourites,
   Grocery, Daily/Weekly analytics (Phase 5), Progress. Each group is loaded
   at most once per request.
3. Structured tools (`src/services/ai/tools.ts`) build cards from real data:
   meal suggestions sized to *remaining* targets via Phase 3 filters /
   scaling, replacements via Phase 3 `alternativesFor`, pantry matches via
   Phase 4 `recipesForPantry`, recipes via `searchRecipes`.
4. If `AI_PROVIDER` + `AI_API_KEY` are set, the provider is asked to phrase
   the prose using only the verified facts and the grounded answer; on any
   provider failure (unavailable, timeout, 429, empty/invalid output) the
   grounded text is returned unchanged. Cards, numbers and actions never
   come from the model.

**Actions** — `POST /api/assistant/actions`: `log_food`, `replace_meal`,
`add_water` (and client-side `navigate`). The route re-validates every field,
re-checks the food against the user's *current* allergy / intolerance / diet
/ foods-to-avoid settings, and then calls the same functions the UI uses
(`createFoodLog`, Phase 3 `replaceWeeklyMeal` + `assertPlanSafe`, `addWater`).

**Recommendations** — `GET /api/assistant/recommendations` returns at most
four items (missing targets/plan, protein below target, next meal that fits,
pantry recipe, outstanding grocery items, water) each with a factual reason;
rendered as "Smart suggestions" on the dashboard aside.

**Conversations** — `ai_conversations` / `ai_messages` tables, scoped by
user id: list, open, continue, clear (`PATCH {clear:true}`), delete.
Message payloads store only the cards/actions shown, never profile data.

**Safety & privacy** — medical/medication questions get a fixed
professional-referral reply; the provider receives compact summaries (diet,
restrictions, today's totals/targets, pantry names) and never names,
e-mail, ids, tokens or unrelated records. Per-user rate limit: 20 chat
messages / 30 actions per minute.

Environment variables (all optional): `AI_PROVIDER`, `AI_API_KEY`,
`AI_MODEL`, `AI_BASE_URL`, `AI_TIMEOUT_MS`.

## 27. Student Dataset Analyzer (Phase 7)

Phase 7 improves the existing Dataset Management module (`/datasets`) into a
validated, reviewable Student Dataset Analyzer. It reuses the Part 11
normaliser/validator, `calculateBmi()`, the Phase 6 AI provider and the
existing nutrition gap analysis — no second calculation engine.

**Upload workflow** — Select → Upload → **Validate** → Review → **Import valid
rows** / Cancel. `POST /api/datasets` now only *stages* the file (type/size/
signature checks, first table extracted, up to 5 000 rows) and returns a
validation report; the raw table is held on the dataset row (`staged_table`)
until the user confirms via `POST /api/datasets/:id/import`, which writes the
records and clears the staged copy. Cancelling deletes the staged row. Nothing
is imported without confirmation.

**Validation report** (`src/services/dataset/validation.ts`) — column summary
(detected / required / optional / unknown) with a **column-mapping** step:
exact aliases from `COLUMN_ALIASES` are applied, loose matches are only
*suggested* and must be confirmed (`POST /api/datasets/:id/validate` with
`{ mapping }`). Quality counts (total / valid / invalid / duplicate / missing /
invalid numeric / unknown columns / processed / importable), per-field
completeness (total / filled / missing / % / invalid), **duplicates by
participant ID** (rows + which fields differ; never by name, never auto-
deleted), row error report (row / field / problem / expected format) and a
preview of parsed rows. Rows with parse errors (negative or non-numeric
values, missing ID) are rejected; incomplete / needs-review rows are imported
*with* their status.

**Derived per-record columns** (additive, nullable — no reset): `participant_id`,
`name`, `gender`, `bmi`, `record_status` (complete / incomplete / needs_review),
`nutrition_status` (calories vs the calculated reference: below_target /
adequate / above_reference / not_assessable), review fields (`reviewed`,
`reviewed_at`, `excluded`, `review_note`, `edited_at`, `edit_history`).
Pre-Phase-7 rows are back-filled lazily from their stored record.

**Analyzer** (`src/components/dataset/analyzer/*`) — one filter set drives
three tabs: *Students* (server-side search by name/ID, filters for age, BMI,
gender, record/quality/nutrition status, incomplete, reviewed, excluded;
sortable columns; column chooser; page/total/next/prev), *Dashboard*
(filter-aware totals, averages only with ≥5 valid values, calorie-status
counts, age/weight/height/BMI/calorie/protein distributions with text
summaries, descriptive group comparison — no ranking) and *Gap analysis*
(existing analysis, now filter-aware with below/adequate/above counts per
nutrient). Everything is labelled "All records" or "Selected records".

**Individual view & review** — `GET/PATCH /api/datasets/:id/records/:recordId`:
profile, measurements + BMI, recorded vs calculated nutrition, meals, quality
issues, "Potential outlier" flags. Owners can correct values (re-validated with
the import rules, history kept), mark reviewed, add a note, or exclude a
record from analytics — records are never silently deleted.

**Exports** — `GET /api/datasets/:id/export?format=csv` (filtered, formula-
injection safe, no notes/history) and `?format=report` (self-contained
printable HTML with dataset name, dates, counts, quality summary, statistics,
inline SVG charts + tables, active filters; print → PDF).

**AI** — `POST /api/datasets/:id/explain` sends *aggregates only* (counts,
means, distributions — no names or IDs) to the Phase 6 provider and returns
labelled explanatory text; without a provider a rule-based summary is
returned. It never modifies records.

**Performance & security** — search/filter/sort/paging/aggregation in SQL
with indexes on `(dataset_id, row_index | record_status | participant_id)`;
20 s in-process stats cache keyed by user + dataset + query, busted on edits;
ownership re-checked on every route (client ids are lookup keys only);
LIKE-escaped search; control characters stripped from cells; unreadable /
binary files rejected before storage.

## 28. Limitations

- Nutrition values in the food dataset are **approximate** and vary with
  recipe, brand, portion and cooking method. They are not laboratory figures.
- BMI and energy figures are **estimates**, not measurements, and BMI is only a
  general screening measure — never a diagnosis.
- Meal variety is bounded by the 53-item local food database; fibre and
  micronutrients are reported as "not available".
- Portion scaling is linear, which is an approximation.
- Rate limiting and the dataset statistics cache are in-process (per server instance).
- Report export is HTML for the browser's print / Save-as-PDF; there is no server-side PDF renderer.
- Scanned/image-only documents are detected but not OCR'd.
- Personalisation is **rule-based**, not a clinical assessment. **This
  application is not a medical device and is not a substitute for advice from a
  qualified healthcare or nutrition professional.**

## Documentation

| Document | Contents |
|---|---|
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Layers, data flow, ownership rules, state machine, safety pipeline |
| [`docs/TESTING.md`](docs/TESTING.md) | Test report, bugs fixed, what was and was not verified |
| [`docs/DATASET.md`](docs/DATASET.md) | Dataset schema, cleaning rules, quality report, import methodology |
| [`docs/VIVA.md`](docs/VIVA.md) | Viva Q&A and the demonstration script |
