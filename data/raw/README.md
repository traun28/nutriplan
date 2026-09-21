# Raw dataset extraction — where the source goes

This directory holds the **extracted** form of the supplied dataset PDF.
It is deliberately empty in the repository until the extraction is added,
because the extraction must come from the actual document.

## What to put here

Drop the participant table in **one** of these files (the importer looks for
them in this order):

| File | Format |
|---|---|
| `participants.tsv` | Tab-separated — **preferred**, because meal text often contains commas |
| `participants.csv` | Comma-separated (quoted fields are supported) |
| `participants.json` | Array of objects, or `{ "records": [...] }` |
| `participants.txt` | Tab-separated fallback |

The first non-comment line must be the **header row**. Recognised headers are
listed in `src/data/dataset/mappings.ts` (`COLUMN_ALIASES`) and include, for
example: `Participant ID`, `Name`, `Age`, `Gender`, `Height (cm)`,
`Weight (kg)`, `Activity Level`, `Breakfast`, `Lunch`, `Dinner`, `Snacks`,
`Calories (kcal)`, `Protein (g)`, `Carbohydrates (g)`, `Fat (g)`,
`Dietary Fibre (g)`, `Sugar (g)`, `Sodium (mg)`.

## Page provenance (optional)

The PDF repeats headers across pages. Two ways to keep traceability:

1. A marker line before each page's rows — the importer reads it and skips the
   repeated header row automatically:

   ```
   # page=1
   Participant ID	Name	Age	...
   1001	Zoya Singh	23	...
   # page=2
   Participant ID	Name	Age	...
   1031	...
   ```

2. Or an extra `_page` column on every row.

Lines starting with `#` are ignored as data.

## Then run

```bash
node scripts/importDataset.ts
```

That writes `src/data/dataset/participants.clean.json` and prints the import
summary (record counts, quality flags, duplicate/missing IDs, statistics).

## Extraction guidance

The PDF text stream can join adjacent values (for example
`Protein ShakeSamosa`). **Do not hand-fix those in this file.** Keep the
extraction faithful to the document and let the importer flag them as
`ambiguous` — that is what the quality report is for. Only correct a row after
checking it against the PDF, and note the correction in `docs/DATASET.md`.

Prefer a table-aware extraction (copy the table from the PDF viewer, or use a
table-extraction tool) over raw text-dump, because column boundaries survive.

## Never commit

- Fabricated participant records
- Hand-invented nutrition values
- "Repaired" meal text that was not verified against the PDF
