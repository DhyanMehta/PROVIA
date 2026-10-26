from sqlalchemy.dialects import postgresql
from sqlalchemy.orm import configure_mappers
from sqlalchemy.schema import CreateTable

from app.db import models  # noqa: F401
from app.db.base import Base


def test_migration_offline_sql(monkeypatch):
    from io import StringIO

    from alembic.config import Config

    from alembic import command

    monkeypatch.setenv("DIRECT_DATABASE_URL", "postgresql://localhost/offline_compile_only")
    output = StringIO()
    config = Config("alembic.ini", output_buffer=output)
    command.upgrade(config, "head", sql=True)
    sql = output.getvalue()
    for table in Base.metadata.tables:
        assert f"CREATE TABLE {table}" in sql
    assert "WHERE status = 'active'" in sql
    output.truncate(0)
    output.seek(0)
    command.downgrade(config, "0005:base", sql=True)
    for table in Base.metadata.tables:
        assert f"DROP TABLE {table}" in output.getvalue()


def test_all_models_compile_for_postgresql():
    configure_mappers()
    assert len(Base.metadata.tables) == 26
    for table in Base.metadata.sorted_tables:
        ddl = str(CreateTable(table).compile(dialect=postgresql.dialect()))
        if table.name == "auth_rate_limits":
            assert list(table.primary_key.columns.keys()) == ["bucket"]
        else:
            assert "UUID" in ddl
        for column in table.columns:
            if column.name.endswith("_at"):
                assert column.type.timezone
        for foreign_key in table.foreign_keys:
            assert foreign_key.column is not None


def test_catalog_references_are_restricted():
    for name in ["meal_items", "planned_exercises", "workout_sets"]:
        for foreign_key in Base.metadata.tables[name].foreign_keys:
            if foreign_key.column.table.name in {"foods", "exercises"}:
                assert foreign_key.ondelete == "RESTRICT"
