import httpx
import pytest

from app.core.config import get_settings
from app.core.errors import NotFound, ProviderError
from app.providers.storage import SupabaseStorage


@pytest.mark.parametrize(
    ("status", "body", "error"),
    [
        (400, '{"statusCode":"404","error":"not_found","message":"Object not found"}', NotFound),
        (500, '{"error":"boom"}', ProviderError),
    ],
)
async def test_download_of_a_file_that_was_never_uploaded_is_a_404(
    monkeypatch: pytest.MonkeyPatch, status: int, body: str, error: type[Exception]
) -> None:
    async def fake_post(self: httpx.AsyncClient, url: str, **_: object) -> httpx.Response:
        return httpx.Response(status, text=body, request=httpx.Request("POST", url))

    monkeypatch.setattr(httpx.AsyncClient, "post", fake_post)
    with pytest.raises(error):
        await SupabaseStorage(get_settings()).signed_download("task-files", "t/f/rubric.pdf")
