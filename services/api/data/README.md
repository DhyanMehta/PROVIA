# Indian catalog inputs

`indian-foods.json` remains empty. No verified nutrition coverage is claimed.
`indian-catalog-priorities.csv` is a research queue, not a food database or assertion
that regional names always describe nutritionally equivalent recipes.

Copy `indian-catalog-template.json`, replace its placeholders with a stable source ID,
exact preparation, verified reusable source URL and license, then fill only known
per-100-g values. The template intentionally fails import until attribution is supplied.
Use `ingredient` or `prepared_dish` classification when verified; `unspecified` remains
available for ambiguous legacy records. Null means unknown, never zero.

For every household portion, add `{"label":"source-specific serving","grams":"..."}`
only after measuring it or verifying the source's gram definition. The importer flag
attests that nutrition, serving definitions, and reuse rights were reviewed. The
record's verified_at is that attestation's import timestamp, not an independent audit.
Custom foods/recipes and their portions are user-provided and do not carry curated
verification. Do not infer liquid density or universal bowl/roti weights.

Import with `python -m uv run python -m scripts.import_indian_catalog FILE --confirm-licensed-and-verified`.
Duplicate source IDs and duplicate source URL/name/brand/classification combinations
within a file are rejected. Reimporting existing source IDs reuses existing rows.
Source IDs are the stable duplicate boundary across files; similar names from different
sources are not automatically merged. Curated matches rank before private custom foods
and external matches. Aliases match whole names case-insensitively.

Use authenticated POST /api/v1/recipes for a user's measured recipe. Supply each
ingredient food UUID and actual grams (including oil/ghee), final cooked yield grams,
and optional measured portions. Yield must be provided; raw weight is never treated
as cooked yield. All nutrients contributed by all ingredients are summed before
division by yield. Unknown contributions flag the recipe incomplete. There are no
invented retention factors or cooking-loss adjustments. POST creates an immutable
recipe and a private food usable by the existing meal API; submit a new recipe to revise it.
