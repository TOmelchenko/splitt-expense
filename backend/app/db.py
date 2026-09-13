"""Database engine/session setup — the only place that knows which database
is configured.

Which database to use is entirely controlled by the `DATABASE_URL`
environment variable (a standard SQLAlchemy URL, e.g.
`sqlite:///./expense_splitter.db` or, later, `postgresql+psycopg://...`).
Nothing above this module (app/db_models.py, app/store.py) references SQLite
or any other dialect by name — they talk to SQLAlchemy's engine/session API,
so pointing `DATABASE_URL` at Postgres (with the right driver installed) is
the only change needed to switch databases. See backend/README.md.
"""

import os
from collections.abc import Iterator

from sqlalchemy import Engine, create_engine, event
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker
from sqlalchemy.pool import StaticPool

DEFAULT_DATABASE_URL = "sqlite:///./expense_splitter.db"


def _make_engine(database_url: str) -> Engine:
    is_sqlite = database_url.startswith("sqlite")
    connect_args: dict = {}
    engine_kwargs: dict = {}

    if is_sqlite:
        # Required for SQLite when a session is used across the request/test
        # thread boundary FastAPI's TestClient introduces.
        connect_args["check_same_thread"] = False
        if ":memory:" in database_url:
            # An in-memory SQLite database lives only on its one connection;
            # without a static pool, each new connection would see a blank
            # database, breaking anything but the most trivial single query.
            engine_kwargs["poolclass"] = StaticPool

    engine = create_engine(database_url, connect_args=connect_args, **engine_kwargs)

    if is_sqlite:
        # SQLite does not enforce foreign keys unless told to, per
        # connection. Harmless/inapplicable on other dialects, so this is
        # gated to sqlite specifically rather than run unconditionally.
        @event.listens_for(engine, "connect")
        def _enable_sqlite_foreign_keys(dbapi_connection, _):
            cursor = dbapi_connection.cursor()
            cursor.execute("PRAGMA foreign_keys=ON")
            cursor.close()

    return engine


engine = _make_engine(os.environ.get("DATABASE_URL", DEFAULT_DATABASE_URL))
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


def init_db() -> None:
    """Creates any tables that don't exist yet. Fine for this project's
    scale; a schema-migration tool (e.g. Alembic) would replace this if the
    schema needs to evolve without dropping data in a real deployment."""
    from app import db_models  # noqa: F401  (registers models on Base.metadata)

    Base.metadata.create_all(bind=engine)


def get_db() -> Iterator[Session]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
