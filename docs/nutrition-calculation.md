# PROVIA nutrition calculations

The version1 `weight_x_24` method is a simplified product estimate, not a clinically
validated maintenance-calorie formula. It does not account for age, sex, activity,
pregnancy, illness, or individual metabolic differences. Goal type labels do not
change the calculation. No exercise calories are added automatically.

## Onboarding and exact formulas

First preview estimated maintenance through POST /api/v1/nutrition/calculate-maintenance.
Then choose a deficit and preview all targets through calculate-goals. Finally save
the same inputs through authenticated POST /api/v1/goals. The same Decimal service
is used by all three paths; macros cannot be entered manually.

| Value | Formula | 97kg current, 85kg target, 500kcal deficit |
| --- | --- | --- |
| Estimated maintenance kcal | current_weight_kg × 24 | 2328 |
| Daily calorie target | maintenance − selected deficit | 1828 |
| Protein grams | target_weight_kg × 1.9 | 161.5 |
| Protein kcal | protein grams × 4 | 646 |
| Fat grams | current_weight_kg × 0.7 | 67.9 |
| Fat kcal | fat grams × 9 | 611.1 |
| Fiber grams | daily calorie target /1000 × 14 | 25.592 |
| Carbohydrate grams | (daily target − protein kcal − fat kcal) /4 | 142.725 |
| Carbohydrate kcal | carbohydrate grams × 4 | 570.9 |

No intermediate goal values are rounded. Goal Numeric columns retain8 decimal places;
inputs permit3 decimal places, sufficient to store all formula results exactly.
API Decimal values serialize as strings. A UI may display fiber25.6g and carbs142.7g
without using those display values for subsequent calculation.

## Validation

Weights must be finite and positive (maximum1000kg as an input bound). Deficit must
be finite, nonnegative, and strictly less than maintenance. The resulting carbohydrate
target must be positive. Daily target must meet NUTRITION_MIN_DAILY_CALORIES, default1500,
configurable from1200 to5000. This configurable floor is a conservative product guard,
not evidence that a particular intake is safe for every person. Inputs violating it
receive a clear422 error; the backend never silently changes the selected deficit.

Each saved goal records current-weight snapshot, target weight, deficit, computed
values, method and version. Changes to inputs create a new goal row and pause the
previous active goal. Profile weight changes revise active calculated goals. Appending
a weight-log entry does not implicitly change profile weight or nutrition targets.

## Food quantities and daily budgets

For known per100g nutrients, `consumed = nutrient_per_100g × quantity_g /100` using
Decimal. Stored meal snapshots round HALF_UP to0.001. A household quantity resolves
through that food's stored portion grams multiplied by count; there is no universal
roti or katori weight. Nutrient values absent from the catalog remain null.

Daily consumption sums stored snapshots inside local midnight to next local midnight,
converted to UTC using the user's IANA timezone. This handles daylight-saving changes.
Empty days consume zero; any unknown contribution makes that nutrient total unknown.
Food catalog edits do not alter historical snapshots. Replacing meal items recalculates
them; deleting a meal removes its contribution. Notes-only edits preserve snapshots.

For calories and each nutrient, remaining = target − consumed. Negative remaining
values represent exceeding the target and are not clamped. Macro calorie equivalents
use4kcal/g for protein and carbs, and9kcal/g for fat, independently of total food calories.

For a300kcal meal with25g protein: remaining calories =1828−300=1528;
remaining protein =161.5−25=136.5g; remaining protein kcal =646−100=546.
The100 protein kcal are already included in the300 meal kcal and are never subtracted
again from the total calorie budget. Provider energy may differ from4/4/9 equivalents;
the dashboard retains reported total energy rather than replacing it with macro sums.

Without a goal, consumed totals remain available while targets and remaining values
are null. Historical dates retain meal facts but compare against the current active
goal; historical effective-date target selection is not yet implemented.
