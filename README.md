# Personalised Diet Planner

A web application that collects a user's personal details, nutritional goals,
dietary preferences, allergies, current food intake and lifestyle constraints,
stores them as a structured profile, processes that profile into estimated
nutritional targets, and generates a validated personalised daily diet chart.

Built as a 10-part college project.

---

## 1. Problem statement

Most diet charts are written for an "average" person. They ignore the user's
goal, body, activity level, food culture, allergies and daily routine, so they
are difficult to follow and can be unsafe for people with food allergies.

A useful planner has to do the opposite: collect the person's real information
first, and let the plan follow from it.

## 2. Objectives

1. Collect personal, nutritional, dietary and food-intake information.
2. Validate every input before it is used.
3. Record and store the information so it survives a page reload.
4. Process the stored profile into BMI, energy and macronutrient estimates.
5. Generate a personalised meal plan that respects declared restrictions.
6. Independently validate the plan before it is shown.
7. Display the plan as a clear, printable diet chart.

## 3. Features

**Data collection**
- Personal details (name, age, gender, height, weight, activity, occupation)
- Primary goal and optional calorie / protein targets
- Dietary pattern, preferred cuisines and free-text preference notes
- Allergies, intolerances, foods to avoid, preferred foods
- Food intake for six meal slots with structured quantity + unit per item
- Meal timings, meal frequency, snacking and late-night habits
- Water intake (litres or glasses, converted to a canonical value)
- Practical constraints: schedule, food availability, prep time, weekends
- Additional free-text information

**Storage**
- Explicit save (no autosave), profile versioning, `createdAt` / `updatedAt`
- Load on start, edit, save changes, start new profile, delete profile
- Corrupt / missing / older data recovered with safe defaults

**Processing**
- BMI + general screening category
- Resting energy (Mifflin-St Jeor), maintenance energy, goal-based target
- Protein, carbohydrate and fat targets
- User-provided targets always take priority over estimates
- Expandable "How was this calculated?" panel showing every formula

**Diet generation**
- 53-item structured food dataset with nutrition, ingredients, allergens,
  cuisines, prep time and realistic portion bounds
- Restriction filtering, preference scoring, portion scaling, day balancing
- Controlled variation so "Regenerate" produces genuine alternatives
- Independent final safety validator with a per-category check report

**Presentation**
- Diet dashboard: meal cards, timeline, target-vs-planned bars, safety
  summary, dynamic personalisation factors, recommendations
- Print / Save-as-PDF layout
- Responsive from 320 px upwards, keyboard accessible

**Personal AI & voice**
- Rule-based nutrition assistant grounded in your real profile, targets and plan
- Food search, follow-up memory ("the second one"), grouped shopping list
- Write actions — replace a meal, log a food, add water — always confirmed first
  and executed against real state; the assistant reports the true outcome
- Voice input/output via the Web Speech API, with automatic text fallback

**Meal replacement**
- Every meal card has **Replace** (safe alternatives only) and **Why this meal?**
- A swap is re-validated by the independent safety checker before it is applied

**Universal attachments**
- PDF, DOCX, TXT, RTF, ODT, CSV, XLSX, JSON, XML, PPTX, HTML, JPG/PNG/WEBP
- Real PDF text extraction (pdf.js), Office documents (jszip), CSV/JSON/XML parsing
- Magic-byte type detection (never trusts the extension alone)
- Per-file provenance (page/sheet/slide/row) and confidence levels
- Review-before-import: extracted values are candidates, never auto-applied
- Safety restrictions (allergies, intolerances, avoid lists) are never overwritten
- Scanned/image-only PDFs detected and explained, not guessed
- Macro-enabled files: macros never executed
- Duplicate detection by content hash
- File/session size limits, corrupt-file handling, unsupported-format guidance

## 4. Technology stack

| Technology | Used for |
|---|---|
| Next.js 16 (App Router) | Routing, pages, production build |
| React 19 + TypeScript | Components and central state |
| Tailwind CSS v4 | Design system and responsive styling |
| lucide-react | Icon set |
| Browser `localStorage` | Profile, targets and plan persistence |
| Drizzle ORM + PostgreSQL | Server-side persistence for accounts, profiles, plans, datasets and attachments |

> The planner itself is entirely client-side. No user data is sent to a server
> or any third-party service.

## 5. Architecture

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
              STORAGE SERVICE  (src/services/profileStorage.ts)
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
| Where data is stored | `services/profileStorage.ts` | the only module touching `localStorage` |
| Nutrition maths | `services/nutrition/*` | nothing else calculates BMI/BMR/targets |
| Meal selection | `services/diet/*` | the UI never generates meals |
| Safety verdict | `services/diet/planValidator.ts` | runs independently of the filters |
| Next user action | `lib/appStatus.ts` | every page reads the same state machine |

## 6. Folder structure

