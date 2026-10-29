"""FastAPI application: the trusted backend boundary for Global Study Help Tutor."""

import logging

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text

from app.core.config import get_settings
from app.core.db import get_sessionmaker
from app.core.errors import DomainError
from app.observability.logging import RequestContextMiddleware, configure_logging, event
from app.routers import admin, ai, chat, me, payments, tasks
from app.schemas.api import HealthOut

log = logging.getLogger("app")


def create_app() -> FastAPI:
    settings = get_settings()
    configure_logging()
    app = FastAPI(title="Global Study Help Tutor API", version=settings.version)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=False,  # bearer tokens only; no cookies cross-origin
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
        allow_headers=["authorization", "content-type", "x-request-id"],
    )
    app.add_middleware(RequestContextMiddleware)

    @app.exception_handler(DomainError)
    async def domain_error(_: Request, exc: DomainError) -> JSONResponse:
        if exc.status_code >= 500:
            event(log, "domain.provider_error", logging.ERROR, code=exc.code, detail=exc.message)
        return JSONResponse(
            {"detail": exc.message, "code": exc.code, **exc.extra}, status_code=exc.status_code
        )

    def _identity(status: str) -> HealthOut:
        return HealthOut(
            status=status,
            version=settings.version,
            git_sha=settings.git_sha,
            environment=settings.environment,
            providers={
                "payments": settings.payments_provider,
                "llm": settings.llm_provider,
                "translation": settings.translation_provider,
                "storage": settings.storage_provider,
            },
        )

    @app.get("/health", response_model=HealthOut, tags=["ops"])
    async def health() -> HealthOut:
        return _identity("ok")

    @app.get("/ready", response_model=HealthOut, tags=["ops"])
    async def ready() -> HealthOut | JSONResponse:
        try:
            async with get_sessionmaker()() as session:
                rev = (
                    await session.execute(text("select version_num from alembic_version"))
                ).scalar()
        except Exception as exc:
            event(log, "ready.db_unavailable", logging.ERROR, error=type(exc).__name__)
            return JSONResponse(_identity("db_unavailable").model_dump(), status_code=503)
        out = _identity("ready")
        out.providers["schema"] = str(rev)
        return out

    for r in (me.router, tasks.router, payments.router, chat.router, ai.router, admin.router):
        app.include_router(r)
    if payments.simulated_enabled():
        app.include_router(payments.simulated)
    return app


app = create_app()
