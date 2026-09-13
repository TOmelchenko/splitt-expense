SHELL := /bin/bash

BACKEND_DIR := backend
BACKEND_PORT := 8001
BACKEND_PID_FILE := .backend.pid
BACKEND_LOG_FILE := backend.log

.DEFAULT_GOAL := help

.PHONY: help install up down backend frontend test test-backend test-frontend lint logs reset-demo clean

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-16s\033[0m %s\n", $$1, $$2}'

install: ## Install all dependencies (backend via uv, frontend image via Docker)
	cd $(BACKEND_DIR) && uv sync
	docker compose build

up: ## Start frontend (Docker, :8080) and backend (uv, background, :8001)
	docker compose up -d
	@if [ -f $(BACKEND_PID_FILE) ] && kill -0 `cat $(BACKEND_PID_FILE)` 2>/dev/null; then \
		echo "Backend already running (pid `cat $(BACKEND_PID_FILE)`)."; \
	else \
		cd $(BACKEND_DIR) && (uv run uvicorn app.main:app --reload --port $(BACKEND_PORT) > ../$(BACKEND_LOG_FILE) 2>&1 & echo $$! > ../$(BACKEND_PID_FILE)); \
		echo "Backend starting on :$(BACKEND_PORT) (logs: $(BACKEND_LOG_FILE))"; \
	fi
	@echo "Frontend: http://localhost:8080"
	@echo "Backend:  http://localhost:$(BACKEND_PORT)/docs"

down: ## Stop frontend (Docker) and backend
	docker compose down
	@if [ -f $(BACKEND_PID_FILE) ]; then \
		kill `cat $(BACKEND_PID_FILE)` 2>/dev/null || true; \
		rm -f $(BACKEND_PID_FILE); \
		echo "Backend stopped."; \
	fi

backend: ## Run the backend dev server in the foreground (Ctrl+C to stop)
	cd $(BACKEND_DIR) && uv run uvicorn app.main:app --reload --port $(BACKEND_PORT)

frontend: ## Start only the frontend container
	docker compose up -d

test: test-backend test-frontend ## Run all tests (backend + frontend)

test-backend: ## Run backend tests (uv run pytest)
	cd $(BACKEND_DIR) && uv run pytest

test-frontend: ## Run frontend tests in a one-off container
	docker compose run --rm frontend npm run test

lint: ## Lint the frontend in a one-off container
	docker compose run --rm frontend npm run lint

logs: ## Tail the frontend container's logs
	docker compose logs -f frontend

reset-demo: ## Reset the backend's in-memory demo data via the admin API
	@token=$$(curl -s -X POST http://localhost:$(BACKEND_PORT)/api/admin/login \
		-H "Content-Type: application/json" \
		-d '{"username":"admin","password":"admin123"}' \
		| python3 -c "import sys,json; print(json.load(sys.stdin)['accessToken'])"); \
	curl -s -X POST http://localhost:$(BACKEND_PORT)/api/admin/reset \
		-H "Authorization: Bearer $$token"; echo

clean: down ## Stop everything and remove Docker volumes/containers
	docker compose down -v
	rm -f $(BACKEND_PID_FILE) $(BACKEND_LOG_FILE)
