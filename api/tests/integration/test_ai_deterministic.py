"""Math checking on AI answers, and reading homework photos / PDFs into the question box."""

import json
import zlib

import httpx
import pytest

from tests.conftest import UserFactory


def make_pdf(lines: list[str], image_jpeg: bytes | None = None) -> bytes:
    """Smallest valid one-page PDF: typed text lines, or just a picture (a scan)."""
    if image_jpeg is None:
        body = " ".join(f"({ln}) Tj 0 -16 Td" for ln in lines)
        ops = "BT /F1 12 Tf 72 720 Td " + body + " ET"
        res = "<< /Font << /F1 5 0 R >> >>"
        extra = b"5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj\n"
    else:
        ops = "q 200 0 0 200 72 500 cm /Im1 Do Q"
        res = "<< /XObject << /Im1 5 0 R >> >>"
        extra = (
            b"5 0 obj << /Type /XObject /Subtype /Image /Width 2 /Height 2 /ColorSpace "
            b"/DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length "
            + str(len(image_jpeg)).encode()
            + b" >> stream\n"
            + image_jpeg
            + b"\nendstream endobj\n"
        )
    stream = zlib.compress(ops.encode())
    objs = [
        b"1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n",
        b"2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj\n",
        b"3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R "
        b"/Resources " + res.encode() + b" >> endobj\n",
        b"4 0 obj << /Length " + str(len(stream)).encode() + b" /Filter /FlateDecode >> "
        b"stream\n" + stream + b"\nendstream endobj\n",
        extra,
    ]
    out, offsets = b"%PDF-1.4\n", []
    for o in objs:
        offsets.append(len(out))
        out += o
    xref = len(out)
    out += f"xref\n0 {len(objs) + 1}\n0000000000 65535 f \n".encode()
    out += b"".join(f"{off:010d} 00000 n \n".encode() for off in offsets)
    trailer = f"trailer << /Size {len(objs) + 1} /Root 1 0 R >>\nstartxref\n{xref}\n"
    return out + trailer.encode() + b"%%EOF"


TINY_JPEG = bytes.fromhex(
    "ffd8ffe000104a46494600010100000100010000ffdb004300080606070605080707070909080a0c140d0c0b0b0c"
    "1912130f141d1a1f1e1d1a1c1c20242e2720222c231c1c2837292c30313434341f27393d38323c2e333432ffc0"
    "000b080002000201011100ffc4001400010000000000000000000000000000000affc4001410010000000000000000"
    "000000000000000000ffda0008010100003f00d2cf20ffd9"
)


async def test_math_answers_get_a_checked_line_and_the_model_gets_the_fact(
    client: httpx.AsyncClient, make_user: UserFactory
) -> None:
    from app.providers.llm import LLMResult, get_llm_provider

    app = client._transport.app  # type: ignore[attr-defined]
    seen: dict[str, str] = {}

    class Spy:
        name = "spy"

        async def generate(self, *, system: str, **_: object) -> LLMResult:
            seen["system"] = system
            return LLMResult(
                text="Key idea: power rule.", model="spy-1", input_tokens=1, output_tokens=1
            )

    s = await make_user("student")
    chat = (await client.post("/ai/chats", headers=s.h, json={"subject": "Calculus"})).json()
    app.dependency_overrides[get_llm_provider] = lambda: Spy()
    try:
        r = await client.post(
            f"/ai/chats/{chat['id']}/messages",
            headers=s.h,
            json={"question": "What is the derivative of 3x^2 + 5x - 7?"},
        )
    finally:
        app.dependency_overrides.pop(get_llm_provider)
    assert r.status_code == 201
    assert r.json()["content"] == "Key idea: power rule.\nChecked: d/dx of 3x^2 + 5x - 7 = 6x + 5"
    assert "d/dx of 3x^2 + 5x - 7 = 6x + 5" in seen["system"]


async def test_non_math_questions_are_untouched(
    client: httpx.AsyncClient, make_user: UserFactory
) -> None:
    s = await make_user("student")
    chat = (await client.post("/ai/chats", headers=s.h, json={"subject": "English"})).json()
    r = await client.post(
        f"/ai/chats/{chat['id']}/messages", headers=s.h, json={"question": "Who wrote Emma?"}
    )
    assert r.status_code == 201 and "Checked:" not in r.json()["content"]


