# Backend

FastAPI implementation of the contract in [`/openapi.yaml`](../openapi.yaml).
See [`AGENTS.md`](../AGENTS.md) for the business rules this enforces and
[`docs/spec.md`](../docs/spec.md) / [`docs/user-stories.md`](../docs/user-stories.md)
for the product spec.

## Run

```sh
uv sync
uv run uvicorn app.main:app --reload
```

The API is served under `/api` (e.g. `POST /api/groups`), matching the
`servers` entry in `/openapi.yaml`. Interactive docs: `/docs`.

A demo group is seeded on startup at `GET /api/groups/g_demo` — it reproduces
the worked example in `docs/spec.md` §6 exactly (Alice +€30, Bob −€10,
Charlie −€20), so there's something to look at immediately.

## Test

```sh
uv run pytest
```

## Auth

Every endpoint under the `groups` tag (create/get a group, add a participant,
add an expense, add a payment) is **public** — no accounts exist in this
product, by design (see `docs/spec.md` §3/§10). `openapi.yaml` sets
`security: []` accordingly.

The only authenticated endpoints are the admin-only ones, which exist
*outside* that public contract purely to demonstrate hashed-password +
bearer-token auth without touching the real app:

- `POST /api/admin/login` — `{"username": "admin", "password": "admin123"}`
  (seeded demo credentials, hashed with bcrypt — see `app/auth.py`) returns
  `{"accessToken": "...", "tokenType": "bearer"}`.
- `POST /api/admin/reset` — requires `Authorization: Bearer <token>`; wipes
  and reseeds the in-memory store.

## Modules

- `app/models.py` — Pydantic schemas mirroring `/openapi.yaml`'s
  `components/schemas` (camelCase on the wire via `alias_generator=to_camel`).
- `app/store.py` — in-memory group store, validation, and balance/status
  computation. Port of `frontend/src/services/mock-service.ts`.
- `app/money.py` — amount parsing and the largest-remainder split. Port of
  `frontend/src/services/money.ts`.
- `app/auth.py` — password hashing and bearer-token issuance/verification for
  the admin endpoints only.
- `app/routers/groups.py` — the 5 public endpoints.
- `app/routers/admin.py` — the 2 admin-only endpoints.
- `app/errors.py` — `ValidationError` (→ 400), `NotFoundError` (→ 404),
  `AuthError` (→ 401), all rendered as `openapi.yaml`'s `Error` schema
  (`{"message": "..."}`) by the exception handlers in `app/main.py`.
