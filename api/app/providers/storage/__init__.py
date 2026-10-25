"""Private object storage. Browsers only ever receive short-lived signed URLs from FastAPI."""

from dataclasses import dataclass
from functools import lru_cache
from typing import Protocol
from urllib.parse import quote

import httpx

from app.core.config import Settings, get_settings
from app.core.errors import ProviderError


@dataclass(frozen=True)
class SignedUpload:
    url: str
    token: str
    path: str


class StorageProvider(Protocol):
    async def signed_upload(self, bucket: str, path: str) -> SignedUpload: ...

    async def signed_download(self, bucket: str, path: str, expires_in: int = 300) -> str: ...


class SupabaseStorage:
    def __init__(self, settings: Settings) -> None:
        self._base = f"{settings.supabase_url.rstrip('/')}/storage/v1"
        self._headers = {
            "apikey": settings.supabase_secret_key,
            "Authorization": f"Bearer {settings.supabase_secret_key}",
        }

    async def signed_upload(self, bucket: str, path: str) -> SignedUpload:
        url = f"{self._base}/object/upload/sign/{bucket}/{quote(path)}"
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(url, headers=self._headers)
        if resp.status_code >= 400:
            raise ProviderError(f"storage upload sign failed ({resp.status_code})")
        signed = str(resp.json()["url"])  # "/object/upload/sign/<bucket>/<path>?token=..."
        token = signed.split("token=", 1)[1]
        return SignedUpload(url=f"{self._base}{signed}", token=token, path=path)

    async def signed_download(self, bucket: str, path: str, expires_in: int = 300) -> str:
        url = f"{self._base}/object/sign/{bucket}/{quote(path)}"
        async with httpx.AsyncClient(timeout=10) as client:
            resp = await client.post(url, headers=self._headers, json={"expiresIn": expires_in})
        if resp.status_code >= 400:
            raise ProviderError(f"storage download sign failed ({resp.status_code})")
        return f"{self._base}{resp.json()['signedURL']}"


class FakeStorage:
    async def signed_upload(self, bucket: str, path: str) -> SignedUpload:
        return SignedUpload(
            url=f"https://storage.invalid/{bucket}/{path}?token=fake",
            token="fake",  # noqa: S106 - placeholder for the fake adapter
            path=path,
        )

    async def signed_download(self, bucket: str, path: str, expires_in: int = 300) -> str:
        return f"https://storage.invalid/{bucket}/{path}?sig=fake"


@lru_cache
def get_storage() -> StorageProvider:
    s = get_settings()
    if s.storage_provider == "supabase":
        return SupabaseStorage(s)
    return FakeStorage()
