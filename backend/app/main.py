import logging
from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.api import analysis, auth, results, upload
from app.config import settings
from app.db import init_db

logger = logging.getLogger(__name__)
LLM_HOSTS = frozenset({"api.openai.com", "api.anthropic.com", "api.deepseek.com"})


@asynccontextmanager
async def lifespan(_: FastAPI):
    await init_db()
    yield


app = FastAPI(title="Bloodwork API", version="0.1.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(upload.router)
app.include_router(results.router)
app.include_router(analysis.router)
app.include_router(auth.router)


def _is_llm_upstream(req: httpx.Request | None) -> bool:
    if req is None or req.url is None:
        return False
    return (req.url.host or "").lower() in LLM_HOSTS


def _map_llm_status(upstream_status: int) -> tuple[int, str]:
    if upstream_status in (401, 403):
        return (
            502,
            "LLM provider authentication failed. Check BW_LLM_PROVIDER, "
            "BW_LLM_API_KEY, and optional BW_LLM_MODEL.",
        )
    if upstream_status == 429:
        return 503, "LLM provider is rate-limiting requests. Retry shortly."
    if upstream_status >= 500:
        return 503, "LLM provider is temporarily unavailable. Retry shortly."
    return 502, "LLM provider request failed. Check provider configuration."


@app.exception_handler(httpx.HTTPStatusError)
async def handle_http_status_error(_request: Request, exc: httpx.HTTPStatusError):
    if _is_llm_upstream(exc.request):
        status_code, detail = _map_llm_status(exc.response.status_code)
        logger.warning(
            "LLM upstream HTTP error status=%s host=%s",
            exc.response.status_code,
            exc.request.url.host if exc.request else None,
        )
        return JSONResponse(status_code=status_code, content={"detail": detail})
    logger.exception("Unhandled upstream HTTP error")
    return JSONResponse(
        status_code=502,
        content={"detail": "Upstream HTTP request failed."},
    )


@app.exception_handler(httpx.RequestError)
async def handle_request_error(_request: Request, exc: httpx.RequestError):
    if _is_llm_upstream(exc.request):
        logger.warning(
            "LLM upstream request error type=%s host=%s",
            exc.__class__.__name__,
            exc.request.url.host if exc.request else None,
        )
        return JSONResponse(
            status_code=503,
            content={
                "detail": (
                    "Cannot reach LLM provider. Check network/provider configuration."
                )
            },
        )
    logger.exception("Unhandled upstream request error")
    return JSONResponse(
        status_code=502,
        content={"detail": "Upstream network request failed."},
    )


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}
