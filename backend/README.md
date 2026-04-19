# Bloodwork Backend

FastAPI service that parses multilingual PDF bloodwork reports and aggregates measurements by test type and date.

## Setup

Start Postgres (example):

```bash
docker run --name bloodwork-pg \
  -e POSTGRES_DB=bloodwork \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=postgres \
  -p 5432:5432 -d postgres:16-alpine
```

Then run API:

```bash
poetry install
poetry run uvicorn app.main:app --reload
```

The API will be available at http://localhost:8000 and OpenAPI docs at http://localhost:8000/docs.

## Endpoints

- `POST /auth/register` — create an account and start a session cookie
- `POST /auth/login` — sign in and start a session cookie
- `POST /auth/logout` — revoke current session cookie
- `GET  /auth/me` — current authenticated user
- `POST /reports?parser=regex|llm` — upload a PDF report (single file). `parser` is optional; defaults to `BW_DEFAULT_PARSER`.
- `GET  /reports/data-directory` — list PDFs in the server data folder (**admin only**)
- `POST /reports/ingest-file-from-dir?filename=...` — import one PDF from server data folder (**admin only**)
- `POST /reports/ingest-directory?parser=regex|llm` — bulk-import every PDF in the configured `bloodwork_data_dir` (**admin only**). Deduped by SHA-256 of file contents.
- `GET  /results/reports` — list uploaded reports
- `GET  /results/reports/{id}` — get one report
- `GET  /results/aggregate?names=hemoglobin&names=glucose` — time series per test

All `/reports`, `/results`, and `/analysis` endpoints require authentication and are strictly scoped to the current user.

## Parsers

Two strategies are available. Request-level override wins, otherwise `BW_DEFAULT_PARSER` is used.

- **`regex`** (default) — local `pdfplumber` text extraction + regex; free and offline. Recognizes test names for EN / RU / HR-BS-SR via the synonym table in `app/services/normalizer.py`.
- **`llm`** — extracts text + tables from the PDF and asks the configured provider to return structured JSON. Good for any language and messy layouts. Names still pass through the normalizer so unknown synonyms are silently dropped — extend the table to surface them.

### Providers

Implemented under `app/llm/`:

| Provider  | Env value       | Default model           | Base URL                          |
| --------- | --------------- | ----------------------- | --------------------------------- |
| OpenAI    | `openai`        | `gpt-4o-mini`           | `https://api.openai.com/v1`       |
| Anthropic | `anthropic`     | `claude-sonnet-4-6`     | `https://api.anthropic.com/v1`    |
| DeepSeek  | `deepseek`      | `deepseek-chat`         | `https://api.deepseek.com/v1`     |

Adding a new provider: implement the `LlmProvider` protocol (`app/llm/base.py`) and register it in `app/llm/factory.py`.

## Configuration

Env vars are prefixed with `BW_` (loaded from `.env`):

- `BW_DATABASE_URL` — SQLAlchemy URL (default `postgresql+asyncpg://postgres:postgres@localhost:5432/bloodwork`)
- `BW_UPLOAD_DIR` — where uploaded PDFs are stored (default `./uploads`)
- `BW_BLOODWORK_DATA_DIR` — server folder used by admin-only import endpoints (default `../blood_work_data`)
- `BW_CORS_ORIGINS` — allowed frontend origins (JSON list)
- `BW_DEFAULT_PARSER` — `regex` or `llm`
- `BW_LLM_PROVIDER` — `openai` | `anthropic` | `deepseek`
- `BW_LLM_API_KEY` — provider API key
- `BW_LLM_MODEL` — optional model override
- `BW_LLM_TIMEOUT_SECONDS` — HTTP timeout for provider calls
- `BW_SESSION_SECRET` — session secret string (set a strong unique value in production)
- `BW_SESSION_COOKIE_NAME` — cookie name (default `bw_session`)
- `BW_SESSION_TTL_HOURS` — session lifetime in hours (default 336 / 14 days)
- `BW_SESSION_SECURE_COOKIE` — set `true` for HTTPS production
- `BW_BOOTSTRAP_ADMIN_LOGIN` — startup admin login (default `kuweg_admin`)
- `BW_BOOTSTRAP_ADMIN_PASSWORD` — startup admin password (default `kuweg_admin`)

## Layout

```
app/
  api/          # FastAPI routers
  parsers/      # File-format parsers (PDF today)
  services/     # Normalizer + aggregator
  models/       # SQLAlchemy + Pydantic
  main.py
```

## Adding a new test

Append synonyms to `app/services/normalizer.py::SYNONYMS`. Raw names from reports are matched case- and punctuation-insensitive against all languages listed.

## Tests

```bash
poetry run pytest
```
