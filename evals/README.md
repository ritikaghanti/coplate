# Coplate Evals

This is the part of the project that separates "I called a vision API" from
"I do AI engineering." It measures whether the Snap-and-Log pipeline is
actually accurate, reproducibly.

## How to build your labeled set

1. Take ~30–50 photos of meals where you can establish ground-truth macros.
   Best sources of truth, in order:
   - Packaged foods (read the label, weigh the portion)
   - A kitchen scale + a trusted database (USDA FoodData Central)
   - Restaurant meals with published nutrition info
2. Drop the images into `evals/fixtures/`.
3. Copy `fixtures/manifest.example.json` to `fixtures/manifest.json` and add an
   entry per image with its true macros.

## Run

```bash
pnpm eval
```

## What it reports

- **Calorie hit rate (±20%)** — the headline product metric. "Is it usefully
  right most of the time?"
- **MAPE per macro** — mean absolute percentage error for calories, protein,
  carbs, fat. Shows where the model is weakest (usually fat/portion size).
- **Latency & retries** — operational health; retries > 0 means the model
  needed re-prompting to produce valid JSON.

## Why this matters in interviews

You can say: "I built a reproducible eval suite over a hand-labeled dataset,
tracked MAPE per macronutrient and a tolerance-based hit rate tied to the
product goal, and used it to compare prompts/models and justify the grounding
step." Almost no portfolio project does this.

## Next steps (when you expand)

- Add per-item matching (did it find the right foods?) using set overlap.
- A/B prompts and models through the same harness.
- Wire into Promptfoo or Langfuse datasets for a UI + regression tracking.
