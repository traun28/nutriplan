# Architecture and data flow

## Layer diagram

```
┌──────────────────────────────────────────────────────────────┐
│ PRESENTATION            src/app/**, src/components/**        │
│ Pages, forms, cards, dashboard, print layout.                │
│ Rule: displays data. Never calculates, never generates.      │
└───────────────────────────┬──────────────────────────────────┘
                            │ reads / dispatches
┌───────────────────────────▼──────────────────────────────────┐
│ STATE                   src/context/**                       │
│ ProfileContext   – the one UserProfile + save/delete         │
│ NutritionContext – processed targets + stale flag            │
│ DietPlanContext  – generated plan + generation status        │
└───────────────────────────┬──────────────────────────────────┘
                            │ calls
┌───────────────────────────▼──────────────────────────────────┐
│ DOMAIN LOGIC            src/lib/**, src/services/**          │
│ validation.ts      – field, section and whole-profile rules  │
│ appStatus.ts       – the application state machine           │
│ conflicts.ts       – contradictory-answer detection          │
│ profileNormalize.ts– normalise / rehydrate / compare         │
│ profileStorage.ts  – the ONLY module touching localStorage   │
│ nutrition/*        – BMI, energy, macronutrients             │
│ diet/*             – filters, scoring, generator, validator  │
└───────────────────────────┬──────────────────────────────────┘
                            │ reads
┌───────────────────────────▼──────────────────────────────────┐
│ DATA                    src/data/**, src/types/profile.ts    │
│ options.ts     – selectable values + display labels          │
│ foods/*        – the food dataset + its quality checker      │
│ types/profile  – every canonical model                       │
└──────────────────────────────────────────────────────────────┘
```

## End-to-end data flow

```
 1  User types in a form
        │  bound directly to the central UserProfile
 2  Field validation             lib/validation.ts
        │  errors shown on blur, or for all fields on Continue
 3  Review page
        │  validateCompleteProfile() lists anything missing
 4  Save  ──────────────────────► services/profileStorage.ts
        │  normalise → assign profileId/createdAt → set updatedAt
        │  write to PERSONALISED_DIET_PLANNER_PROFILE
 5  Reload
        │  getProfile() → rehydrateProfile() → safe, fully-shaped profile
 6  Calculate  ─────────────────► services/nutrition/nutritionProcessor.ts
        │  validate inputs → BMI → BMR → maintenance → goal target
        │  → protein → fat → carbohydrates
        │  write to PERSONALISED_DIET_PLANNER_PROCESSED_PROFILE
 7  Generate  ──────────────────► services/diet/dietGenerator.ts
        │  slots → distribution → FILTER → SCORE → select → scale → balance
 8  Validate  ──────────────────► services/diet/planValidator.ts
        │  re-check every meal → item → ingredient from the raw dataset
        │  fail ⇒ exclude offending foods, retry (max 4), else safe failure
        │  pass ⇒ write to PERSONALISED_DIET_PLANNER_CURRENT_PLAN
 9  Display                       app/diet-plan/page.tsx
        │  reads plan.summary, plan.meals, plan.dailyTotals, plan.validation
10  Regenerate / Edit / Print
```

## Ownership rules (no duplicated logic)

| Question | Answered by | Everyone else |
|---|---|---|
| Is this input valid? | `lib/validation.ts` | imports it |
| Where does data live? | `services/profileStorage.ts` | never touches `localStorage` |
| What are my targets? | `services/nutrition/*` | reads `ProcessedProfile` |
| Which foods are allowed? | `services/diet/filters.ts` | scoring only sees survivors |
| Is this plan safe? | `services/diet/planValidator.ts` | trusts its verdict |
| What should I do next? | `lib/appStatus.ts` | renders its `action` |

Part 6 never generates meals. Part 7 never recalculates BMI or calorie targets.
Part 8 never sums nutrition — it displays `dailyTotals`, which Part 7 computed
from the actual chosen meals.

## Application state machine

`lib/appStatus.ts` returns exactly one state, so two pages can never disagree:

| State | Meaning | Primary action |
|---|---|---|
| `profile_empty` | nothing entered | Create My Profile |
| `profile_incomplete` | required answers missing | Complete Profile |
| `profile_unsaved` | valid but not saved / edited since save | Review & Save Profile |
| `nutrition_missing` | saved, targets not calculated | Calculate Nutrition |
| `nutrition_stale` | profile changed after calculation | Recalculate Nutrition |
| `plan_missing` | targets ready, no plan | Generate Diet Plan |
| `plan_stale` | profile changed after generation | Generate New Plan |
| `plan_invalid` | plan failed its safety check | Generate New Plan |
| `plan_ready` | everything current | View Diet Plan |

Freshness is decided by comparing `updatedAt` on the profile with
`sourceProfileUpdatedAt` recorded on the processed profile and on the plan.

## Safety pipeline

```
                 declared restrictions
                          │
        ┌─────────────────▼─────────────────┐
        │ 1. FILTER  (before any scoring)   │
        │    dietary → allergy →            │
        │    intolerance → foods to avoid   │
        └─────────────────┬─────────────────┘
                          │ survivors only
        ┌─────────────────▼─────────────────┐
        │ 2. SCORE + SELECT                 │
        │    preferences can reorder, but   │
        │    can never re-add a rejection   │
        └─────────────────┬─────────────────┘
                          │ candidate plan
        ┌─────────────────▼─────────────────┐
        │ 3. INDEPENDENT VALIDATOR          │
        │    re-checks every ingredient     │
        │    from the raw dataset record    │
        └────────┬───────────────┬──────────┘
            pass │               │ fail
                 ▼               ▼
            show plan    exclude offending foods,
                         retry (max 4 attempts),
                         else structured safe failure
```

Allergy detection uses both the food's allergen metadata and a word-boundary
ingredient scan, so indirect allergens are caught. Conflicting answers are
explained to the user but never silently removed from their saved profile.
