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

Run `make help` for the full list of targets (`backend`, `test-backend`,
`test-frontend`, `lint`, `logs`, `reset-demo`, `clean`, ...).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/1bb714aa-9cf5-41f3-b0d2-ff35c5b2582f).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.
