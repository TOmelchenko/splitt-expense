"""Admin-only endpoints — not part of the public contract in /openapi.yaml.

POST /api/admin/login  — hashed-password login, returns a bearer token.
POST /api/admin/reset  — requires that bearer token; reseeds the in-memory
                          demo data (see app/store.py::seed_demo_data).

Everything under app.routers.groups stays fully public; this router is kept
deliberately separate so the two auth models (none vs. bearer-token) never
mix. See app/auth.py for the hashing/token mechanics.
"""

from fastapi import APIRouter, Depends

from app import auth, store
from app.models import AdminLoginInput, AdminToken

router = APIRouter(prefix="/admin", tags=["admin"])


@router.post("/login", response_model=AdminToken)
def login(input: AdminLoginInput) -> AdminToken:
    token = auth.authenticate(input.username, input.password)
    return AdminToken(access_token=token)


@router.post("/reset")
def reset(username: str = Depends(auth.require_admin)) -> dict[str, str]:
    store.reset()
    return {"message": f"Store reseeded by {username}."}
