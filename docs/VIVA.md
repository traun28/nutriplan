# Viva notes and demonstration script

## One-paragraph summary (memorise this)

> Our application collects the user's personal details, nutritional goals,
> dietary preferences, allergies, current food intake and lifestyle
> information. The information is validated and stored as a structured
> profile. The application then processes the profile to estimate BMI, energy
> requirements and macronutrient targets. A rule-based engine filters a food
> database according to allergies and dietary restrictions, ranks the
> remaining meals using the user's goal and preferences, and builds a daily
> plan. The plan is validated one final time and displayed as a personalised
> diet chart.

---

## Questions and answers

**Q1. What does the project do?**
It turns a person's own information into a personalised daily diet chart,
instead of showing the same generic chart to everyone.

**Q2. What data does the user enter?**
Personal details (age, gender, height, weight, activity, occupation); their
goal and optional calorie/protein targets; dietary pattern, cuisines,
allergies, intolerances, preferred foods and foods to avoid; current food
intake for six meal slots with quantities; meal timings, meal frequency,
snacking and late-night habits; water intake; and practical constraints such
as cooking time and food availability.

**Q3. How is the data stored?**
As JSON in the browser's `localStorage`, through a single storage service
(`src/services/profileStorage.ts`). Three separate keys are used: the profile,
the calculated targets and the generated plan. Derived data is kept apart so it
can never overwrite what the user actually typed. The profile carries a version
number, `profileId`, `createdAt` and `updatedAt`. Saving is an explicit button
press — there is no autosave.

**Q4. How is the data processed?**
`src/services/nutrition/` reads the stored profile and produces a separate
`ProcessedProfile` containing BMI, resting energy, maintenance energy, the
goal-based calorie target and the three macronutrient targets. The original
profile is never modified.

**Q5. How is BMI calculated?**
`BMI = weight(kg) ÷ height(m)²`. Height is stored in centimetres, so it is
divided by 100 first. For 170 cm and 65 kg the result is 22.5. It is shown with
a general screening category and a note that BMI is not a complete assessment
of health.

**Q6. How are calorie requirements estimated?**
Mifflin-St Jeor: `10·weight + 6.25·height − 5·age + c`, where `c` is +5 for
male and −161 for female. That gives resting energy, which is multiplied by an
activity factor (1.2 to 1.9) to get maintenance energy. The goal then applies a
modest adjustment — for example −15% for weight loss. If the user entered their
own calorie target, that value is used instead, and the screen says so.
If the user chose "Other" or "Prefer not to say" for gender, we do not assume a
sex: we use the midpoint of the two published constants and label the result as
a broader approximation.

**Q7. How does personalisation work?**
Every candidate meal is scored on eight signals: how well it fits the slot's
calorie budget, its protein contribution, tags matching the user's goal, the
user's preferred foods, preferred cuisines, similarity to what they already
eat, preparation time against their stated limit, and variety. The plan
therefore changes with goal, activity, diet, allergies, cuisine, timings,
habits and calculated targets.

**Q8. How are allergies handled?**
This is the most important safety rule. Allergens are stored separately in the
profile, and every food in the database lists both its allergens and its
ingredients. Before any scoring happens, foods matching a declared allergen are
removed — checking ingredients too, so a "Banana Peanut Butter Smoothie" is
caught by a peanut allergy even though "peanut" is not the first word of the
name. After the plan is built, a completely separate validator re-checks every
meal, item and ingredient. If anything fails, the plan is discarded, not shown
with a warning. The priority order is:
`allergy > intolerance > dietary pattern > foods to avoid > preference`.

**Q9. How is the diet generated?**
Nine steps: read the targets; choose the meal slots; split the calories across
them; filter out incompatible foods; score the rest; pick from the top few
candidates with a seeded random choice; scale the portions; balance the day;
validate. Regenerating uses a different seed and excludes the previous main
dishes, so the user gets genuine alternatives that are still safe.

**Q10. How does the application display the plan?**
A dashboard shows the profile summary, the day at a glance, one card per meal
(time, dish, portions, calories and macros, preparation time, expandable
ingredients), target-vs-planned bars, the restriction-check report, the dynamic
list of personalisation factors, general recommendations and a disclaimer. It
also has a print layout for saving as PDF.

