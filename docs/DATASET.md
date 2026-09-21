# Part 11 — Dataset ingestion, cleaning, validation & integration

## 0. Status of the source document (read this first)

**No PDF (or any dataset extraction) was present in this project when Part 11
was implemented.** The repository was searched end to end — including
`data/`, `public/`, `/tmp`, `/home`, `/mnt` and the whole filesystem — and no
`.pdf`, `.csv` or participant file exists.

Because the brief explicitly forbids inventing data ("DO NOT silently invent
missing values", "Do not claim a provenance or data source that is not actually
present in the supplied document"), **no participant records were fabricated**.
Instead:

- the complete ingestion pipeline was implemented and is fully wired into the
  application;
- it was verified end-to-end against a **clearly-labelled synthetic fixture**
  (`scripts/fixtures/synthetic-sample.tsv`) that deliberately contains every
  edge case the brief lists;
- the committed artifact `src/data/dataset/participants.clean.json` currently
  holds **0 records** with `populated: false`, which is the honest state;
- the whole application degrades gracefully and behaves **byte-identically** to
  Part 10 while the dataset is empty (proved below).

Drop the real extraction into `data/raw/` and run the importer, and this page's
pipeline populates with no code changes.

---

## 1. Import methodology

```
Supplied PDF
   │  (extract the participant table — see data/raw/README.md)
   ▼
data/raw/participants.tsv | .csv | .json
   │
   ▼
scripts/importDataset.ts        ← run with Node 22+ (built-in TS type stripping)
   │   parse delimited table (quoted fields, page markers, repeated headers)
   │   → normalise each row        src/data/dataset/normalizer.ts
   │   → validate across dataset   src/data/dataset/validator.ts
   │   → compute statistics        src/data/dataset/analytics.ts
   ▼
src/data/dataset/participants.clean.json   ← committed artifact
   ▼
src/data/dataset/loader.ts                 ← app reads the artifact (never the PDF)
   ▼
src/services/dataset/datasetService.ts     ← public API for UI + generator
```

Run it:

```bash
node scripts/importDataset.ts                                  # uses data/raw/*
node scripts/importDataset.ts --source path/to/extraction.tsv  # explicit source
node scripts/importDataset.ts --source X --out /tmp/check.json # dry run
```

The importer imports the **same** normaliser/validator modules the application
uses, so the cleaning rules exist exactly once. Nothing is duplicated between
"the script" and "the app".

The deployed application never parses a PDF or a raw file at runtime
(requirement 28–29): extraction happens once, offline, and the result is a
committed JSON artifact.

### Reproducibility

Same source + same `PARSER_VERSION` (`1.0.0`) ⇒ identical output. The only
non-deterministic field is `importedAt`; every other value is derived
deterministically, and no random transformation is applied anywhere.

---

## 2. Schema

`DatasetParticipant` (`src/data/dataset/schema.ts`) — deliberately a different
shape from `UserProfile` so the two can never be confused:

| Field | Type | Notes |
|---|---|---|
| `participantId` | `string` | **Primary identifier.** Names are never used as keys. |
| `name` | `string` | Whitespace-cleaned display name; may repeat. |
| `age` | `number \| null` | Positive integers only. |
| `genderSource` | `string` | Exact source wording, e.g. `"Female"` — preserved. |
| `gender` | `Gender \| null` | App enum where unambiguous, else `null` + flag. |
| `heightCm` | `number \| null` | Numeric only — never `"180 cm"`. |
| `weightKg` | `number \| null` | Numeric only — never `"74 kg"`. |
| `activityLevelSource` | `string` | Exact source wording, e.g. `"Light"`. |
| `activityLevel` | `ActivityLevel \| null` | Via the documented mapping. |
| `meals` | `{breakfast[], lunch[], dinner[], snacks[]}` | Structured arrays. |
| `nutrition` | 7 numeric fields | `caloriesKcal`, `proteinG`, `carbohydratesG`, `fatG`, `dietaryFibreG`, `sugarG`, `sodiumMg`. |
| `nutritionDiagnostics` | object | Source vs macro-derived calories, kept side by side. |
| `outliers` | `string[]` | Flagged, never deleted. |
| `quality` | `{status, issues[], needsReview}` | See §4. |
| `sourceMetadata` | object | `sourceFile`, `sourcePage`, `sourceRow`, `importedAt`, `parserVersion`. |

---

## 3. Cleaning rules (all of them, nothing hidden)

| # | Rule | Behaviour |
|---|---|---|
| 1 | Whitespace | Trim + collapse internal runs. Spelling is never altered. |
| 2 | Numeric extraction | Tolerates units and thousands separators: `"180 cm"` → `180`, `"1,853 kcal"` → `1853`. |
| 3 | Blank / `-` / `n/a` | Treated as absent → `null`, never `0`. |
| 4 | Negative measurements | Age, height, weight `≤ 0` → rejected to `null` + `parse_error`. |
| 5 | Negative nutrition | Rejected to `null` + `parse_error`; listed in `rejectedValues`. |
| 6 | Non-numeric text | `"twenty"` → `null` + `parse_error` quoting the original text. |
| 7 | Meal splitting | Splits **only** on reliable separators: `,` `;` `\|` `and` `&` `/`. |
| 8 | Concatenation | A lower→upper case boundary inside a token (`ShakeSamosa`) ⇒ **not split**, kept verbatim, flagged `ambiguous`. |
| 9 | Activity labels | Mapped via `ACTIVITY_MAP`; unmapped ⇒ `null` + `needs_review`. |
| 10 | Gender labels | Formatting only; unmapped ⇒ `null` + `needs_review`. Source wording always retained. |
| 11 | Repeated headers | A later page's header row is detected and skipped, not imported as data. |
| 12 | Page provenance | From a `# page=N` marker line or a `_page` column; both optional. |

### Documented mapping assumptions

The dataset labels are not identical to the application's, so the mapping is a
stated judgement, not an equivalence:

| Source | → Application | Assumption |
|---|---|---|
| Sedentary / Low / Inactive | `sedentary` | direct |
| Light / Lightly Active | `lightly_active` | the source has no separate "Lightly Active" label, so "Light" is the nearest match |
| Moderate / Moderately Active | `moderately_active` | direct |
| Active | `very_active` | "Active" is read as a genuinely active lifestyle, one step above "Moderate" |
| Very Active / Extremely Active / Athlete | `extremely_active` | the source's most active label maps to the app's most active id |

Anything not listed maps to `null` and is flagged — it is never guessed.

---

## 4. Data quality flags

Status precedence (worst wins): `parse_error` > `ambiguous` > `missing_value` >
`needs_review` > `clean`.

Each record also carries `issues[]` in plain language and a `needsReview`
boolean. The dataset-level report aggregates: total, clean, needs review, parse
errors, ambiguous meals, missing values, calorie inconsistencies, outliers,
duplicate IDs, gaps in the ID sequence, duplicate names, and an issue-frequency
table.

**Nothing is ever silently corrected.** Where the source is uncertain the record
is flagged for a human to check against the PDF.

### Nutrition consistency (source values preserved)

For every record with protein, carbs and fat:

```
macroDerivedCalories = protein×4 + carbohydrates×4 + fat×9
calorieDifference    = macroDerivedCalories − sourceCalories
```

Thresholds: ≤5% `consistent`, ≤15% `minor_difference`, >15% `inconsistent`
(⇒ `needs_review`). **`sourceCaloriesKcal` is never overwritten** — both figures
are stored so the discrepancy stays visible and auditable.

### Outliers

Flagged, not removed: age 10–100, height 120–220 cm, weight 30–200 kg,
calories 500–6000, sodium 0–10000 mg, plus derived BMI 12–50.

### Duplicates

- **Duplicate participant IDs** are reported, never merged.
- **Duplicate names** are reported separately and explicitly *not* treated as
  duplicate records — the ID is the identifier.
- **Gaps in the ID sequence** are reported (guarded against absurd ranges).

---

## 5. Verification performed

The pipeline was run against `scripts/fixtures/synthetic-sample.tsv` — a
**synthetic** fixture, clearly headed as *not* from the PDF, containing 14 rows
built to hit every case in requirement 59. Actual results:

| Case | Record | Expected | Actual |
|---|---|---|---|
| First record | 1001 | clean, `["Idli","Sambar"]` | **PASS** |
| Last record | 1200 | clean | **PASS** |
| Whitespace name | 1002 `" Arun Kumar "` | `"Arun Kumar"` | **PASS** |
| Unit stripping | 1002 | `178`, `82` | **PASS** |
| Duplicate ID | 1005 ×2 | reported, not merged | **PASS** — `Duplicate IDs: 1005` |
| Duplicate name | Zoya Singh ×2 | reported, both kept | **PASS** — `Duplicate names: 1` |
| Missing fields | 1006 | `missing_value`, lists fields | **PASS** — age/height/weight |
| Malformed numerics | 1007 | `parse_error` | **PASS** — `"twenty"`, `"abc"`, `"not-a-number"` quoted |
| Negative weight | 1007 `-70 kg` | rejected to `null` | **PASS** |
| Negative protein | 1011 `-12` | rejected + listed | **PASS** — `rejectedValues:["proteinG"]` |
| Ambiguous meal text | 1008 `"Protein ShakeSamosa"` | **not** split, flagged | **PASS** — `ambiguous`, text kept verbatim |
| Empty meals | 1009 | flagged, no invented food | **PASS** — `needs_review` |
| Calorie mismatch | 1010 (1200 vs 2490 derived) | both kept, flagged | **PASS** — `inconsistent`, 108% |
| Unmapped activity | 1011 `"Ultra Active"` | `null` + flag | **PASS** |
| Unmapped gender | 1011 `"Other"` | `null`, source preserved | **PASS** |
| Outliers | 1012 | flagged, not deleted | **PASS** — 5 flags incl. derived BMI 4.0 |
| ID gap | 1013–1199 absent | reported | **PASS** — 187 IDs listed |
| Statistics use valid records only | — | flagged rows excluded | **PASS** — 7 of 14 |
| Provenance | — | page + row stored | **PASS** — `sourcePage:1, sourceRow:9` |
| No negative/zero survives | — | none in clean output | **PASS** — verified programmatically |

Two bugs were found in my own importer by this fixture run and fixed:
1. Records with blank **required** fields were being marked `clean` instead of
   `missing_value`.
2. Negative height/weight were flagged as outliers but still **stored**; they
   are now rejected to `null` so they can never reach statistics or BMI.

### No-regression proof (Parts 1–10 unaffected)

With the dataset empty, a verification run confirmed:

- every food candidate receives `datasetFit = 0.5` — a single distinct value,
  i.e. a **constant**, which mathematically cannot reorder candidates;
- Profile A (vegetarian, weight loss, South Indian, seed 31) still produces
  exactly the plan documented in `docs/TESTING.md`: *Idli with Sambar, Roasted
  Chana, Quick Dal and Rice Bowl, Fruit and Yogurt Cup, Quinoa and Chickpea
  Bowl*, target 2125 kcal, planned 2138 kcal — `matchesDocumentation: true`;
- peanut-allergy plan: 0 peanut occurrences, all safety checks passed;
- vegan plan: every item vegan-compatible, valid;
- `getDatasetStatistics()` → `null`, `getSimilarProfiles()` → `[]`,
  `getDatasetSignal()` → neutral. No exceptions anywhere.

---

## 6. How the dataset influences the application

Ranking order, unchanged from Part 7 except for one new light signal:

```
Safety (filters) > Diet compatibility > Nutritional fit > Goal fit >
Practical fit > User preference > DATASET SIGNAL > Variety
```

`SCORE_WEIGHTS.datasetSignal = 0.5` — the lightest weight in the model, below
every user-driven signal. It can only *nudge* a choice between two meals that
already satisfy the user's targets and restrictions.

What it does **not** do:
- it never copies a participant's meals into the user's plan (requirement 55);
- it never overrides an allergy, intolerance, dietary pattern, food-to-avoid,
  goal or calculated target;
- it makes no clinical or causal claim — the dataset records what participants
  reported eating, not what worked for them.

When the plan does use the signal, one honest line is added to the plan's
"Why this plan is personalised" list:
*"Reference-dataset signal from N similar participant record(s) (auxiliary
only)"*. With no dataset, that line is absent.

