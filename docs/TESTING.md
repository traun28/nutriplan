# Testing report — Personalised Diet Planner

## How these results were produced

Two kinds of verification were carried out:

1. **Automated logic tests.** A temporary route (`/api/qa`) exercised the
   validation, storage-rehydration, nutrition-processing, diet-generation and
   state-machine layers directly against the real service modules, and printed
   a machine-checked pass/fail for each case. The suite was executed against a
   production build. It has since been removed from the codebase — it was a
   verification harness, not a project feature.
2. **Toolchain checks.** `next typegen`, `tsc --noEmit`, `eslint` and
   `next build` were run, and every route was requested from a running
   production server to confirm it renders (HTTP 200, no server errors).

Anything that could not be automated in this environment is listed honestly in
the **Not verified** section at the bottom. No result below is estimated or
assumed.

---

## A. Toolchain

| ID | Check | Command | Result |
|---|---|---|---|
| B01 | Route type generation | `npx next typegen` | **PASS** — types generated |
| B02 | TypeScript | `tsc --noEmit` | **PASS** — 0 errors |
| B03 | Lint | `npm run lint` | **PASS** — 0 errors, 0 warnings |
| B04 | Production build | `npm run build` | **PASS** — 9 routes compiled |
| B05 | Server boot + healthcheck | platform build & start | **PASS** — `/api/health` OK |

### Route smoke test (production server)

| Route | Status |
|---|---|
| `/` | 200 |
| `/planner` | 200 |
| `/planner?step=3` | 200 |
| `/review` | 200 |
| `/nutrition` | 200 |
| `/profile` | 200 |
| `/diet-plan` | 200 |
| `/about` | 200 |
| `/api/health` | 200 |

No server-side errors were logged during the smoke test.

---

## B. Automated logic tests — 49 / 49 passed

### Food dataset

| ID | Test | Expected | Actual | Status |
|---|---|---|---|---|
| T00 | Dataset integrity (ids, nutrition, servings, negatives) | 0 issues | 53 foods, 0 issues | **PASS** |
| T00b | Every dietary type has ≥2 options per meal slot | none thin | all slots ≥2 | **PASS** |

### Input validation

| ID | Test | Expected | Actual | Status |
|---|---|---|---|---|
| T02 | Age `-5` | rejected | "Please enter an age between 10 and 100." | **PASS** |
| T17a | Weight `0` | rejected | "Please enter a weight between 30 kg and 250 kg." | **PASS** |
| T17b | Calorie target `-500` | rejected | realistic-range message | **PASS** |
| T17c | Food quantity `-2` | rejected | quantity issue raised | **PASS** |
| T17d | Meal time `"8 in the morning"` | discarded, `13:00` kept | `breakfast=""`, `lunch="13:00"` | **PASS** |
| T03 | Missing height | processing blocked, no BMI | `success=false`, `bmi=null` | **PASS** |
| T18 | Empty profile | lists missing fields, no crash | 8 issues | **PASS** |
| T19 | Partial profile (name+age only) | names the exact gaps | gender, height, weight, activity, goal, diet | **PASS** |

### Nutrition processing

| ID | Test | Expected | Actual | Status |
|---|---|---|---|---|
| T05a | BMI for 170 cm / 65 kg | 22.5 | 22.5 (Normal range) | **PASS** |
| T05b | Source profile not mutated by processing | weight unchanged | 65 | **PASS** |
| T20 | User targets override estimates | 2000 kcal / 120 g, source `user` | 2000/user, 120/user | **PASS** |

### Personalisation

| ID | Test | Expected | Actual | Status |
|---|---|---|---|---|
| T06 | Four different profiles (veg/vegan/non-veg/eggetarian, different goals) | 4 different plans | 4 unique of 4 | **PASS** |
| T11 | Preferred foods (rice, dal, paneer) | boosted, not repeated | 3 meals matched, 5/5 meals unique | **PASS** |
| T12 | South Indian cuisine preference | majority match | 3 of 5 meals South Indian | **PASS** |
| T13 | Preparation time "very little" | all meals ≤12 min | max 12 min | **PASS** |
| T14 | Custom timings 08:00 / 13:00 / 20:30 | preserved | preserved exactly | **PASS** |
| T15 | Morning snack marked skipped | not planned | absent | **PASS** |
| T16 | Water intake not provided | no invented value | `null` | **PASS** |

