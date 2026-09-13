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
Charlie −€20), so there's something to look at immediately. Unlike an
in-memory store, this only happens if that group doesn't already exist —
your real data persists across restarts (see Database below). `POST
/api/admin/reset` (see Auth below) is the explicit, deliberate way to wipe
everything and get back to that seeded state.

## Database

Data is stored via [SQLAlchemy](https://www.sqlalchemy.org/) in whatever
database `DATABASE_URL` points at (a standard SQLAlchemy URL). Not set? It
defaults to a local SQLite file at `backend/expense_splitter.db` — nothing
extra to install or run.

```sh
# default: sqlite:///./expense_splitter.db (relative to backend/)
uv run uvicorn app.main:app --reload

# point at a different SQLite file, or another database entirely:
DATABASE_URL="sqlite:///./some_other_file.db" uv run uvicorn app.main:app --reload
```

The schema (`app/db_models.py`) uses only generic SQLAlchemy column types —
no SQLite-specific features — so switching to Postgres later should only
need two things: installing a driver (e.g. `uv add "psycopg[binary]"`) and
setting `DATABASE_URL` to a `postgresql+psycopg://...` URL. Tables are
created automatically on startup (`app/db.py::init_db`, a plain
`Base.metadata.create_all` — fine at this scale; a real migration tool like
Alembic would replace it if the schema needs to evolve without losing data).

Tests never touch the dev database — `tests/conftest.py` points
`DATABASE_URL` at an isolated in-memory SQLite database before anything else
is imported, and every test starts from a freshly reseeded one (see
`app/store.py::reset`).

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
  the database and reseeds it back to the demo group.

The admin user table and issued tokens are still in-memory (`app/auth.py`)
and reset on every restart — that's independent of the database migration
above and deliberately out of scope for it: this login exists only to demo
hashed-password + bearer-token auth, not as something worth persisting.

## Modules

- `app/models.py` — Pydantic schemas mirroring `/openapi.yaml`'s
  `components/schemas` (camelCase on the wire via `alias_generator=to_camel`).
  The API's wire format — never touches the database directly.
- `app/db.py` — the database engine/session, built from `DATABASE_URL`. The
  only module that knows which database is configured.
- `app/db_models.py` — SQLAlchemy ORM models (the actual tables). Separate
  from `app/models.py` on purpose: rows vs. wire format.
- `app/store.py` — group creation/lookup/mutation and balance/status
  computation, converting between `db_models` (rows) and `models` (API
  schemas). Every function takes a `Session` explicitly. Business rules are a
  port of `frontend/src/services/mock-service.ts`.
- `app/money.py` — amount parsing and the largest-remainder split. Port of
  `frontend/src/services/money.ts`.
- `app/auth.py` — password hashing and bearer-token issuance/verification for
  the admin endpoints only (in-memory, see Auth above).
- `app/routers/groups.py` — the 5 public endpoints.
- `app/routers/admin.py` — the 2 admin-only endpoints.
- `app/errors.py` — `ValidationError` (→ 400), `NotFoundError` (→ 404),
  `AuthError` (→ 401), all rendered as `openapi.yaml`'s `Error` schema
  (`{"message": "..."}`) by the exception handlers in `app/main.py`.
