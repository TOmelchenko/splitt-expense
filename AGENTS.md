<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

## Project overview

Expense Splitter — an MVP for splitting shared group expenses in EUR, no
accounts. Full requirements: [`docs/spec.md`](docs/spec.md). Detailed user
stories and acceptance criteria: [`docs/user-stories.md`](docs/user-stories.md).
Read both before changing behavior — they are the source of truth, not this
file.

## Repo layout

- `frontend/` — Vite + React + TanStack Start app (Lovable-managed). Talks to
  the backend only through the single service contract in
  `frontend/src/services/types.ts` (`ExpenseSplitterService`). Today that
  interface is fulfilled by an in-browser mock
  (`frontend/src/services/mock-service.ts`); swapping to the real API means
  implementing that same interface with `fetch` calls and changing one export
  in `frontend/src/services/index.ts` — no UI/route code should need to
  change.
- `backend/` — FastAPI implementation of [`openapi.yaml`](openapi.yaml) at the
  repo root, which mirrors `ExpenseSplitterService` field-for-field. See
  [`backend/README.md`](backend/README.md) for how to run it and its module
  layout (`models` / `store` / `money` / `auth` / `routers`). It's an
  in-memory store, seeded with a demo group on startup — there is no
  database. Match `openapi.yaml`, not the other way around, unless the
  contract itself needs to change (then update `openapi.yaml`, `types.ts`,
  `mock-service.ts`, and the FastAPI implementation together so none of them
  drift apart).
- `docs/` — product spec, user stories, and decisions. Update these first
  when a requirement changes, before touching code.

## Backend dependency management

Use [`uv`](https://docs.astral.sh/uv/) for all Python dependency management in
`backend/` — not pip/poetry/venv directly.

- `uv sync` — install/update dependencies to match the lockfile. Run this
  after pulling changes that touch `pyproject.toml` / `uv.lock`.
- `uv add <package-name>` — add a new dependency (writes to `pyproject.toml`
  and `uv.lock`). Use `uv add --dev <package-name>` for dev-only tools
  (test runners, linters, etc.).
- `uv run python <file.py>` — run a script inside the project's managed
  environment without activating a virtualenv manually.

## Key business rules agents must not violate

These come from `docs/spec.md` / `docs/user-stories.md` and are load-bearing —
see `frontend/src/services/money.ts` for the reference implementation:

- Currency is EUR only; amounts are handled as integer cents internally.
- A group holds **at most 10 participants**, enforced server-side (the invite
  link is the only gate, so this can't be a UI-only check).
- Expense splits use the **largest remainder method** in integer cents,
  stable by participant list order — see `splitEqually` in
  `frontend/src/services/money.ts` for the exact algorithm.
- Expenses are **immutable**: no edit or delete endpoint should ever be built.
- A **Payment** (`fromId`/`toId`/`amountCents`) is a direct transfer between
  two participants — not split, immutable like an expense, and **excluded
  from `totalCents`**. It only moves balance from `fromId` to `toId`. Don't
  confuse it with an Expense: recording a repayment as an expense was the
  original bug this feature exists to fix (it split the repayment across the
  whole group and inflated the total).
- **No accounts, no creator-identity verification, anywhere in the public
  app.** Whoever holds a group's URL can add participants, expenses, and
  payments. Don't add auth/permission checks to `app/routers/groups.py` "just
  in case" — this was an explicit, deliberate decision, and `openapi.yaml`
  sets `security: []` accordingly. The **one exception** is
  `app/routers/admin.py` (`POST /api/admin/login` + `POST /api/admin/reset`,
  hashed password + bearer token via `app/auth.py`) — a deliberately separate,
  out-of-spec demo of auth mechanics that only guards reseeding the in-memory
  store. Don't extend that auth model onto the real group/expense/payment
  endpoints, and don't remove it thinking it contradicts the no-accounts rule
  — it's scoped to stay orthogonal to it on purpose.
- There is no manual archive/close action. `status` (`empty` / `settled` /
  `active`) is a **computed, live value** based on current balances (from
  both expenses and payments), not something stored or toggled — see
  `computeGroupView` in `frontend/src/services/mock-service.ts`.

## Working conventions

- Commit regularly in small, working-state increments (this connects to
  Lovable — see the note above) rather than batching unrelated changes.
- Frontend tests: `cd frontend && npm run test` (Vitest); the money/rounding
  logic in `money.test.ts` and `mock-service.test.ts` encode the business
  rules above as executable specs — keep them passing.
- Backend tests: `cd backend && uv run pytest`; `test_money.py` /
  `test_groups.py` / `test_payments.py` mirror the same specs as the frontend
  tests above, plus `test_admin_auth.py` for the admin-only auth mechanics.
- When behavior changes, keep `docs/spec.md`, `docs/user-stories.md`,
  `openapi.yaml`, `frontend/src/services/types.ts`, and the FastAPI
  implementation in `backend/app/` consistent with each other. They currently
  describe the same system five different ways; a change to one without the
  others is a regression.