Observed diversity (same body stats, seed 31):

| Profile | Diet / goal | Target | Planned |
|---|---|---|---|
| A | Vegetarian · weight loss · South Indian | 2125 kcal | 2138 kcal |
| B | Vegan · weight gain · North Indian | 2800 kcal | 2560 kcal |
| C | Non-vegetarian · muscle gain | 2750 kcal | — (distinct meals) |
| D | Eggetarian · maintenance · limited prep time | 2500 kcal | — (distinct meals) |

### Allergy and restriction safety

| ID | Test | Expected | Actual | Status |
|---|---|---|---|---|
| T07a | Peanut allergy | no peanut/groundnut anywhere | none | **PASS** |
| T07b | Milk/dairy allergy | no milk, curd, paneer, cheese, butter, ghee, cream | none | **PASS** |
| T07c | Egg allergy | no egg | none | **PASS** |
| T07d | Fish allergy | no fish | none | **PASS** |
| T07e | Shellfish allergy | no prawn/shrimp/crab | none | **PASS** |
| T07f | Tree-nut allergy | no almonds/walnuts/cashews | none | **PASS** |
| T07g | Peanuts + milk + eggs + fish together | none present | none | **PASS** |
| T08a | Vegetarian | no meat/fish/egg; all items compatible | none, all compatible | **PASS** |
| T08b | Vegan | no animal-derived ingredient incl. honey | none, all compatible | **PASS** |
| T08c | Eggetarian | no meat/fish | none, all compatible | **PASS** |
| T08d | Pescatarian | no meat | none, all compatible | **PASS** |
| T09a | Lactose intolerance | no dairy ingredient | none | **PASS** |
| T09b | Gluten intolerance | no wheat/bread/semolina | none | **PASS** |
| T10 | Foods to avoid: banana, mushroom, oats | none present | none | **PASS** |

Ingredient-level detection was specifically exercised: the dataset contains a
*Banana Peanut Butter Smoothie* whose title does not lead with "peanut", and it
is correctly excluded under a peanut allergy (T07a).

### Final safety validator

| ID | Test | Expected | Actual | Status |
|---|---|---|---|---|
| T27 | Inject "Peanut Chikki" into a plan for a peanut-allergic user | plan invalid, allergy check failed | `valid=false`, `allergies=failed` | **PASS** |
| T28 | Clean plan with allergy + intolerance + avoid list | all checks passed | all six checks `passed` | **PASS** |
| T26 | Extreme restrictions (vegan + 10 allergens + 14 avoided foods) | safe failure, no plan | `INSUFFICIENT_OPTIONS` | **PASS** |
| T31 | Plan data contains no `NaN` / `Infinity` / `undefined` | none | none | **PASS** |
| T30 | Daily totals summed from meals, not copied from target | sum matches meals | 2185 = 2185 (target 2125) | **PASS** |
| T32 | Calories within the 20% hard tolerance | ≤20% | 2.8% | **PASS** |

### Conflicts

| ID | Test | Expected | Actual | Status |
|---|---|---|---|---|
| T29 | Vegan + chicken preference + milk allergy alongside "no known allergies" | conflicts explained, items excluded | 3 notes; plan contains neither | **PASS** |
| T29b | The user's saved preferences are **not** deleted | still present | `["chicken","milk"]` retained | **PASS** |

### Stale detection and state machine

| ID | Test | Expected | Actual | Status |
|---|---|---|---|---|
| T22 | Edit weight after processing | nutrition marked stale | `nutrition_stale` | **PASS** |
| T23 | Recalculate, plan still from old profile | plan marked stale | `plan_stale` | **PASS** |
| T24 | Full state matrix (empty / incomplete / unsaved / no nutrition / no plan / ready) | all six correct | all six correct | **PASS** |
| T25 | Regenerate with a peanut allergy | different, valid, still peanut-free | different=true, valid=true, 0 peanut | **PASS** |

