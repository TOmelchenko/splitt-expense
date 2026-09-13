"""Covers app/auth.py's hashing + bearer-token mechanics, both directly and
through the admin-only HTTP endpoints.
"""

import time

import pytest

from app import auth
from app.errors import AuthError
from tests.test_groups import new_group


class TestPasswordHashing:
    def test_hashes_are_salted_and_not_the_plaintext(self):
        hashed = auth.hash_password("hunter2")
        assert hashed != b"hunter2"
        # bcrypt salts each hash, so hashing the same password twice differs.
        assert auth.hash_password("hunter2") != hashed

    def test_verify_password_round_trips(self):
        hashed = auth.hash_password("hunter2")
        assert auth.verify_password("hunter2", hashed) is True
        assert auth.verify_password("wrong", hashed) is False


class TestAuthenticate:
    def test_issues_a_token_for_the_seeded_demo_admin(self):
        token = auth.authenticate(auth.DEMO_ADMIN_USERNAME, auth.DEMO_ADMIN_PASSWORD)
        assert isinstance(token, str) and len(token) > 20

    def test_rejects_wrong_password(self):
        with pytest.raises(AuthError):
            auth.authenticate(auth.DEMO_ADMIN_USERNAME, "wrong-password")

    def test_rejects_unknown_username(self):
        with pytest.raises(AuthError):
            auth.authenticate("nobody", "whatever")


class TestRequireAdminExpiry:
    def test_expired_token_is_rejected(self):
        token = auth.authenticate(auth.DEMO_ADMIN_USERNAME, auth.DEMO_ADMIN_PASSWORD)
        auth._tokens[token]["expires_at"] = time.time() - 1  # force expiry

        from fastapi.security import HTTPAuthorizationCredentials

        creds = HTTPAuthorizationCredentials(scheme="Bearer", credentials=token)
        with pytest.raises(AuthError):
            auth.require_admin(creds)


class TestAdminEndpoints:
    def test_login_with_correct_credentials_returns_a_bearer_token(self, client):
        resp = client.post(
            "/api/admin/login",
            json={"username": auth.DEMO_ADMIN_USERNAME, "password": auth.DEMO_ADMIN_PASSWORD},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["tokenType"] == "bearer"
        assert len(body["accessToken"]) > 20

    def test_login_with_wrong_password_is_rejected(self, client):
        resp = client.post(
            "/api/admin/login",
            json={"username": auth.DEMO_ADMIN_USERNAME, "password": "wrong"},
        )
        assert resp.status_code == 401
        assert "message" in resp.json()

    def test_reset_without_a_token_is_rejected(self, client):
        resp = client.post("/api/admin/reset")
        assert resp.status_code == 401

    def test_reset_with_an_invalid_token_is_rejected(self, client):
        resp = client.post(
            "/api/admin/reset", headers={"Authorization": "Bearer not-a-real-token"}
        )
        assert resp.status_code == 401

    def test_reset_with_a_valid_token_reseeds_the_demo_group(self, client):
        # Mutate the seeded demo group first, so we can observe the reset.
        view = new_group(client)
        assert client.get(f"/api/groups/{view['group']['id']}").status_code == 200

        login = client.post(
            "/api/admin/login",
            json={"username": auth.DEMO_ADMIN_USERNAME, "password": auth.DEMO_ADMIN_PASSWORD},
        ).json()
        token = login["accessToken"]

        resp = client.post("/api/admin/reset", headers={"Authorization": f"Bearer {token}"})
        assert resp.status_code == 200

        # The freshly-created group above is gone; only the reseeded demo
        # group ("g_demo") exists now.
        assert client.get(f"/api/groups/{view['group']['id']}").status_code == 404
        assert client.get("/api/groups/g_demo").status_code == 200
