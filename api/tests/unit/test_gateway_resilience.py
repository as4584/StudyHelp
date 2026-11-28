"""The self-hosted AI gateway can be off. Then: answers fail fast with a friendly message, and
/ready says the gateway is unreachable instead of claiming everything is fine."""

import httpx
import pytest

from app.core.config import Settings
from app.providers import llm
from app.providers.llm import (
    GATEWAY_CONNECT_S,
    ChatTurn,
    LLMError,
    OllamaProvider,
    gateway_status,
)


def _settings(**kw: object) -> Settings:
    base = {
        "llm_provider": "ollama",
        "ollama_base_url": "http://127.0.0.1:9",  # nothing listens: refused at once
        "ollama_model": "gemma4:26b",
    }
    return Settings(**(base | kw))  # type: ignore[arg-type]


@pytest.fixture(autouse=True)
def _fresh_probe_cache() -> None:
    llm._probe_cache.clear()


def test_connecting_gets_seconds_answering_keeps_the_long_timeout() -> None:
    p = OllamaProvider(_settings())
    t = p._client.timeout
    assert t.connect == GATEWAY_CONNECT_S <= 5
    assert t.read == _settings().ollama_timeout_s


async def test_a_gateway_that_is_off_fails_the_answer_quickly() -> None:
    import time

    p = OllamaProvider(_settings())
    start = time.perf_counter()
    with pytest.raises(LLMError):
        await p.generate(system="s", turns=[ChatTurn("user", "hi")], max_tokens=10)
    assert time.perf_counter() - start < GATEWAY_CONNECT_S + 1


async def test_ready_reports_an_unreachable_gateway() -> None:
    assert await gateway_status(_settings()) == "unreachable"


async def test_tunnel_error_pages_count_as_unreachable(monkeypatch: pytest.MonkeyPatch) -> None:
    async def tunnel_down(self, url, **_k):  # type: ignore[no-untyped-def]
        return httpx.Response(530, text="origin unreachable")

    monkeypatch.setattr(httpx.AsyncClient, "get", tunnel_down)
    assert await gateway_status(_settings(ollama_base_url="https://ai.example.test")) == (
        "unreachable"
    )


async def test_a_gateway_that_answers_is_ok_even_if_it_refuses_the_probe(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def refuses(self, url, **_k):  # type: ignore[no-untyped-def]
        return httpx.Response(403, text="model not allowed")

    monkeypatch.setattr(httpx.AsyncClient, "get", refuses)
    assert await gateway_status(_settings(ollama_base_url="https://ai.example.test")) == "ok"


async def test_hosted_and_fake_models_need_no_gateway() -> None:
    assert await gateway_status(_settings(llm_provider="fake")) == "n/a"