### Storage

| ID | Test | Expected | Actual | Status |
|---|---|---|---|---|
| T33 | Garbage stored value (`"###"`) | safe defaults, no crash | empty profile returned | **PASS** |
| T34 | Older/partial stored profile | defaults filled, numeric strings coerced | `weight=70`, `mealHabits` defaulted | **PASS** |
| T35 | Normalisation before save | dedupe + trim | `["banana"]`, `"QA User"` | **PASS** |

---

## C. Bugs found and fixed during Parts 7–10

| # | Bug | Fix |
|---|---|---|
| 1 | Extreme restrictions surfaced a confusing `VALIDATION_FAILED` "calories too far from target" message | Detected earlier and reported as `INSUFFICIENT_OPTIONS` with a per-reason breakdown |
| 2 | "Very little preparation time" was outvoted by calorie fit, so 25-minute dishes still appeared | Added a soft pre-filter with graceful fallback, plus 4 genuinely quick lunch/dinner items (max prep now 12 min) |
| 3 | `recalculate()` immediately after save used the pre-save React state, marking fresh results stale | `saveProfile()` now returns the persisted profile and `recalculate(saved)` accepts it |
| 4 | Passing `recalculate` directly to `onClick` leaked a `MouseEvent` into the profile argument | Wrapped in `() => recalculate()` |
| 5 | Two synchronising `useEffect`s triggered React Compiler lint errors | Replaced with render-time state adjustment / timers |
| 6 | A failed safety validation discarded the plan with no way to recover | Added a repair loop: offending foods are excluded and generation retries (max 4 attempts) |
| 7 | Dead code after refactors (`hasProfile`, `CheckboxField`, superseded `Meal`/`NutritionSummary` placeholder types) | Removed in the Part 10 cleanup audit |

---

## C2. Part 11 — dataset layer

### Regression: Parts 1–10 unaffected (33 / 33 passed)

Run against a production build after the dataset layer was added. Two anchors
prove the generator is untouched while the dataset is empty:

| ID | Test | Result | Status |
|---|---|---|---|
| R02 | Profile A plan byte-identical to Part 10 documentation | exact match (5 dishes) | **PASS** |
| R03 | Profile A totals unchanged | 2138 planned / 2125 target | **PASS** |
| R01 | Food dataset integrity | 53 foods, 0 issues | **PASS** |
| R04–R08 | Peanut / milk / egg / fish / shellfish allergies | 0 occurrences each | **PASS** |
| R09–R12 | Vegetarian / vegan / eggetarian / pescatarian | 0 banned, 100% compatible | **PASS** |
| R13–R14 | Foods-to-avoid and lactose intolerance | 0 occurrences | **PASS** |
| R15 | Extreme restrictions | safe `INSUFFICIENT_OPTIONS`, no plan | **PASS** |
| R16 | Injected allergen caught by independent validator | `valid=false`, `allergies=failed` | **PASS** |
| R17 | Regeneration differs and stays safe | different, valid, 0 peanut | **PASS** |
| R18 | Goals produce distinct targets | 3 distinct | **PASS** |
| R19–R21 | Timings / skipped meal / prep-time limit | all honoured | **PASS** |
| R22–R23 | Totals summed from meals; no NaN/undefined | confirmed | **PASS** |
| R24–R25 | BMI 22.5; missing height blocks processing | confirmed | **PASS** |
| R26–R29 | State machine: stale → recalc → stale → ready → empty | all correct | **PASS** |
| R30–R33 | Validation, conflicts, corrupt/partial storage | all correct | **PASS** |

### Dataset pipeline (verified against the synthetic fixture)

Full table in [`docs/DATASET.md`](DATASET.md) §5 — 20 cases covering first/middle/last
record, duplicate IDs, duplicate names, missing fields, malformed numerics,
negative values, ambiguous concatenated meal text, empty meals, calorie
mismatch, unmapped labels, outliers, ID gaps, provenance and statistics
isolation. All passed. Two bugs were found in the importer and fixed.

