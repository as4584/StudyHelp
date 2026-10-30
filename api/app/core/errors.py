"""Domain errors mapped to HTTP responses in one place."""


class DomainError(Exception):
    status_code = 400
    code = "bad_request"

    def __init__(self, message: str, **extra: object) -> None:
        super().__init__(message)
        self.message = message
        self.extra = extra


class NotFound(DomainError):
    status_code = 404
    code = "not_found"


class Forbidden(DomainError):
    status_code = 403
    code = "forbidden"


class Conflict(DomainError):
    status_code = 409
    code = "conflict"


class InvalidState(DomainError):
    status_code = 409
    code = "invalid_state"


class VideoDisabled(DomainError):
    status_code = 404
    code = "video_disabled"


class QuotaExceeded(DomainError):
    """An AI usage limit was reached; ``code`` says which, ``extra['resets_at']`` says when."""

    def __init__(self, message: str, *, code: str, status_code: int, resets_at: str) -> None:
        super().__init__(message, resets_at=resets_at)
        self.code = code
        self.status_code = status_code


class ProviderError(DomainError):
    status_code = 502
    code = "provider_error"
