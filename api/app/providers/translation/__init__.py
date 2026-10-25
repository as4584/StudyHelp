"""Translation providers. Failures raise TranslationError; callers must keep the original."""

from functools import lru_cache
from typing import Protocol

import httpx

from app.core.config import Settings, get_settings


class TranslationError(Exception):
    pass


class TranslationProvider(Protocol):
    name: str

    async def translate(self, text: str, *, source: str | None, target: str) -> str: ...


class DeepLProvider:
    name = "deepl"

    def __init__(self, settings: Settings) -> None:
        self._s = settings

    async def translate(self, text: str, *, source: str | None, target: str) -> str:
        data = {"text": [text], "target_lang": target.upper()}
        if source:
            data["source_lang"] = source.upper()
        try:
            async with httpx.AsyncClient(timeout=self._s.translation_timeout_s) as client:
                resp = await client.post(
                    self._s.deepl_api_url,
                    json=data,
                    headers={"Authorization": f"DeepL-Auth-Key {self._s.deepl_api_key}"},
                )
            resp.raise_for_status()
            return str(resp.json()["translations"][0]["text"])
        except (httpx.HTTPError, KeyError, IndexError, ValueError) as exc:
            raise TranslationError(f"deepl: {type(exc).__name__}") from exc


class GoogleProvider:
    name = "google"

    def __init__(self, settings: Settings) -> None:
        self._s = settings

    async def translate(self, text: str, *, source: str | None, target: str) -> str:
        params = {"q": text, "target": target, "format": "text"}
        if source:
            params["source"] = source
        try:
            async with httpx.AsyncClient(timeout=self._s.translation_timeout_s) as client:
                resp = await client.post(
                    "https://translation.googleapis.com/language/translate/v2",
                    params={"key": self._s.google_translate_api_key},
                    json=params,
                )
            resp.raise_for_status()
            return str(resp.json()["data"]["translations"][0]["translatedText"])
        except (httpx.HTTPError, KeyError, IndexError, ValueError) as exc:
            raise TranslationError(f"google: {type(exc).__name__}") from exc


class FakeTranslationProvider:
    """Deterministic, visibly-labelled adapter for tests and keyless demos."""

    name = "fake"
    FAIL_MARKER = "[[fail-translation]]"

    async def translate(self, text: str, *, source: str | None, target: str) -> str:
        if self.FAIL_MARKER in text:
            raise TranslationError("fake: forced failure")
        return f"[{(source or 'auto').upper()}→{target.upper()}] {text}"


@lru_cache
def get_translation_provider() -> TranslationProvider:
    s = get_settings()
    if s.translation_provider == "deepl":
        return DeepLProvider(s)
    if s.translation_provider == "google":
        return GoogleProvider(s)
    return FakeTranslationProvider()