### No-op proof for the dataset signal

With no dataset loaded, all 53 food candidates score `datasetFit = 0.5` — a
single distinct value. A constant cannot reorder candidates, so ranking is
provably identical to Part 10 (confirmed by R02/R03).

### Populated-path verification

The fixture artifact was temporarily installed and the app rebuilt:
`/dataset` rendered the quality report, statistics table, food-frequency
panel, provenance block and the sample-participant picker. Duplicate-ID
records were listed separately (never merged), missing values displayed as
"—" (never invented), and the demo labelling was present. The empty artifact
was then restored and the app rebuilt again.

---

## C3. Final stabilisation pass

### Root causes found and fixed

| # | Problem | Root cause | Fix |
|---|---|---|---|
| 1 | Landing page slow to load | The root layout mounted `DietPlanProvider`/`NutritionProvider`, which statically imported the diet generator → food database → dataset service → participant JSON, so every page (including the homepage) downloaded the engines | Engines are now loaded via dynamic `import()` on first use; freshness checks moved to a dependency-free `lib/freshness.ts`. Verified: **0** engine/food-DB/dataset strings in homepage chunks |
| 2 | Hero image heavy, layout shift | Raw `<img>` serving the 231 KB original | `next/image` with `fill`, `priority`, responsive `sizes` and reserved aspect ratio → ~39 KB mobile / ~91 KB desktop |
| 3 | **AI "Confirm" buttons did nothing** | All three write actions had `apply: () => {}` stubs, then the chat printed "Done" | Engine now returns serialisable action descriptors; the context executes them against real mutators and reports the genuine outcome (success or failure) |
| 4 | AI routed "find high-protein foods" to the protein-target answer | Broad `/protein/i` matched before the search intent | Explicit intent priority order; nutrition intents require "my/daily/target" |
| 5 | AI logged the wrong food to the wrong slot ("log banana" → Idli to other snacks) | Greedy regex, substring food match | Anchored verb+food+slot regex; whole-word food match |
| 6 | "add 250 ml water" mis-routed to food logging | Handler read only the matched fragment | Full message threaded through context; hydration prioritised |
| 7 | "the second one" follow-up ignored | Ordinal parsed from wrong group | Dedicated ordinal pattern reading conversation memory |
| 8 | Save → Recalculate → Generate built the plan against **stale** targets | `generate()` read React state before `recalculate()`'s update applied | `recalculate` now resolves with the processed profile; `generate` accepts explicit inputs |
| 9 | `onClick={generate}` leaked a MouseEvent as the argument | Direct handler binding | Wrapped in arrow functions (caught by the typechecker after (8)) |
| 10 | Voice auto-speak read/wrote a ref during render | Side effect in render body | Moved to `useEffect`; speaking state now driven by the synthesiser's own `onstart/onend` |
| 11 | "Replace meal" feature did not exist outside the AI stub | Never implemented | New `services/diet/replaceMeal.ts` reusing the generator's portion builders, recomputing totals from meals and **re-running the independent validator**; Replace picker + "Why this meal?" on every meal card |
| 12 | Development roadmap exposed to users | "Part 6/7/11", "Later parts", "Step 8", numbered roadmap on About | All removed/replaced with product language; verified by scanning rendered HTML of every page |
| 13 | AI promised a "Shopping List page" that does not exist | Dead reference | Shopping-list answer is now complete in itself, grouped by Produce/Protein/Grains/Dairy/Pantry |
| 14 | Dead code | 5 unused imports/functions | Removed (found with `tsc --noUnusedLocals`) |

### Production verification (this pass)

| Check | Result |
|---|---|
| `npm run build` | **PASS** — 10 pages, 2 API routes |
| `npm run start` cold GET on every route | **PASS** — all 200 with rendered `<main>`; unknown route 404; 0 server errors |
| Homepage bundle contains engine/food-DB/dataset code | **0 hits** |
| Dataset JSON chunks | route-scoped to `/dataset`; **not** on homepage |
| Hero image | served via `/_next/image` responsive `srcset` |
| Rendered-HTML scan for dev terminology (all 10 pages) | **0 real hits** |
| Regression suite | **34 / 34** (incl. Part-10 anchor plan byte-identical, meal replacement ×4, AI routing ×6) |
| Attachment suite | **13 / 13** |
| `tsc --noEmit`, `tsc --noUnusedLocals`, `eslint` | 0 errors, 0 warnings |

