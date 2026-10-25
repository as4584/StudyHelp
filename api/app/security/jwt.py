"""Supabase access-token verification against the project's JWKS (asymmetric keys)."""

import time
from dataclasses import dataclass
from typing import Any, Protocol

import jwt
from jwt import PyJWK, PyJWKSet


class InvalidToken(Exception):
    """Raised for any token that must be rejected with 401."""


@dataclass(frozen=True)
class TokenClaims:
    sub: str
    email: str | None
    raw: dict[str, Any]


class KeySource(Protocol):
    def get_key(self, kid: str) -> PyJWK: ...


class StaticKeySource:
    """Fixed JWKS, used by tests and offline tooling."""

    def __init__(self, jwks: dict[str, Any]) -> None:
        self._set = PyJWKSet.from_dict(jwks)

    def get_key(self, kid: str) -> PyJWK:
        for key in self._set.keys:
            if key.key_id == kid:
                return key
        raise InvalidToken("unknown signing key")


class RemoteKeySource:
    """JWKS fetched from Supabase and cached; refetched on unknown kid (key rotation)."""

    def __init__(self, url: str, ttl_s: int = 600) -> None:
        self._client = jwt.PyJWKClient(url, cache_keys=True, lifespan=ttl_s, timeout=5)

    def get_key(self, kid: str) -> PyJWK:
        try:
            return self._client.get_signing_key(kid)
        except jwt.PyJWKClientError as exc:
            raise InvalidToken("unable to resolve signing key") from exc


class TokenVerifier:
    def __init__(self, keys: KeySource, issuer: str, audience: str, algorithms: list[str]) -> None:
        # Symmetric algorithms are never accepted: they would let anyone holding the
        # legacy shared secret mint tokens, and enable alg-confusion attacks.
        allowed = [a for a in algorithms if not a.startswith("HS")]
        if not allowed:
            raise ValueError("at least one asymmetric algorithm is required")
        self._keys = keys
        self._issuer = issuer
        self._audience = audience
        self._algorithms = allowed

    def verify(self, token: str) -> TokenClaims:
        try:
            header = jwt.get_unverified_header(token)
        except jwt.PyJWTError as exc:
            raise InvalidToken("malformed token") from exc
        alg = header.get("alg")
        kid = header.get("kid")
        if alg not in self._algorithms or not isinstance(kid, str):
            raise InvalidToken("unsupported token algorithm or missing kid")
        key = self._keys.get_key(kid)
        try:
            claims: dict[str, Any] = jwt.decode(
                token,
                key=key.key,
                algorithms=[alg],
                audience=self._audience,
                issuer=self._issuer,
                options={"require": ["exp", "iat", "sub", "aud", "iss"]},
                leeway=5,
            )
        except jwt.PyJWTError as exc:
            raise InvalidToken(type(exc).__name__) from exc
        if claims.get("role") != "authenticated":
            # anon/service_role keys are JWTs too; they are never user sessions.
            raise InvalidToken("not a user session token")
        if claims["exp"] < time.time() - 5:
            raise InvalidToken("expired")
        return TokenClaims(sub=str(claims["sub"]), email=claims.get("email"), raw=claims)
