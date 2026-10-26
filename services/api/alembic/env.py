"""Use a direct URL for migrations; never log database connection strings."""

from sqlalchemy import create_engine, pool

from alembic import context
from app.core.config import get_settings
from app.db import (
    auth_models,  # noqa: F401
    models,  # noqa: F401 -- register all schema metadata
)
from app.db.base import Base
from app.db.session import postgres_url

target_metadata = Base.metadata


def run_migrations():
    settings = get_settings()
    supplied_connection = context.config.attributes.get("connection")
    if supplied_connection is not None:
        context.configure(
            connection=supplied_connection, target_metadata=target_metadata, compare_type=True
        )
        with context.begin_transaction():
            context.run_migrations()
        return
    secret = settings.direct_database_url
    if not secret or not secret.get_secret_value():
        raise RuntimeError("DIRECT_DATABASE_URL is required for migrations")
    url = postgres_url(secret.get_secret_value(), direct=True)
    if context.is_offline_mode():
        context.configure(
            url=url,
            target_metadata=target_metadata,
            literal_binds=True,
            dialect_opts={"paramstyle": "named"},
            compare_type=True,
        )
        with context.begin_transaction():
            context.run_migrations()
    else:
        engine = create_engine(
            url, poolclass=pool.NullPool, hide_parameters=True, connect_args={"connect_timeout": 5}
        )
        try:
            with engine.connect() as connection:
                context.configure(
                    connection=connection, target_metadata=target_metadata, compare_type=True
                )
                with context.begin_transaction():
                    context.run_migrations()
        except Exception:
            raise RuntimeError(
                "Migration failed; check configuration and database availability"
            ) from None
        finally:
            engine.dispose()


run_migrations()
