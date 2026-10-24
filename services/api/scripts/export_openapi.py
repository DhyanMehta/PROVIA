"""Export actual FastAPI contracts without network access or credential configuration."""

import argparse
import json
from pathlib import Path

from app.application import create_app
from app.core.config import Settings

OUTPUT = Path(__file__).resolve().parents[3] / "packages/api-contracts/openapi.json"


class ContractSettings(Settings):
    @classmethod
    def settings_customise_sources(
        cls, settings_cls, init_settings, env_settings, dotenv_settings, file_secret_settings
    ):
        # Contracts describe code defaults, not a developer's environment or secrets.
        return (init_settings,)


def schema_text():
    app = create_app(ContractSettings(_env_file=None, app_env="testing"))
    return json.dumps(app.openapi(), indent=2, sort_keys=True) + "\n"


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true")
    args = parser.parse_args()
    content = schema_text()
    if args.check:
        if not OUTPUT.exists() or OUTPUT.read_text(encoding="utf-8") != content:
            print("OpenAPI artifact is stale; regenerate contracts")
            return 1
        print("OpenAPI artifact matches the application")
        return 0
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(content, encoding="utf-8")
    print("Exported application OpenAPI schema")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
