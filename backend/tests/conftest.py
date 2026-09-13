import pytest
from fastapi.testclient import TestClient

from app import store
from app.main import app


@pytest.fixture(autouse=True)
def _reset_store():
    """Every test starts from a clean, freshly-seeded store."""
    store.seed_demo_data()
    yield


@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c
