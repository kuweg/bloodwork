# Bloodwork

Bloodwork is a self-hosted web app for importing blood test PDF reports, normalizing measurements, and tracking trends over time.

## Features

- Email/password registration and login.
- Cookie-based auth sessions with per-user data isolation.
- Admin role with server-folder import controls.
- PDF ingest + normalization into a historical table.
- Dashboard, table view, graphs, import queue with stop controls.
- Export table as **Excel / CSV / TXT / PDF**.
- Light and dark theme toggle.

## Tech stack

- Backend: FastAPI, SQLAlchemy (async), SQLite (default), Poetry.
- Frontend: React, TypeScript, Vite, Tailwind.
- Deployment: Docker Compose (Postgres + backend + frontend/nginx).

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
- Admin users: all regular-user actions + server data folder import tools.
- Bootstrap admin is created automatically on startup.
- Override bootstrap credentials with:
  - `BW_BOOTSTRAP_ADMIN_LOGIN`
  - `BW_BOOTSTRAP_ADMIN_PASSWORD`

## Environment

Backend settings use `BW_` prefix. Common variables:

- `BW_DATABASE_URL`
- `BW_CORS_ORIGINS`
- `BW_LLM_PROVIDER`
- `BW_LLM_API_KEY`
- `BW_LLM_MODEL`
- `BW_SESSION_SECURE_COOKIE`
- `BW_BOOTSTRAP_ADMIN_LOGIN`
- `BW_BOOTSTRAP_ADMIN_PASSWORD`

Frontend build-time variables:

- `VITE_DEFAULT_CONCURRENCY`
- `VITE_FOLDER_IMPORT_MAX_CONCURRENCY`

## Deploy with Docker Compose

1. Create env file from template:

```bash
cp .env.example .env
```

2. Edit `.env` with real values:

- strong `POSTGRES_PASSWORD`
- strong `BW_SESSION_SECRET`
- real `BW_CORS_ORIGINS` (your public frontend URL)
- real `BW_BOOTSTRAP_ADMIN_PASSWORD`
- LLM settings (`BW_LLM_PROVIDER`, `BW_LLM_API_KEY`, optional `BW_LLM_MODEL`)
- frontend queue settings (`VITE_DEFAULT_CONCURRENCY`, `VITE_FOLDER_IMPORT_MAX_CONCURRENCY`)

3. Build and run:

```bash
docker compose up -d --build
```

4. Open app:

- `http://localhost` (frontend through nginx)

5. Check logs if needed:

```bash
docker compose logs -f backend frontend db
```

## Production notes

- Compose setup uses **Postgres** by default (`BW_DATABASE_URL` points to `db`).
- Keep `BW_SESSION_SECURE_COOKIE=true` behind HTTPS.
- Persist volumes:
  - `postgres_data` (DB)
  - `backend_uploads` (uploaded PDFs)
  - `./blood_work_data` bind mount (admin server-folder imports)
