import json

from scripts.export_endpoint_inventory import OUTPUT, inventory_text
from scripts.export_openapi import schema_text


def test_endpoint_inventory_matches_source_without_exposing_configuration():
    content = inventory_text()
    assert OUTPUT.read_text(encoding="utf-8") == content
    assert "67 paths; 91 operations" in content
    schema = json.loads(schema_text())
    for path, methods in schema["paths"].items():
        for method in methods:
            assert f"| {method.upper()} | `{path}` |" in content


def test_all_retry_safe_creates_expose_typed_optional_header():
    schema = json.loads(schema_text())
    paths = {
        "/foods/custom",
        "/recipes",
        "/meals",
        "/exercises/custom",
        "/workout-plans",
        "/workout-plans/{plan_id}/duplicate",
        "/workout-sessions",
        "/water-logs",
        "/sleep-sessions",
        "/weight-logs",
        "/goals",
        "/weight-logs/{weight_id}/apply-goal",
    }
    for path in paths:
        operation = schema["paths"]["/api/v1" + path]["post"]
        header = next(item for item in operation["parameters"] if item["in"] == "header")
        assert header["name"] == "Idempotency-Key" and not header["required"]
        assert {"type": "string", "format": "uuid"} in header["schema"]["anyOf"]
        assert operation["security"]


def test_confirmation_and_nullable_analytics_contracts_are_explicit():
    schemas = json.loads(schema_text())["components"]["schemas"]
    assert set(schemas["WeightGoalConfirmation"]["required"]) == {
        "expected_goal_id",
        "expected_weight_kg",
    }
    assert schemas["DailyDashboard"]["properties"]["goal"]["anyOf"][-1] == {"type": "null"}
    for name in ("protein", "carbs", "fat", "fiber"):
        assert schemas["NutritionDay"]["properties"][name] == {
            "$ref": "#/components/schemas/MacroAdherence"
        }
