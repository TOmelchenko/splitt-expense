"""Hashed-password login + bearer tokens for the admin-only endpoints.

This is *not* part of the public contract in /openapi.yaml: every endpoint
described there is deliberately unauthenticated, per docs/spec.md's
no-accounts design (see AGENTS.md). It exists only to protect
POST /api/admin/reset (wiping and reseeding the database — see app/store.py)
behind a real login, as a self-contained demonstration of password hashing +
bearer-token auth that doesn't touch the public group/expense/payment
endpoints.

Both the admin user table and the issued-token table are in-memory and reset
whenever the process restarts — deliberately unlike the group data, which
now persists in a real database (see app/db.py). This login is a mechanics
demo, not something worth persisting.
"""

import secrets
import time

import bcrypt
from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.errors import AuthError

TOKEN_TTL_SECONDS = 3600

# Seeded demo admin account. Not a real secret — this is a learning project
# with no production deployment, and the whole point is to demo the
# mechanism, not to guard anything valuable.
DEMO_ADMIN_USERNAME = "admin"
DEMO_ADMIN_PASSWORD = "admin123"


def hash_password(password: str) -> bytes:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt())


def verify_password(password: str, hashed: bytes) -> bool:
    return bcrypt.checkpw(password.encode("utf-8"), hashed)


_admin_users: dict[str, bytes] = {DEMO_ADMIN_USERNAME: hash_password(DEMO_ADMIN_PASSWORD)}
_tokens: dict[str, dict] = {}


def authenticate(username: str, password: str) -> str:
    """Verifies credentials and returns a fresh bearer token."""
    hashed = _admin_users.get(username)
    if hashed is None or not verify_password(password, hashed):
        raise AuthError("Invalid username or password.")

    token = secrets.token_urlsafe(32)
    _tokens[token] = {"username": username, "expires_at": time.time() + TOKEN_TTL_SECONDS}
    return token


_bearer_scheme = HTTPBearer(auto_error=False)


def require_admin(
    credentials: HTTPAuthorizationCredentials | None = Depends(_bearer_scheme),
) -> str:
    """FastAPI dependency: validates the Authorization: Bearer <token> header
    and returns the authenticated username, or raises AuthError (-> 401)."""
    if credentials is None:
        raise AuthError("Missing bearer token.")

    info = _tokens.get(credentials.credentials)
    if info is None or info["expires_at"] < time.time():
        _tokens.pop(credentials.credentials, None)
        raise AuthError("Invalid or expired token.")

    return info["username"]
