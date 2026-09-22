# Test fixtures

All files here are **synthetic** — generated for tests, never real participants.

- `synthetic-sample.tsv` — Part 11 importer edge cases (duplicate id, malformed numbers, ambiguous meal text).
- `attachments/nutrition_data.csv` — Part 12 attachment processor sample.
- `phase7-students-synthetic.csv` — Phase 7 Student Dataset Analyzer sample (67 rows). Exercises alternate
  headers (`Student ID`, `Sex`, `Carbs`, `Fiber`), an unknown column (`House`), a duplicate ID with differing
  values, a negative age, text in a numeric cell, a missing height, an outlier height (260 cm), an outlier /
  inconsistent calorie value (9000 kcal) and a row with no ID. Expected after mapping `Student ID → Participant ID`:
  64 importable rows, 3 rejected, 1 duplicate flagged.
