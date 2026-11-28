"""Request size guard: every JSON body we accept is small, so refuse big ones before parsing.

Avatars are the largest JSON payload (a resized data URL, under 200 KB). The one upload route,
photo/PDF reading for the study assistant, gets a larger cap that still fits the host's limit."""

from starlette.types import ASGIApp, Message, Receive, Scope, Send

MAX_BODY_BYTES = 256 * 1024
MAX_UPLOAD_BYTES = 4 * 1024 * 1024
UPLOAD_PATHS = frozenset({"/ai/extract"})
# Shared whiteboard scenes (PUT /tasks/{id}/whiteboard) may be bigger than other JSON.
WHITEBOARD_MAX_BYTES = 2 * 1024 * 1024


def cap_for(path: str) -> int:
    if path in UPLOAD_PATHS:
        return MAX_UPLOAD_BYTES
    if path.startswith("/tasks/") and path.endswith("/whiteboard"):
        return WHITEBOARD_MAX_BYTES
    return MAX_BODY_BYTES


class BodyLimitMiddleware:
    def __init__(self, app: ASGIApp) -> None:
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        cap = cap_for(scope.get("path", ""))
        length = dict(scope["headers"]).get(b"content-length")
        if length is not None and length.isdigit() and int(length) > cap:
            await _too_large(send)
            return
        seen = 0

        async def limited() -> Message:
            nonlocal seen
            msg = await receive()
            if msg["type"] == "http.request":
                seen += len(msg.get("body", b""))
                if seen > cap:
                    raise _TooLarge
            return msg

        try:
            await self.app(scope, limited, send)
        except _TooLarge:
            await _too_large(send)


class _TooLarge(Exception):
    pass


async def _too_large(send: Send) -> None:
    body = b'{"detail":"request body too large","code":"too_large"}'
    await send(
        {
            "type": "http.response.start",
            "status": 413,
            "headers": [
                (b"content-type", b"application/json"),
                (b"content-length", str(len(body)).encode()),
            ],
        }
    )
    await send({"type": "http.response.body", "body": body})
