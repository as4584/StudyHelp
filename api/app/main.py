"""FastAPI application: the trusted backend boundary for Global Study Help Tutor."""

import logging

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sqlalchemy import text

from app.core.config import get_settings
from app.core.db import get_sessionmaker
from app.core.errors import DomainError
from app.core.failsafe import FailsafeMiddleware
from app.core.limits import BodyLimitMiddleware
from app.core.security_headers import SecurityHeadersMiddleware
from app.observability.logging import RequestContextMiddleware, configure_logging, event
from app.providers.llm import gateway_status
from app.routers import admin, ai, chat, demo, me, payments, tasks, video
from app.schemas.api import HealthOut

log = logging.getLogger("app")


def create_app() -> FastAPI:
    settings = get_settings()
    configure_logging()
    # The API map stays private outside local development (the web client has its own copy).
    dev = settings.environment in ("development", "test")
    app = FastAPI(
        title="Global Study Help Tutor API",
        version=settings.version,
        docs_url="/docs" if dev else None,
        redoc_url="/redoc" if dev else None,
        openapi_url="/openapi.json" if dev else None,
    )
    # Added first = innermost: escaped errors become readable JSON *inside* CORS.
    app.add_middleware(FailsafeMiddleware)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=False,  # bearer tokens only; no cookies cross-origin
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
        allow_headers=["authorization", "content-type", "x-request-id"],
    )
    app.add_middleware(SecurityHeadersMiddleware, hsts=settings.environment == "production")
    app.add_middleware(RequestContextMiddleware)
    app.add_middleware(BodyLimitMiddleware)

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
                # What the website shows: "demo" (no Stripe), "test" (Stripe test keys) or
                # "live" (real money). Derived from the key itself, never from a separate flag.
                "payments_mode": settings.payments_mode,
                "llm": settings.llm_provider,
                "translation": settings.translation_provider,
                "storage": settings.storage_provider,
                "video": settings.video_provider if settings.video_enabled else "off",
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
        # The API still serves everything else when the AI gateway is off, so this does not
        # fail readiness — it says so, for monitoring and for whoever is checking.
        gateway = await gateway_status(settings)
        out.providers["ai_gateway"] = gateway
        if gateway == "unreachable":
            event(log, "ready.ai_gateway_unreachable", logging.WARNING)
        return out

    for r in (
        me.router,
        tasks.router,
        payments.router,
        chat.router,
        ai.router,
        admin.router,
        video.router,
    ):
        app.include_router(r)
    if get_settings().environment == "demo":
        app.include_router(demo.router)
    if payments.simulated_enabled():
        app.include_router(payments.simulated)
    return app


app = create_app()