---

## 7. Separation from the user profile

| | |
|---|---|
| `UserProfile` | what the current user entered — the source of truth, saved to `localStorage` |
| `DatasetParticipant` | reference data from the dataset — read-only, never saved as a profile |

Nothing in `services/dataset/` writes to the user profile. The demo feature
produces a **patch** that the UI offers to prefill; saving remains an explicit,
confirmed action. Participant records are only reachable from `/dataset`, a
page labelled *"Demo / reference area"* and linked from the footer (not the
primary navigation), so dataset data never appears in the normal user flow.
No participant data is ever placed in a URL.

### Demo sample loading

`/dataset` → *Load a sample participant*: search by **Participant ID**, preview
Name / Age / Height / Weight / Activity, then load. If any profile data already
exists, a confirmation dialog is required first — the saved profile is never
silently overwritten. The prefilled occupation reads "Dataset sample
participant" so demo data is always visibly labelled, and the fields the dataset
cannot supply (goal, dietary pattern, allergies, timings, water) are listed
rather than invented.

---

## 8. Fallback behaviour

If the artifact is missing, empty or malformed, `loadDataset()` returns an empty
dataset instead of throwing, and every service function returns an empty/neutral
result. The user profile, nutrition processing, diet generation and dashboard
all continue to work exactly as in Part 10. **The dataset is an enhancement,
never a dependency.**

