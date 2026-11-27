"""Turn a homework photo or PDF into text the student can ask the study assistant about.

Deterministic first, model last:
1. The file type is decided by its first bytes, never by the name or the browser's claim.
2. A PDF with a text layer is read directly (pypdf): exact, fast, no model.
3. Only photos, and PDFs that are scans (pages that are just pictures), go to the vision
   model, which is told to transcribe, not to solve.
The text goes back into the question box, so the student sees and can fix it before asking;
then the math checker (``solver``) runs on it like on any typed question.
"""

import asyncio
import base64
import io
import logging
import re
import time
import uuid
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any

import httpx
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings, get_settings
from app.core.errors import DomainError, ProviderError, TooMany
from app.models.entities import AiUsage
from app.observability.logging import event, request_id_var
from app.providers.llm import GATEWAY_CONNECT_S

log = logging.getLogger("extract")

MAX_PAGES = 10
MAX_SCANNED_PAGES = 3
MAX_TEXT = 4000  # the question box's own limit
MIN_TEXT_LAYER = 40  # fewer letters than this and the PDF is treated as a scan
PDF_TIME_LIMIT_S = 10.0
PER_DAY = 30

PROMPT = (
    "Transcribe all the text in this image exactly as written: questions, numbers, labels "
    "and answer choices. Write math as plain text: x^2 for powers, sqrt(x), (a)/(b) for "
    "fractions, and keep each question on its own line. Do not solve, explain or add "
    "anything. If there is no readable text, reply with exactly: NO_TEXT"
)


class UnreadableFile(DomainError):
    status_code = 422
    code = "unreadable_file"


def sniff(data: bytes) -> str | None:
    if data.startswith(b"%PDF-"):
        return "pdf"
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return "png"
    if data.startswith(b"\xff\xd8\xff"):
        return "jpeg"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "webp"
    return None


@dataclass(frozen=True)
class Extracted:
    text: str
    method: str  # "pdf-text" | "vision"
    pages: int
    truncated: bool


def _tidy(text: str) -> tuple[str, bool]:
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text).strip()
    return text[:MAX_TEXT], len(text) > MAX_TEXT


def _page_jpeg(page: Any) -> bytes | None:
    """The largest JPEG drawn on a page. Scanners and phone scan apps store each page as one
    JPEG, whose stream bytes are the file itself, so no image library is needed."""
    try:
        xobjects = page["/Resources"].get_object().get("/XObject")
        if not xobjects:
            return None
        best: bytes | None = None
        for ref in xobjects.get_object().values():
            obj = ref.get_object()
            filters = obj.get("/Filter")
            names = filters if isinstance(filters, list) else [filters]
            if obj.get("/Subtype") != "/Image" or names[-1:] != ["/DCTDecode"]:
                continue
            data = obj.get_data()
            if sniff(data) == "jpeg" and (best is None or len(data) > len(best)):
                best = data
        return best
    except (KeyError, AttributeError, TypeError, ValueError, ImportError):
        return None


def _read_pdf(data: bytes) -> tuple[str, list[bytes], int]:
    """Text layer of the first pages, plus the page images to use if it's a scan."""
    from pypdf import PdfReader
    from pypdf.errors import PdfReadError

    try:
        reader = PdfReader(io.BytesIO(data))
        if reader.is_encrypted:
            raise UnreadableFile("this PDF is password-protected")
        pages = reader.pages[:MAX_PAGES]
        text = "\n\n".join((p.extract_text() or "") for p in pages)
        images: list[bytes] = []
        if len(re.findall(r"[^\W\d_]", text)) < MIN_TEXT_LAYER:
            for p in pages[:MAX_SCANNED_PAGES]:
                if pic := _page_jpeg(p):
                    images.append(pic)
        return text, images, len(pages)
    except UnreadableFile:
        raise
    except (PdfReadError, ValueError, KeyError, TypeError, OSError) as exc:
        raise UnreadableFile("couldn't open this PDF") from exc


