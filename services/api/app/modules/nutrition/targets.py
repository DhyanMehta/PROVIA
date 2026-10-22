"""PROVIA's approved estimate, version 1. No intermediate rounding."""

from decimal import Decimal

from app.core.exceptions import AppError

METHOD = "weight_x_24"
VERSION = "1"


def maintenance(current_weight: Decimal) -> Decimal:
    if not current_weight.is_finite() or current_weight <= 0 or current_weight > 1000:
        raise AppError("INVALID_WEIGHT", "Current weight must be positive and at most 1000 kg", 422)
    return current_weight * Decimal(24)


def calculate_targets(
    current_weight: Decimal, target_weight: Decimal, deficit: Decimal, minimum_calories: Decimal
) -> dict:
    estimated = maintenance(current_weight)
    if not target_weight.is_finite() or not 0 < target_weight <= 1000:
        raise AppError(
            "INVALID_TARGET_WEIGHT", "Target weight must be positive and at most 1000 kg", 422
        )
    if not deficit.is_finite() or deficit < 0:
        raise AppError("INVALID_DEFICIT", "Calorie deficit cannot be negative", 422)
    if deficit >= estimated:
        raise AppError(
            "DEFICIT_TOO_HIGH", "Deficit must be less than estimated maintenance calories", 422
        )
    daily = estimated - deficit
    if daily < minimum_calories:
        raise AppError(
            "CALORIE_SAFEGUARD",
            "Selected deficit puts daily calories below the configured minimum",
            422,
        )
    protein = target_weight * Decimal("1.9")
    fat = current_weight * Decimal("0.7")
    protein_kcal, fat_kcal = protein * 4, fat * 9
    carbs_kcal = daily - protein_kcal - fat_kcal
    if carbs_kcal <= 0:
        raise AppError(
            "NONPOSITIVE_CARB_BUDGET",
            "Protein and fat targets leave no positive carbohydrate budget",
            422,
        )
    return {
        "current_weight_kg_snapshot": current_weight,
        "target_weight_kg": target_weight,
        "selected_deficit_kcal": deficit,
        "maintenance_calories": estimated,
        "daily_calorie_target": daily,
        "protein_target_g": protein,
        "protein_target_kcal": protein_kcal,
        "fat_target_g": fat,
        "fat_target_kcal": fat_kcal,
        "carbs_target_g": carbs_kcal / 4,
        "carbs_target_kcal": carbs_kcal,
        "fiber_target_g": daily / 1000 * 14,
        "calculation_method": METHOD,
        "calculation_version": VERSION,
    }
