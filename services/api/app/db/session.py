"""Lazy PostgreSQL engine management, one instance per application."""

from threading import Lock

from sqlalchemy import Engine, create_engine, event
from sqlalchemy.engine import URL, make_url
from sqlalchemy.orm import Session, sessionmaker

from app.core.config import Settings
from app.core.exceptions import AppError


def postgres_url(value: str, *, direct: bool = False) -> URL:
    try:
        url = make_url(value)
        if url.drivername not in {"postgres", "postgresql", "postgresql+psycopg"}:
            raise ValueError
        if direct and "-pooler" in (url.host or ""):
            raise ValueError
        url = url.set(drivername="postgresql+psycopg")
        if (url.host or "").endswith(".neon.tech"):
            if url.query.get("sslmode") not in {"require", "verify-ca", "verify-full"}:
                url = url.update_query_dict({"sslmode": "require"})
        return url
    except Exception:
        raise AppError("DATABASE_CONFIG_INVALID", "Invalid PostgreSQL configuration", 503) from None


class Database:
    def __init__(self, settings: Settings):
        self.settings = settings
        self._engine: Engine | None = None
        self._sessions: sessionmaker | None = None
        self._lock = Lock()

    @property
    def engine(self) -> Engine:
        with self._lock:
            if self._engine is None:
                secret = self.settings.database_url
                if not secret or not secret.get_secret_value():
                    raise AppError("DATABASE_UNAVAILABLE", "Database is not configured", 503)
                self._engine = create_engine(
                    postgres_url(secret.get_secret_value()),
                    pool_pre_ping=True,
                    pool_size=5,
                    max_overflow=5,
                    pool_timeout=10,
                    pool_recycle=300,
                    hide_parameters=True,
                    connect_args={
                        "connect_timeout": 5,
                        "prepare_threshold": None,
                    },
                )

                # Neon pooling rejects arbitrary startup options; use transaction-local settings.
                @event.listens_for(self._engine, "begin")
                def configure_transaction(connection):
                    connection.exec_driver_sql("SET LOCAL TIME ZONE 'UTC'")
                    connection.exec_driver_sql("SET LOCAL statement_timeout = '10s'")

                self._sessions = sessionmaker(self._engine, expire_on_commit=False)
            return self._engine

    def session(self) -> Session:
        _ = self.engine
        return self._sessions()

    def dispose(self) -> None:
        if self._engine is not None:
            self._engine.dispose()
