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
- `backend/` — Python API (not yet implemented). Its contract is defined
  contract-first in [`openapi.yaml`](openapi.yaml) at the repo root, which
  mirrors `ExpenseSplitterService` field-for-field. Implement the backend to
  match that file, not the other way around, unless the contract itself needs
  to change (then update `openapi.yaml`, `types.ts`, and `mock-service.ts`
  together so the two implementations never drift apart).
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
- **No accounts, no creator-identity verification, anywhere.** Whoever holds
  a group's URL can add participants, expenses, and payments. Don't add
  auth/permission checks "just in case" — this was an explicit, deliberate
  decision.
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
- When behavior changes, keep `docs/spec.md`, `docs/user-stories.md`,
  `openapi.yaml`, and `frontend/src/services/types.ts` consistent with each
  other. They currently describe the same system four different ways; a
  change to one without the others is a regression.
