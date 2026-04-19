SHELL := /bin/bash

BACKEND_DIR ?= backend
FRONTEND_DIR ?= frontend

BACKEND_HOST ?= 0.0.0.0
BACKEND_PORT ?= 8000
FRONTEND_HOST ?= 0.0.0.0
FRONTEND_PORT ?= 5173

.PHONY: help install install-backend install-frontend backend frontend dev

help:
	@echo "Targets:"
	@echo "  make install         Install backend and frontend dependencies"
	@echo "  make backend         Start backend only (uvicorn with --reload)"
	@echo "  make frontend        Start frontend only (vite dev server)"
	@echo "  make dev             Start backend and frontend together"
	@echo ""
	@echo "Override ports/hosts if needed:"
	@echo "  make dev BACKEND_PORT=8001 FRONTEND_PORT=5174"

install: install-backend install-frontend

install-backend:
	cd $(BACKEND_DIR) && poetry install

install-frontend:
	cd $(FRONTEND_DIR) && pnpm install

backend:
	cd $(BACKEND_DIR) && poetry run uvicorn app.main:app --reload --host $(BACKEND_HOST) --port $(BACKEND_PORT)

frontend:
	cd $(FRONTEND_DIR) && pnpm dev --host $(FRONTEND_HOST) --port $(FRONTEND_PORT)

dev:
	@set -euo pipefail; \
	cd $(BACKEND_DIR); poetry run uvicorn app.main:app --reload --host $(BACKEND_HOST) --port $(BACKEND_PORT) & \
	BACK_PID=$$!; \
	cd ../$(FRONTEND_DIR); pnpm dev --host $(FRONTEND_HOST) --port $(FRONTEND_PORT) & \
	FRONT_PID=$$!; \
	trap 'kill $$BACK_PID $$FRONT_PID 2>/dev/null || true' INT TERM EXIT; \
	echo "Backend:  http://$(BACKEND_HOST):$(BACKEND_PORT)"; \
	echo "Frontend: http://$(FRONTEND_HOST):$(FRONTEND_PORT)"; \
	wait $$BACK_PID $$FRONT_PID