## D. Not verified in this environment

These require an interactive browser and were **not** automated. They should be
checked manually before the demonstration:

| Area | Reason |
|---|---|
| Click-through of the full questionnaire | Needs a real browser session |
| `localStorage` round-trip across a page reload / tab close | Needs a real browser; the underlying serialise/rehydrate logic is covered by T33–T35 |
| Responsive layout at 320/375/414/768/1024/1440 px | Needs a browser viewport; layouts use responsive Tailwind utilities and were reviewed in code |
| Browser print preview / Save-as-PDF output | Needs a print preview; dedicated `@media print` rules exist in `globals.css` |
| Screen-reader announcement behaviour | Needs assistive technology; semantic roles, labels and live regions are present in code |
| Cross-browser comparison | Only one runtime available here |
| Importing the REAL PDF dataset | **The PDF was never present in the project.** No participant records were fabricated; the pipeline was verified against a synthetic fixture only |
| Click-through of "Load sample participant" | Requires a browser session; the conversion logic and confirmation gate are covered in code review |

No claim of "all tests passed" is made beyond the 49 automated logic tests and
5 toolchain checks listed above.

## E. Phase 8 — final production readiness pass

Environment: Node 22.22.3, embedded PostgreSQL 18.4 (`npm run db:local`), fresh
`npm ci`, production server (`npm run build && npm run start`). API-level
verification with `curl` against two accounts (A, B); no headless browser was
available, so responsive/visual checks were code-level only.

| Command | Result |
|---|---|
| `npm run typecheck` | 0 errors |
| `npm run lint` | 0 errors, 0 warnings |
| `npm run build` | compiled, 23/23 pages, all routes present |
| `npm run engine:check` | ENGINE: ALL 34 PASS (new food-database integrity check included) |

**End-to-end flow (user A):** register → complete profile (`PUT /api/profile`) →
`/api/analytics` targets (2618 kcal / 84 g protein) → generate 7-day plan
(`POST /api/meal-plans` 201) → log food, water, weight, pantry item, grocery
item → recipes / favourites / pantry suggestions → assistant chat, actions,
recommendations, conversations → dataset upload → validate (mapping) → import
(64 / 3 rejected / 1 duplicate) → records, stats, CSV + HTML export → logout
(401 afterwards) → login → every entity still present.

**Authorization:** every owned resource (food log, water, progress, pantry,
grocery item, meal plan + duplicate/replace/regenerate/alternatives/servings,
dataset + records/stats/analysis/export/explain/delete) returns 404 for user B
and 401 anonymously. `/api/recipes` is intentionally public read-only.

**Input validation:** malformed JSON → 400 on every mutating route; water
< 10 ml / > 5000 ml, servings ≤ 0 / > 20, duplicate progress date (409),
invalid date keys, non-Gmail e-mail, short password, duplicate account (409),
wrong password (401) all rejected with safe messages, no stack traces.

**Uploads:** empty (400), random bytes (422, not stored), missing required
columns (staged with blocking report), PDF bytes named `.csv` (rejected by
signature), `.exe` (unsupported), attachment > 10 MB (413), corrupt PDF
(`status: failed`, no crash).

**Bugs fixed:** assistant classified "How much protein have I eaten today?" as
a general fact; `next.config.ts` shipped a hard-coded LAN IP in
`allowedDevOrigins`; `/api/plan` was requested twice on every page load by two
providers; production without `DATABASE_URL` silently used the in-memory dev
store (now 503 on auth routes); missing `scope="col"`/labels on several
dataset tables, search inputs and selects; `validateFoodDatabase()` was never
executed anywhere (now part of `engine:check`).

**Not verified here:** real browser rendering at 320 px, screen-reader
behaviour, XLSX upload path, an LLM provider (rule-based fallback only).
