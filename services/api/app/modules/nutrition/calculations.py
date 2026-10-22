from decimal import ROUND_HALF_UP, Decimal

from app.integrations.foods import NUTRIENTS


def consumed(value: Decimal | None, quantity_g: Decimal) -> Decimal | None:
    if not quantity_g.is_finite() or quantity_g <= 0:
        raise ValueError("Quantity must be positive and finite")
    if value is None:
        return None
    if not value.is_finite() or value < 0:
        raise ValueError("Nutrient must be nonnegative and finite")
    return (value * quantity_g / Decimal(100)).quantize(Decimal("0.001"), rounding=ROUND_HALF_UP)


def portion_grams(grams: Decimal, count: Decimal) -> Decimal:
    result = grams * count
    if not result.is_finite() or grams <= 0 or count <= 0 or result > 100000:
        raise ValueError("Portion quantity is out of range")
    rounded = result.quantize(Decimal("0.001"), rounding=ROUND_HALF_UP)
    if rounded <= 0:
        raise ValueError("Portion quantity is too small")
    return rounded


def totals(items) -> dict[str, Decimal | None]:
    result = {}
    for name in NUTRIENTS:
        values = [getattr(item, name + "_snapshot") for item in items]
        result[name] = None if any(value is None for value in values) else sum(values, Decimal(0))
    return result


def remaining(target: Decimal | None, consumed_value: Decimal | None) -> Decimal | None:
    return None if target is None or consumed_value is None else target - consumed_value


def macro_budget(target: Decimal | None, consumed_value: Decimal | None, factor: int | None):
    budget = {
        "target_g": target,
        "consumed_g": consumed_value,
        "remaining_g": remaining(target, consumed_value),
    }
    if factor is not None:
        target_kcal = target * factor if target is not None else None
        consumed_kcal = consumed_value * factor if consumed_value is not None else None
        budget.update(
            target_kcal=target_kcal,
            consumed_kcal=consumed_kcal,
            remaining_kcal=remaining(target_kcal, consumed_kcal),
        )
    return budget