**Q11. What happens if a suitable meal cannot be found?**
The system fails safely. It never inserts a random or unsafe fallback meal. If
the safety validator rejects a plan, the offending foods are excluded and
generation is retried up to four times. If restrictions leave too few options,
the user sees "Your current selections leave too few compatible meal options",
with a breakdown of how many options each restriction removed and a button to
review their preferences.

**Q12. What are the limitations?**
The nutrition values are approximate and depend on the local 53-item dataset
and on linear portion scaling. BMI and energy figures are estimates, not
measurements. Storage is per-browser and not secure. Personalisation is
rule-based, not a clinical assessment. The application is for educational meal
planning and is not a substitute for professional nutrition or medical advice.

**Q13. Why is it personalised and not just a fixed chart?**
Because the plan is not stored anywhere — it is computed each time from the
user's own data. Four test profiles with different diets and goals produced
four completely different plans from the same food database.

**Q14. Where is the business logic, and why is it not in the components?**
Calculations live in `src/services/nutrition/`, generation in
`src/services/diet/`, storage in `src/services/profileStorage.ts` and validation
in `src/lib/validation.ts`. Components only display results. This means each
rule exists exactly once, and the logic can be tested without a browser.

---

## Demonstration script (about 8 minutes)

| # | Action | What to say |
|---|---|---|
| 1 | Open the **Home** page | "The project takes a user's own information and builds a diet chart from it." |
| 2 | Scroll to **How it works** | Point out the five-stage workflow the code actually follows. |
| 3 | Click **Create My Diet Plan** | Step 1 of 5 opens. |
| 4 | Fill in personal details | Show the live summary panel updating. Try age `-5` to show validation. |
| 5 | Continue to **Nutrition & Preferences** | Choose a goal and a dietary pattern. |
| 6 | Tick the **Peanuts** allergy | "This will be treated as a strict exclusion." |
| 7 | Add `Chicken` to preferred foods while Vegan is selected | Show the conflict warning blocking Continue, then resolve it. |
| 8 | Add preferred foods (rice, dal) and a cuisine | |
| 9 | Continue to **Food Intake** | Add 2–3 breakfast items with quantity and unit; mark morning snack as skipped; set meal timings; set water intake. |
| 10 | Continue to **Review** | Every section is shown with an Edit link. |
| 11 | Click **Save My Profile** | "Profile saved on this device." |
| 12 | **Reload the browser** | The profile is still there — this proves the storage requirement. |
| 13 | Go to **Nutrition** and click Calculate | Show BMI, resting energy, maintenance, target and macros. |
| 14 | Expand **"How was this calculated?"** | Show the actual formulas — good for the examiner. |
| 15 | Click **Generate Diet Plan** | The dashboard opens. |
| 16 | Walk through the meal cards | Timings match what was entered; the skipped snack is absent. |
| 17 | Point at the **Restriction check** card | All six checks passed, including the peanut allergy. |
| 18 | Point at **Target vs Planned** | Show planned totals are computed from the meals, close to but not equal to the target. |
| 19 | Point at **Why this plan is personalised** | The list is built from this user's answers. |
| 20 | Click **Regenerate Plan** | Different meals, same restrictions respected. |
| 21 | Go back, change the weight, save | Return to the plan: it is now labelled **outdated**. |
| 22 | Click **Print Diet Plan** | Show the clean print preview / Save as PDF. |
| 23 | Open **About** | Show the architecture, roadmap and disclaimer. |

### Backup demonstration if something fails

Open `/profile` → **Delete Saved Profile** → the app returns cleanly to the
empty state, proving the recovery path. Then re-enter a minimal profile
(name, 21, male, 170, 65, moderately active, weight loss, vegetarian) — that is
enough to reach a generated plan in under a minute.

---

## Screens worth screenshotting for the report

1. Home (hero + How it works)
2. Personal Details with the live summary
3. Nutrition & Preferences with an allergy selected
4. Food Intake with meal items and timings
5. Review with the save panel
6. Nutrition profile with the calculation details expanded
7. The generated diet plan dashboard
8. The print preview
