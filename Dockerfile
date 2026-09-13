# --- Stage 1: build the frontend static assets with Node -------------------
FROM node:20-bookworm-slim AS frontend-build

WORKDIR /frontend

COPY frontend/package.json frontend/package-lock.json* frontend/bun.lock* ./
RUN npm install

COPY frontend/ ./
RUN npm run build

# --- Stage 2: Python backend, serving the built frontend --------------------
FROM python:3.12-slim AS backend

RUN pip install --no-cache-dir uv

WORKDIR /app

COPY backend/pyproject.toml backend/uv.lock ./
RUN uv sync --frozen --no-dev

COPY backend/app ./app
COPY --from=frontend-build /frontend/.output/public ./static

EXPOSE 8000

# Run uvicorn from the venv directly (not `uv run`), which would otherwise
# re-sync dev dependencies (pytest, httpx, ...) into the image at every
# container start.
CMD [".venv/bin/uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
