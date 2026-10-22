"""Import user-verified, licensed catalog data atomically; never overwrite foods."""

import argparse
from pathlib import Path

from app.core.config import get_settings
from app.db.session import Database
from app.integrations.indian_catalog import load_catalog
from app.modules.nutrition.repository import NutritionRepository


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("path", type=Path)
    parser.add_argument("--confirm-licensed-and-verified", action="store_true", required=True)
    args = parser.parse_args()
    database = Database(get_settings())
    try:
        foods = load_catalog(args.path)
        with database.session() as session, session.begin():
            for start in range(0, len(foods), 100):
                NutritionRepository(session).import_foods(foods[start : start + 100])
        print(f"Imported or reused {len(foods)} verified catalog records")
    except Exception:
        raise SystemExit(
            "Catalog import failed; inspect input schema and database configuration"
        ) from None
    finally:
        database.dispose()


if __name__ == "__main__":
    main()
