# Bloodwork

Bloodwork is a self-hosted web app for importing blood test PDF reports, normalizing measurements, and tracking trends over time.

## Features

- Email/password registration and login.
- Cookie-based auth sessions with per-user data isolation.
- Bootstrap admin account (`kuweg_admin`) for server-folder import tools.
- PDF ingest + normalization into a historical table.
- Dashboard, table view, graphs, import queue with stop controls.
- Export table as **Excel / CSV / TXT / PDF**.
- Light and dark theme toggle.

## Tech stack

- Backend: FastAPI, SQLAlchemy (async), SQLite (default), Poetry.
- Frontend: React, TypeScript, Vite, Tailwind.

## Project structure

```text
backend/         API, DB models, auth, ingest services
frontend/        React UI (dashboard/table/graphics/import/export)
blood_work_data/ Local server-side PDF folder for admin imports
```

## Quick start

1. Backend

```bash
cd backend
poetry install
poetry run uvicorn app.main:app --reload
```

2. Frontend (new terminal)

```bash
cd frontend
pnpm install
pnpm dev
```

Open `http://localhost:5173`.

## Auth and roles

- Regular users: upload and manage their own reports.
- Admin users: same as regular + server data folder endpoints.
- On startup, backend ensures a bootstrap admin exists:
  - login: `kuweg_admin`
  - password: `kuweg_admin`
  - override via env vars `BW_BOOTSTRAP_ADMIN_LOGIN` and `BW_BOOTSTRAP_ADMIN_PASSWORD`.

## Environment

Backend settings are loaded from `backend/.env` with `BW_` prefix. Common variables:

- `BW_DATABASE_URL`
- `BW_CORS_ORIGINS`
- `BW_LLM_PROVIDER`
- `BW_LLM_API_KEY`
- `BW_LLM_MODEL`
- `BW_SESSION_SECURE_COOKIE`
- `BW_BOOTSTRAP_ADMIN_LOGIN`
- `BW_BOOTSTRAP_ADMIN_PASSWORD`

## Notes

- Default DB is SQLite. For heavy concurrent imports, Postgres is recommended in production.
- Keep import concurrency low on SQLite to avoid lock contention.
