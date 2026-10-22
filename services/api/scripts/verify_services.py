"""Read-only checks. Output contains status/counts only, never URLs or credentials."""

import json
from pathlib import Path

import httpx
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.pool import NullPool

from app.core.config import Settings
from app.db.session import postgres_url
from app.integrations.foods import OpenFoodFactsProvider, ProviderError, USDAProvider
from app.main import create_app


class ProbeTransport(httpx.HTTPTransport):
    """Record only safe diagnostics, never request URLs or exception strings."""

    def __init__(self):
        super().__init__()
        self.details = {}

    def handle_request(self, request):
        self.details["attempts"] = self.details.get("attempts", 0) + 1
        try:
            response = super().handle_request(request)
            self.details["http_status"] = response.status_code
            self.details.setdefault("http_statuses", []).append(response.status_code)
            return response
        except Exception as error:
            self.details["error_type"] = type(error).__name__
            raise


def main():
    settings = Settings()
    report = {}
    with TestClient(create_app(settings)) as client:
        response = client.get("/api/v1/health/db")
        report["neon_pooled"] = {
            "status": "PASS" if response.status_code == 200 else "FAIL",
            "http_status": response.status_code,
        }
    engine = None
    try:
        engine = create_engine(
            postgres_url(settings.direct_database_url.get_secret_value(), direct=True),
            poolclass=NullPool,
            hide_parameters=True,
            connect_args={"connect_timeout": 5},
        )
        with engine.connect() as connection:
            tables = inspect(connection).get_table_names()
            report["neon_direct"] = {
                "status": "PASS",
                "select_1": connection.scalar(text("SELECT 1")) == 1,
                "table_count": len(tables),
                "revision": connection.scalar(text("SELECT version_num FROM alembic_version")),
                "foreign_key_count": sum(
                    len(inspect(connection).get_foreign_keys(t)) for t in tables
                ),
            }
    except Exception:
        report["neon_direct"] = {"status": "FAIL", "note": "Connection or schema check failed"}
    finally:
        if engine is not None:
            engine.dispose()
    try:
        if not settings.resolved_jwks_url:
            raise ValueError
        with httpx.Client(timeout=10) as client:
            response = client.get(settings.resolved_jwks_url)
            response.raise_for_status()
            keys = response.json().get("keys", [])
            valid = any(key.get("kty") == "RSA" for key in keys)
            report["clerk_jwks"] = {
                "status": "PASS" if valid else "FAIL",
                "http_status": response.status_code,
                "rsa_keys_present": valid,
            }
    except Exception:
        report["clerk_jwks"] = {"status": "FAIL", "note": "JWKS unavailable or invalid"}
    report["clerk_session_end_to_end"] = {
        "status": "BLOCKED",
        "note": "No real session token supplied",
    }
    for name, adapter in {"usda": USDAProvider, "open_food_facts": OpenFoodFactsProvider}.items():
        transport = ProbeTransport()
        provider = adapter(settings, transport=transport)
        try:
            foods = provider.search("rice")
            report[name] = {
                "status": "PASS",
                "normalized_results": len(foods),
                "results_with_calories": sum(food.calories_kcal is not None for food in foods),
                "note": "Live adapter request; not an authenticated API end-to-end test",
            }
        except ProviderError as error:
            report[name] = {"status": "BLOCKED", "note": str(error), **transport.details}
        finally:
            transport.close()
    report["open_food_facts_barcode"] = {
        "status": "NOT RUN",
        "note": "No barcode endpoint implemented",
    }
    report["r2"] = {
        "status": "NOT RUN",
        "note": "Storage integration is not implemented; no storage operations performed",
    }
    output = Path("../../docs/service-verification.json")
    output.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