```
src/
├── app/                        Routes (App Router)
│   ├── page.tsx                Home
│   ├── planner/                Questionnaire (steps 1–5)
│   ├── review/                 Review + Save
│   ├── nutrition/              Processed nutrition dashboard
│   ├── diet-plan/              Final diet chart
│   ├── profile/                Saved-profile management
│   ├── dataset/                Dataset Insights (demo/reference area)
│   ├── attachments/            Universal document upload + review
│   ├── about/                  Project information
│   ├── error.tsx, not-found.tsx
│   └── api/health/             Template healthcheck
├── components/
│   ├── layout/                 Header, Footer
│   ├── ui/                     Button, Card, inputs, chips, dialog, steps
│   ├── home/                   Landing sections
│   ├── planner/                Questionnaire steps + food-intake widgets
│   ├── review/                 Reusable summary cards
│   ├── nutrition/              Nutrition dashboard
│   ├── diet-plan/              Meal cards, comparison, safety summary
│   ├── dataset/                Insights view + sample-participant loader
│   └── common/                 NextStepCard, ConflictNotice
├── context/                    ProfileContext, NutritionContext, DietPlanContext
├── data/
│   ├── options.ts              Option catalogue + label helpers
│   ├── foods/                  Food database + its quality checker
│   └── dataset/                Participant dataset: schema, mappings,
│                               normalizer, validator, analytics, loader,
│                               similarProfiles, participants.clean.json
├── services/
│   ├── profileStorage.ts       Persistence
│   ├── nutrition/              bmi, energy, macronutrients, processor, constants
│   ├── diet/                   config, filters, scoring, generator, validator,
│   │                           recommendations, personalisation
│   ├── dataset/                datasetService (analytics, similarity, samples)
│   └── attachments/            config, pipeline, processors, engine, conflicts,
                                storage, clientUtils, pdf, office
├── lib/                        validation, appStatus, conflicts, normalise, numbers
├── hooks/                      useAppStatus, useUnsavedChangesWarning
└── types/profile.ts            All canonical data models

scripts/importDataset.ts        Offline dataset importer (Node 22+)
scripts/fixtures/               Synthetic importer test fixture
data/raw/                       Where the PDF extraction is placed
docs/                           Architecture, testing, dataset and viva notes
```

## 7. Complete workflow

```
Enter details → Validate → Review → Save → Stored profile
      → Process → BMI / energy / macro targets
      → Filter food database → Score → Select meals → Balance
      → Final safety validation → Diet chart → Regenerate / Print
```

## 8. Data model

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

## 9. Storage

`localStorage`, three separate keys:

| Key | Contents |
|---|---|
| `PERSONALISED_DIET_PLANNER_PROFILE` | The user's own answers |
| `PERSONALISED_DIET_PLANNER_PROCESSED_PROFILE` | Derived nutrition targets |
| `PERSONALISED_DIET_PLANNER_CURRENT_PLAN` | The generated diet plan |

Derived data is kept apart so it can never contaminate the source profile.
Reads pass through `rehydrateProfile()`, which rebuilds a fully-shaped profile
from arbitrary JSON — corrupt data, missing sections and numeric strings all
resolve to safe defaults instead of crashing.

## 10. Nutrition processing

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

## 11. Diet generation algorithm

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

## 12. Safety and validation

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

## 13. Installation

```bash
npm install
```

Requires Node.js 20+ (22+ recommended — the dataset importer uses built-in
TypeScript type stripping). No native dependencies.

## 14. Running

Before starting the app, configure the PostgreSQL database used by the server:

1. Copy `.env.example` to `.env`.
2. Replace `DATABASE_URL` with the connection string from your hosted PostgreSQL provider.
3. Create or update the database tables:

```bash
npm run db:push
```

The same `DATABASE_URL` is used by the Next.js server and Drizzle. Keep `.env`
local and never commit database credentials. If the provider requires TLS,
use the complete connection string it provides, including options such as
`sslmode=require`.

**Local development without a hosted database**

A fully local PostgreSQL can run inside Node — no system install required:

```bash
npm run db:local
```

This starts an embedded PostgreSQL on `127.0.0.1:5432` (data lives in the
gitignored `.pgdata/` folder) and creates the `nutriplan` database on first
run. Then point `.env` at it:

```
DATABASE_URL=postgresql://nutriplan:nutriplan@127.0.0.1:5432/nutriplan
```

and run `npm run db:push`. Delete `.pgdata/` to reset the database.

When `DATABASE_URL` is not set, development authentication uses a temporary
in-memory store so the website and account flow can still be tested. Those
accounts disappear when the development server restarts. Configure PostgreSQL
for durable account and server-side profile storage.