async def test_text_pdf_is_read_without_any_model(
    client: httpx.AsyncClient, make_user: UserFactory, db
) -> None:  # type: ignore[no-untyped-def]
    s = await make_user("student")
    pdf = make_pdf(["Homework 4", "1. Solve for x: 2x + 6 = 20", "2. Differentiate x^3 + 2x"])
    r = await client.post(
        "/ai/extract", headers={**s.h, "content-type": "application/pdf"}, content=pdf
    )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["method"] == "pdf-text" and body["pages"] == 1
    assert "Solve for x: 2x + 6 = 20" in body["text"]
    row = await db.fetchrow("select provider, model, status from ai_usage")
    assert dict(row) == {"provider": "ocr", "model": "pypdf", "status": "ok"}


async def test_photos_and_scans_go_to_the_vision_model(
    client: httpx.AsyncClient, make_user: UserFactory, monkeypatch: pytest.MonkeyPatch
) -> None:
    from app.core.config import get_settings
    from app.services import extract

    sent: list[dict[str, object]] = []
    real_post = httpx.AsyncClient.post

    async def fake_post(self: httpx.AsyncClient, url: str, **kw: object) -> httpx.Response:
        if str(self.base_url).startswith("http://api.test"):
            return await real_post(self, url, **kw)  # type: ignore[arg-type]
        sent.append(kw["json"])  # type: ignore[arg-type]
        return httpx.Response(
            200,
            json={"message": {"content": "1. Solve 3x = 12"}},
            request=httpx.Request("POST", "http://vision.test" + url),
        )

    monkeypatch.setenv("OCR_PROVIDER", "ollama")
    monkeypatch.setenv("OCR_OLLAMA_MODEL", "vision-test")
    get_settings.cache_clear()
    monkeypatch.setattr(httpx.AsyncClient, "post", fake_post)
    try:
        s = await make_user("student")
        r = await client.post("/ai/extract", headers=s.h, content=TINY_JPEG)
        assert r.status_code == 200, r.text
        assert r.json() == {
            "text": "1. Solve 3x = 12",
            "method": "vision",
            "pages": 1,
            "truncated": False,
        }
        r = await client.post("/ai/extract", headers=s.h, content=make_pdf([], TINY_JPEG))
        assert r.status_code == 200 and r.json()["method"] == "vision", r.text
    finally:
        monkeypatch.undo()
        get_settings.cache_clear()
    assert sent[0]["model"] == "vision-test"
    msg = sent[0]["messages"][0]  # type: ignore[index]
    assert "Do not solve" in msg["content"] and len(msg["images"]) == 1
    assert extract.PROMPT in json.dumps(sent[1])


async def test_photo_reading_off_says_so(client: httpx.AsyncClient, make_user: UserFactory) -> None:
    s = await make_user("student")
    r = await client.post("/ai/extract", headers=s.h, content=TINY_JPEG)
    assert r.status_code == 422 and r.json()["code"] == "unreadable_file"


@pytest.mark.parametrize(
    "data", [b"MZ\x90\x00 not an image", b"<svg onload=alert(1)>", b"%PDF-1.4 garbage", b""]
)
async def test_refuses_files_that_are_not_photos_or_pdfs(
    client: httpx.AsyncClient, make_user: UserFactory, data: bytes
) -> None:
    s = await make_user("student")
    r = await client.post("/ai/extract", headers={**s.h, "content-type": "image/png"}, content=data)
    assert r.status_code == 422


async def test_upload_size_and_who_may_upload(
    client: httpx.AsyncClient, make_user: UserFactory
) -> None:
    s, t = await make_user("student"), await make_user("tutor")
    big = b"%PDF-" + b"0" * (4 * 1024 * 1024)
    assert (await client.post("/ai/extract", headers=s.h, content=big)).status_code == 413
    pdf = make_pdf(["x"])
    assert (await client.post("/ai/extract", content=pdf)).status_code == 401
    assert (await client.post("/ai/extract", headers=t.h, content=pdf)).status_code == 403
    # Every other route keeps the small JSON cap.
    r = await client.post("/tasks", headers=s.h, content=b"x" * (300 * 1024))
    assert r.status_code == 413


async def test_daily_file_limit(
    client: httpx.AsyncClient, make_user: UserFactory, monkeypatch: pytest.MonkeyPatch
) -> None:
    from app.services import extract

    monkeypatch.setattr(extract, "PER_DAY", 2)
    s = await make_user("student")
    pdf = make_pdf(["Question one is about fractions and decimals today."])
    for _ in range(2):
        assert (await client.post("/ai/extract", headers=s.h, content=pdf)).status_code == 200
    r = await client.post("/ai/extract", headers=s.h, content=pdf)
    assert r.status_code == 429
