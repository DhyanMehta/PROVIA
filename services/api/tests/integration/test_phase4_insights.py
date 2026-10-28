"""Historical macro analytics and unified dashboard contracts on real PostgreSQL."""

from decimal import Decimal

import pytest
from sqlalchemy import event, text

pytestmark = pytest.mark.integration
PREFIX = "/api/v1"
PROFILE = {
    "display_name": "Test",
    "height_cm": "175",
    "current_weight_kg": "97",
    "activity_level": "moderate",
    "timezone": "America/New_York",
}


def request(api, own, method, path, data=None, status=200):
    response = api.request(method, PREFIX + path, headers=own, json=data)
    assert response.status_code == status, response.text
    return response.json()


def test_historical_macros_dashboard_goal_and_dst_boundaries(authenticated_client, pg_engine):
    api, headers = authenticated_client
    own, other = headers(), headers("other")
    request(api, own, "PUT", "/profile", PROFILE)
    old = request(
        api,
        own,
        "POST",
        "/goals",
        {"target_weight_kg": "85", "selected_deficit_kcal": "500", "daily_steps_target": 5000},
        201,
    )
    new = request(
        api,
        own,
        "POST",
        "/goals",
        {"target_weight_kg": "80", "selected_deficit_kcal": "400", "daily_steps_target": 7000},
        201,
    )
    # Synthetic fixture timestamps, never application records: one DST day has
    # 23 elapsed hours; the following midnight belongs to the new goal/day.
    with pg_engine.begin() as connection:
        connection.execute(
            text(
                "UPDATE goal_transitions SET effective_at = CASE "
                "WHEN goal_id=:old THEN '2026-03-07T05:00:00Z'::timestamptz "
                "ELSE '2026-03-09T04:00:00Z'::timestamptz END"
            ),
            {"old": old["id"]},
        )
    food = request(
        api,
        own,
        "POST",
        "/foods/custom",
        {
            "name": "Measured fixture",
            "calories_kcal": "100",
            "protein_g": "0",
            "carbs_g": "20",
            "fat_g": None,
            "fiber_g": "2",
        },
        201,
    )
    for stamp in ("2026-03-08T05:00:00Z", "2026-03-09T04:00:00Z"):
        request(
            api,
            own,
            "POST",
            "/meals",
            {
                "meal_type": "breakfast",
                "consumed_at": stamp,
                "items": [{"food_id": food["id"], "quantity_g": "100"}],
            },
            201,
        )
    progress = request(
        api, own, "GET", "/progress/overview?start_date=2026-03-08&end_date=2026-03-10"
    )
    day, following, missing = [point["nutrition"] for point in progress["daily"]]
    assert day["goal_id"] == old["id"] and following["goal_id"] == new["id"]
    assert Decimal(day["calories_consumed"]) == Decimal(following["calories_consumed"]) == 100
    assert Decimal(day["protein"]["target_g"]) == Decimal("161.5")
    assert Decimal(following["protein"]["target_g"]) == 152
    assert Decimal(day["protein"]["consumed_g"]) == 0
    assert Decimal(day["protein"]["adherence_ratio"]) == 0
    assert day["fat"]["consumed_g"] is None
    assert day["fat"]["remaining_g"] is None and day["fat"]["adherence_ratio"] is None
    assert Decimal(day["fiber"]["consumed_g"]) == 2
    assert Decimal(day["fiber"]["remaining_g"]) == Decimal(old["fiber_target_g"]) - 2
    assert missing["has_logs"] is False
    assert all(missing[name]["consumed_g"] is None for name in ("protein", "carbs", "fat", "fiber"))
    assert all(
        missing[name]["adherence_ratio"] is None for name in ("protein", "carbs", "fat", "fiber")
    )
    dashboard = request(api, own, "GET", "/dashboard/today?date=2026-03-08")
    assert dashboard["goal"]["id"] == old["id"]
    assert Decimal(dashboard["goal"]["target_weight_kg"]) == 85
    assert dashboard["goal"]["daily_steps_target"] == 5000
    assert dashboard["weight"] is None  # Profile weight is not a fabricated measurement.
    foreign = request(api, other, "GET", "/dashboard/today?date=2026-03-08")
    assert foreign["goal"] is None and foreign["weight"] is None


def test_macro_range_queries_are_batched_and_empty_measurements_remain_unknown(
    authenticated_client, pg_engine
):
    api, headers = authenticated_client
    own = headers()
    calls = []

    def count(*args):
        calls.append(1)

    event.listen(pg_engine, "before_cursor_execute", count)
    try:
        seven = request(
            api, own, "GET", "/progress/overview?start_date=2026-01-01&end_date=2026-01-07"
        )
        short_count = len(calls)
        calls.clear()
        thirty = request(
            api, own, "GET", "/progress/overview?start_date=2026-01-01&end_date=2026-01-30"
        )
        assert len(calls) <= short_count + 1
    finally:
        event.remove(pg_engine, "before_cursor_execute", count)
    assert len(seven["daily"]) == 7 and len(thirty["daily"]) == 30
    for day in thirty["daily"]:
        assert day["nutrition"]["has_logs"] is False
        assert day["nutrition"]["calories_consumed"] is None
        assert day["activity"] is None and day["sleep"]["duration_seconds"] is None
        assert day["nutrition"]["protein"] == {
            "target_g": None,
            "consumed_g": None,
            "remaining_g": None,
            "adherence_ratio": None,
        }
