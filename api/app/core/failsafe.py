"""Last line of defence for errors nothing else handled.

Starlette turns an unhandled exception into a plain-text 500 in its outermost layer, OUTSIDE
the CORS middleware, so the browser receives no Access-Control-Allow-Origin header, can't read
the response, and the page can only say "network error". This middleware sits INSIDE CORS and
answers every escaped exception with JSON the page can read:

- a dependency that is away (database, an upstream timing out or refusing) -> 503
  ``temporarily_unavailable``, so people are told to retry rather than that something broke;
- anything else -> 500 ``internal_error`` with the request id, never the exception text.
"""

import logging

from sqlalchemy.exc import DBAPIError, InterfaceError, OperationalError
from starlette.responses import JSONResponse
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from app.observability.logging import event, request_id_var

log = logging.getLogger("app")

# Connection-level failures: the dependency is unreachable, not our code being wrong.
_UNAVAILABLE: tuple[type[BaseException], ...] = (
    OperationalError,
    InterfaceError,
    ConnectionError,
    TimeoutError,
)


def _is_unavailable(exc: BaseException) -> bool:
    if isinstance(exc, _UNAVAILABLE):
        return True
    # asyncpg's connection errors arrive wrapped in DBAPIError with connection_invalidated.
    return isinstance(exc, DBAPIError) and bool(exc.connection_invalidated)


class FailsafeMiddleware:
    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        started = False

        async def tracking_send(message: Message) -> None:
            nonlocal started
            if message["type"] == "http.response.start":
                started = True
            await send(message)

        try:
            await self.app(scope, receive, tracking_send)
        except Exception as exc:
            if started:  # headers already went out; nothing safe left to send
                raise
            rid = request_id_var.get()
            if _is_unavailable(exc):
                event(
                    log,
                    "dependency.unavailable",
                    logging.ERROR,
                    error=type(exc).__name__,
                    path=scope.get("path"),
                )
                status, code = 503, "temporarily_unavailable"
                detail = "This is temporarily unavailable. Please try again in a minute."
            else:
                log.exception("unhandled error on %s", scope.get("path"))
                status, code = 500, "internal_error"
                detail = "Something went wrong on our side. Please try again."
            response = JSONResponse(
                {"detail": detail, "code": code, "request_id": rid}, status_code=status
            )
            await response(scope, receive, send)