Accounts are **Gmail-only**: sign-up and sign-in accept an address on
`gmail.com` and reject every other domain (`xyz.com`, `yahoo.com`,
`college.edu`, …). The rule lives in `src/lib/email.ts` and is applied by both
the login form and the `/api/auth/register` and `/api/auth/login` routes.

### Using the dataset workflow

The Dataset Management page follows this pipeline:

`User enters details → data is recorded and stored → data is processed → a personalised diet chart is generated`

Upload a readable CSV, TSV, XLSX, JSON, PDF or document dataset. After it is
processed, use **Use first record** on a ready dataset to open that participant
in the planner. Complete any missing details, save the profile, calculate
nutrition, and generate the validated diet chart. Dataset quality flags and
statistics remain visible so questionable records are not treated as facts.

To use the same account, profile, calculated nutrition, plans and datasets on
another phone or computer, the app must use one shared hosted PostgreSQL
database. Put the provider's connection string in `.env`, run `npm run db:push`,
and deploy the app with that same `DATABASE_URL`. Without it, development mode
uses temporary in-memory authentication and dataset storage; another device or
a server restart cannot see those records.

**Development**

```bash
npm run dev          # http://localhost:3000, hot reload
```

**Production (this is what you deploy)**

```bash
npm run build        # compiles and optimises; must complete with no errors
npm run start        # serves the production build on http://localhost:3000
npm run start -- -p 8080   # any other port
```

Always test the production build, not just `npm run dev` — that is the
form users open externally.

**Quality gates**

```bash
npm run lint         # ESLint (0 errors, 0 warnings expected)
npm run typecheck    # tsc --noEmit
```

## 15. Configuration & deployment

| Item | Value |
|---|---|
| Environment variables | `DATABASE_URL` (PostgreSQL) — **required** for accounts and persistence. See `.env.example`. The planner needs **no** API keys. |
| Backend | Ships with the app: Next.js route handlers + PostgreSQL via Drizzle. Sessions, profiles, plans, attachments and datasets are stored server-side; `localStorage` is kept as an instant-paint cache and offline fallback. |
| External services | None. No AI API, no analytics, no remote images. Everything runs locally. |
| Voice | Uses the browser's built-in Web Speech API. Works in Chrome/Edge; other browsers fall back to text automatically. Requires HTTPS (or `localhost`) for microphone access. |
| Hosting | Any Node host that can run `next start` and provide a PostgreSQL database (Vercel + Neon, Render, Railway, Fly, a VPS). Static export is **not** used — authentication and file processing are server routes. |
| Authentication | E-mail + password. scrypt hashing with per-user salts, opaque session tokens (only their SHA-256 is stored) in an httpOnly `sameSite=lax` cookie. Passwords are never returned or logged. |
| CORS | Not applicable: the API is same-origin with the app, so no CORS configuration (and no wildcard origins) is needed on any deployment domain. |
| Absolute URLs | None are hard-coded. All navigation and API calls are relative, so the app works on any domain or port. |

### Performance notes

- The landing page ships **no** engine code: the nutrition processor, diet
  generator, food database, dataset and AI engine are all loaded on demand
  via dynamic `import()` when the user first needs them.
- The landing hero is a Ken Burns video (`public/hero.mp4`) generated offline
  from four dark food stills (`scripts/hero-video`). Type is Inter Variable
  (body) and Plus Jakarta Sans (display).
- Attachment parsing (pdf.js, jszip) runs **server-side**, never in the
  browser bundle.

## 16. Limitations

- Nutrition values in the food dataset are **approximate** and vary with
  recipe, brand, portion and cooking method. They are not laboratory figures.
- BMI and energy figures are **estimates**, not measurements, and BMI is only a
  general screening measure.
- Meal variety is bounded by the 53-item local dataset.
- Portion scaling is linear, which is an approximation.
- One dish per meal slot; plans are for a single day, not a week.
- `localStorage` is per-browser, per-device, unencrypted and ~5 MB. It is not a
  secure medical record store; no passwords or identifiers are collected.
- Personalisation is **rule-based**, not a clinical assessment.
- **This application is not a medical device and is not a substitute for advice
  from a qualified healthcare or nutrition professional.**

## 17. Reference dataset

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

## 18. Attachments

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

## 21. Future enhancements

- Larger, externally verified food database
- Weekly plans and grocery-list generation
- Recipe/preparation instructions
- Cloud sync and multi-user accounts
- Progress tracking over time
- Review by a qualified nutritionist

---

## Documentation

| Document | Contents |
|---|---|
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Layers, data flow, ownership rules, state machine, safety pipeline |
| [`docs/TESTING.md`](docs/TESTING.md) | Test report, bugs fixed, what was and was not verified |
| [`docs/DATASET.md`](docs/DATASET.md) | Dataset schema, cleaning rules, quality report, import methodology |
| [`docs/VIVA.md`](docs/VIVA.md) | Viva Q&A and the demonstration script |
