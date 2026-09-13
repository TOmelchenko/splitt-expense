"""Admin-only endpoints — not part of the public contract in /openapi.yaml.

POST /api/admin/login  — hashed-password login, returns a bearer token.
POST /api/admin/reset  — requires that bearer token; wipes the database and
                          reseeds the demo data (see app/store.py::reset).

Everything under app.routers.groups stays fully public; this router is kept
deliberately separate so the two auth models (none vs. bearer-token) never
mix. See app/auth.py for the hashing/token mechanics.
"""

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app import auth, store
from app.db import get_db
from app.models import AdminLoginInput, AdminToken

router = APIRouter(prefix="/admin", tags=["admin"])


@router.post("/login", response_model=AdminToken)
def login(input: AdminLoginInput) -> AdminToken:
    token = auth.authenticate(input.username, input.password)
    return AdminToken(access_token=token)


@router.post("/reset")
def reset(username: str = Depends(auth.require_admin), db: Session = Depends(get_db)) -> dict[str, str]:
    store.reset(db)
    return {"message": f"Database reseeded by {username}."}