async def _vision(settings: Settings, image: bytes) -> str:
    headers = (
        {"Authorization": f"Bearer {settings.ollama_api_key}"} if settings.ollama_api_key else {}
    )
    body = {
        "model": settings.ocr_ollama_model,
        "stream": False,
        "think": False,
        "keep_alive": "30m",
        "options": {"temperature": 0, "num_predict": 1000},
        "messages": [
            {"role": "user", "content": PROMPT, "images": [base64.b64encode(image).decode()]}
        ],
    }
    try:
        async with httpx.AsyncClient(
            base_url=settings.ollama_base_url.rstrip("/"),
            headers=headers,
            timeout=httpx.Timeout(settings.ocr_timeout_s, connect=GATEWAY_CONNECT_S),
            trust_env=False,
        ) as client:
            resp = await client.post("/api/chat", json=body)
            resp.raise_for_status()
            text = str(resp.json()["message"]["content"])
    except (httpx.HTTPError, KeyError, ValueError) as exc:
        raise ProviderError(
            "Reading photos is temporarily unavailable. Please type your question instead,"
            " or try again in a few minutes."
        ) from exc
    text = re.sub(r"<think>.*?</think>", "", text, flags=re.DOTALL).strip()
    text = re.sub(r"^```\w*\n?|\n?```$", "", text).strip()
    return "" if text.strip().upper() == "NO_TEXT" else text


async def _check_rate(session: AsyncSession, user_id: uuid.UUID) -> None:
    since = datetime.now(UTC) - timedelta(days=1)
    used = await session.scalar(
        select(func.count()).where(
            AiUsage.user_id == user_id, AiUsage.provider == "ocr", AiUsage.created_at >= since
        )
    )
    if (used or 0) >= PER_DAY:
        raise TooMany(f"you can read up to {PER_DAY} files a day — try again tomorrow")


async def extract(
    session: AsyncSession, user_id: uuid.UUID, premium: bool, data: bytes
) -> Extracted:
    kind = sniff(data)
    if kind is None:
        raise UnreadableFile("upload a photo (JPG, PNG, WebP) or a PDF")
    await _check_rate(session, user_id)
    settings = get_settings()
    start = time.perf_counter()
    pages = 1
    model = "-"
    if kind == "pdf":
        try:
            text, images, pages = await asyncio.wait_for(
                asyncio.to_thread(_read_pdf, data), PDF_TIME_LIMIT_S
            )
        except TimeoutError as exc:
            raise UnreadableFile("this PDF took too long to read") from exc
        method = "pdf-text"
        model = "pypdf"
    else:
        text, images, method = "", [data], "vision"
    if images and method == "pdf-text" and len(re.findall(r"[^\W\d_]", text)) < MIN_TEXT_LAYER:
        method = "vision"
    if method == "vision":
        if settings.ocr_provider == "off" or not images:
            raise UnreadableFile(
                "this file has no typed text to read"
                if kind == "pdf"
                else "reading photos isn't available right now — type the question instead"
            )
        model = settings.ocr_ollama_model
        parts = [await _vision(settings, img) for img in images]
        text = "\n\n".join(p for p in parts if p)
    clean, truncated = _tidy(text)
    latency = round((time.perf_counter() - start) * 1000)
    session.add(
        AiUsage(
            user_id=user_id,
            chat_id=None,
            provider="ocr",
            model=model,
            status="ok" if clean else "empty",
            latency_ms=latency,
            premium=premium,
            request_id=request_id_var.get(),
        )
    )
    await session.commit()
    event(log, "ocr.done", method=method, pages=pages, chars=len(clean), latency_ms=latency)
    if not clean:
        raise UnreadableFile("no readable text found — try a sharper, closer photo")
    return Extracted(text=clean, method=method, pages=pages, truncated=truncated)
