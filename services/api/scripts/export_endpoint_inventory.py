"""Export a reviewable endpoint inventory from the actual credential-free schema."""

import argparse
import json
from pathlib import Path

from scripts.export_openapi import schema_text

OUTPUT = Path(__file__).resolve().parents[3] / "docs/backend-endpoint-inventory.md"
METHODS = {"get", "post", "put", "patch", "delete", "head", "options"}


def type_name(value):
    if "$ref" in value:
        return value["$ref"].rsplit("/", 1)[-1]
    for kind in ("anyOf", "oneOf"):
        if kind in value:
            return " or ".join(type_name(item) for item in value[kind])
    if value.get("type") == "array":
        return "list[" + type_name(value.get("items", {})) + "]"
    return value.get("type", "object")


def inventory_text():
    schema = json.loads(schema_text())
    rows = []
    for path, methods in sorted(schema["paths"].items()):
        for method, operation in sorted(methods.items()):
            if method not in METHODS:
                continue
            auth = "Public"
            if operation.get("security"):
                auth = (
                    "Session (verification may be pending)"
                    if "/auth/" in path or path.endswith("/onboarding")
                    else "Verified session"
                )
            parameters = (
                ", ".join(
                    f"{item['name']} ({item['in']}{', required' if item.get('required') else ''})"
                    for item in operation.get("parameters", [])
                )
                or "—"
            )
            body = operation.get("requestBody", {}).get("content", {}).get("application/json")
            request = type_name(body["schema"]) if body else "—"
            success = []
            for code, response in operation["responses"].items():
                if not code.startswith("2"):
                    continue
                content = response.get("content", {}).get("application/json")
                success.append(f"{code} {type_name(content['schema']) if content else 'no body'}")
            rows.append(
                f"| {method.upper()} | `{path}` | {auth} | {request} | {parameters} | "
                + "; ".join(success)
                + " |"
            )
    return (
        "# Backend endpoint inventory\n\n"
        "Generated from the actual credential-free FastAPI schema; do not edit rows by hand.\n"
        "Regenerate with `python -m uv run --no-sync python -m "
        "scripts.export_endpoint_inventory`;\n"
        "use `--check` to reject drift. This is a local source contract, "
        "not a deployed-service claim.\n\n"
        f"**{len(schema['paths'])} paths; {len(rows)} operations.** "
        "All paths include `/api/v1`.\n\n"
        "Every non-204 operation returns JSON. Error responses use `ErrorEnvelope`; "
        "every response\n"
        "has `X-Request-ID`. Decimal output values are strings with variable trailing zeros.\n"
        "Units are kg, cm, g, ml, m, kcal and elapsed seconds; "
        "timestamps require explicit offsets.\n"
        "`Page_*` responses use `items`, `limit`, `offset`; "
        "food search uses per-source `page`/\n"
        "`page_size`. Date boundaries, sorting, lifecycle and retry semantics "
        "are specified in the\n"
        "[frontend handoff](frontend-api-handoff.md), not inferred from HTTP method alone.\n\n"
        "| Method | Path | Authorization | JSON request | Parameters | Success response |\n"
        "| --- | --- | --- | --- | --- | --- |\n" + "\n".join(rows) + "\n"
    )


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    content = inventory_text()
    if args.check:
        if not OUTPUT.exists() or OUTPUT.read_text(encoding="utf-8") != content:
            print("Endpoint inventory is stale; regenerate it")
            return 1
        print("Endpoint inventory matches the application")
        return 0
    OUTPUT.write_text(content, encoding="utf-8")
    print("Exported application endpoint inventory")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
