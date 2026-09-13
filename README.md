# Splitmate — Expense Splitter

A small app for splitting shared group expenses in EUR, no accounts. Frontend
in [`frontend/`](frontend), backend in [`backend/`](backend), API contract in
[`openapi.yaml`](openapi.yaml), product spec in [`docs/`](docs). See
[`AGENTS.md`](AGENTS.md) for the full picture.

This project was built with [Lovable](https://lovable.dev).

## Quickstart

Requires [Docker](https://www.docker.com/) and [uv](https://docs.astral.sh/uv/).

```sh
make install   # uv sync (backend) + docker compose build (frontend)
make up        # frontend at http://localhost:8080, backend at http://localhost:8001
make test      # backend (pytest) + frontend (vitest)
make down      # stop everything
```

### All commands

Run `make help` any time to print this list from the Makefile itself.

| Command             | What it does                                                  |
| -------------------- | -------------------------------------------------------------- |
| `make install`       | `uv sync` (backend deps) + `docker compose build` (frontend image) |
| `make up`            | Start frontend (Docker, `:8080`) and backend (`uv run uvicorn --reload`, `:8001`, backgrounded via `.backend.pid`) |
| `make down`          | Stop both — frontend container and the backgrounded backend process |
| `make backend`       | Run the backend dev server in the foreground (`Ctrl+C` to stop); use this instead of `make up` when you want to watch its logs directly |
| `make frontend`      | Start only the frontend container |
| `make test`          | Run `test-backend` then `test-frontend` |
| `make test-backend`  | `uv run pytest` in `backend/` |
| `make test-frontend` | `npm run test` (Vitest) in a one-off frontend container |
| `make lint`          | `npm run lint` (ESLint) in a one-off frontend container |
| `make logs`          | Tail the frontend container's logs (`Ctrl+C` to stop watching) |
| `make reset-demo`    | Log into the admin API and reset the backend's in-memory demo data back to its seeded state |
| `make clean`         | `make down` plus remove Docker volumes (e.g. the frontend's `node_modules` volume) and local runtime files (`.backend.pid`, `backend.log`) |

## How to use the app

Once `make up` has both services running:

1. Open **http://localhost:8080**.
2. **Create a group**: enter your name (required), an optional group name,
   and any other participants you already know (you can always add more
   later). Submitting takes you straight into the group.
3. **Share the invite link** shown on the group page (`Copy invite`) with
   whoever else is in the group. Anyone who opens it picks their name from
   the participant list — no account, no approval needed.
4. **Add an expense**: date, description, amount (EUR), and who paid. It's
   split equally across everyone currently in the group and reflected in the
   balances immediately. Expenses can't be edited or deleted once added.
5. **Record a payment** when someone actually pays another participant back
   (cash, bank transfer, etc.): pick who paid, who received it, and the
   amount. This moves balance between the two of them without touching
   "Total spent" — it's a settlement, not a new shared expense.
6. **Read the balances**: `+` means that person should receive money, `−`
   means they've paid less than their share so far. The group's status badge
   is automatic — "No expenses yet", "In progress", or "Settled" once every
   balance is exactly €0.00 — there's no manual close/archive step.

Want to look around without creating your own group first? The backend seeds
a demo group on startup at **http://localhost:8080/g/g_demo** (participants
Alice/Bob/Charlie, one expense, one payment already recorded). `make
reset-demo` puts it back to that original state if you've been experimenting
with it.

See [`docs/spec.md`](docs/spec.md) and [`docs/user-stories.md`](docs/user-stories.md)
for the full product spec and acceptance criteria behind this flow.

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/1bb714aa-9cf5-41f3-b0d2-ff35c5b2582f).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.
