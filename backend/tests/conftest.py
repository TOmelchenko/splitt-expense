import os

# Must happen before any `app.*` import: app/db.py reads DATABASE_URL at
# import time to build its engine. Tests get their own isolated in-memory
# SQLite database, never the real dev database file.
os.environ["DATABASE_URL"] = "sqlite:///:memory:"

import pytest  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402

from app import store  # noqa: E402
from app.db import SessionLocal, init_db  # noqa: E402
from app.main import app  # noqa: E402


@pytest.fixture(autouse=True)
def _reset_store():
    """Every test starts from a clean, freshly-seeded database."""
    init_db()
    db = SessionLocal()
    try:
        store.reset(db)
    finally:
        db.close()
    yield


@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c
