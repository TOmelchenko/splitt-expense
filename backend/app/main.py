"""FastAPI app implementing /openapi.yaml.

Mounted under /api to match that spec's `servers: [{url: /api}]`, so e.g.
POST /groups in the spec is served at POST /api/groups here. The /api/admin/*
router is an addition on top of the spec (see app/routers/admin.py) — it is
the only part of this API that requires authentication.
"""

from contextlib import asynccontextmanager

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse

from app import store
from app.errors import AuthError, NotFoundError, ValidationError
from app.routers import admin, groups


@asynccontextmanager
async def _lifespan(app: FastAPI):
    store.seed_demo_data()
    yield


app = FastAPI(
    title="Expense Splitter API",
    version="0.1.0",
    description=(
        "Implementation of /openapi.yaml. See docs/spec.md and "
        "docs/user-stories.md for the product spec this enforces."
    ),
    lifespan=_lifespan,
)


@app.exception_handler(ValidationError)
def _validation_error_handler(request: Request, exc: ValidationError) -> JSONResponse:
    return JSONResponse(status_code=400, content={"message": str(exc)})


@app.exception_handler(NotFoundError)
def _not_found_error_handler(request: Request, exc: NotFoundError) -> JSONResponse:
    return JSONResponse(status_code=404, content={"message": str(exc)})


@app.exception_handler(AuthError)
def _auth_error_handler(request: Request, exc: AuthError) -> JSONResponse:
    return JSONResponse(
        status_code=401,
        content={"message": str(exc)},
        headers={"WWW-Authenticate": "Bearer"},
    )


app.include_router(groups.router, prefix="/api")
app.include_router(admin.router, prefix="/api")
