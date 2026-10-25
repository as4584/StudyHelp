"""Domain errors mapped to HTTP responses in one place."""


class DomainError(Exception):
    status_code = 400
    code = "bad_request"

    def __init__(self, message: str) -> None:
        super().__init__(message)
        self.message = message


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


class ProviderError(DomainError):
    status_code = 502
    code = "provider_error"