---

## 9. Limitations

- The source PDF was not available, so the committed dataset is empty. All
  pipeline behaviour was verified against a synthetic fixture, not the real
  document.
- Concatenated PDF text can only be *flagged*, not repaired, without the
  original document; ambiguous rows need human verification.
- Page/row provenance depends on the extraction preserving page markers.
- Nutrition values are source-provided and not medically authoritative.
- The dataset's composition may not represent any real population.
- Similarity and food-frequency figures are descriptive statistics, not
  evidence of health outcomes.

## 10. Re-importing later

1. Replace `data/raw/participants.tsv` with the new extraction.
2. Bump `PARSER_VERSION` in `src/data/dataset/schema.ts` if you change any rule.
3. `node scripts/importDataset.ts`
4. Review the printed summary; resolve `ambiguous` / `parse_error` rows against
   the PDF and note any manual correction here.
5. `npm run build`.

## 11. Viva answer

> "The project uses the supplied participant dataset as a structured reference
> dataset. The source PDF is first extracted to a delimited table, then an
> offline importer normalises and validates each record, flags ambiguous
> extractions instead of guessing, checks nutrition consistency without
> overwriting source values, and writes a cleaned JSON artifact. The
> application reads that artifact through a dataset service and uses it for
> analytics, demo sample profiles and one lightly-weighted ranking signal. The
> user's own profile stays completely separate, and the dataset can never
> override allergies, dietary restrictions or calculated targets — if it fails
> to load, the planner works exactly as before."
