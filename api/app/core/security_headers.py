"""Response headers for a JSON API that browsers should never render, frame or cache."""

from starlette.types import ASGIApp, Message, Receive, Scope, Send

_ALWAYS = [
    (b"x-content-type-options", b"nosniff"),
    (b"x-frame-options", b"DENY"),
    (b"content-security-policy", b"default-src 'none'; frame-ancestors 'none'"),
    (b"referrer-policy", b"no-referrer"),
    # Responses carry people's sessions, messages and payments: never keep them in a shared or
    # back/forward cache.
    (b"cache-control", b"no-store"),
]
_HSTS = (b"strict-transport-security", b"max-age=63072000; includeSubDomains")


class SecurityHeadersMiddleware:
    """Pure ASGI (no BaseHTTPMiddleware), so streaming and error responses get the headers too."""

    def __init__(self, app: ASGIApp, *, hsts: bool) -> None:
        self.app = app
        self.extra = [*_ALWAYS, *([_HSTS] if hsts else [])]

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        async def with_headers(message: Message) -> None:
            if message["type"] == "http.response.start":
                present = {k.lower() for k, _ in message.get("headers", [])}
                message["headers"] = [
                    *message.get("headers", []),
                    *((k, v) for k, v in self.extra if k not in present),
                ]
            await send(message)

        await self.app(scope, receive, with_headers)
