import json

import httpx
import pytest

from app.core.config import Settings
from app.providers.llm import ChatTurn, LLMError, OllamaProvider


def _provider(handler: httpx.MockTransport) -> OllamaProvider:
    p = OllamaProvider(
        Settings(llm_provider="ollama", ollama_model="qwen-test", ollama_api_key="k")
    )
    p._client = httpx.AsyncClient(base_url="http://ollama.test", transport=handler)
    return p


async def test_ollama_sends_system_and_turns_and_maps_usage() -> None:
    seen: dict[str, object] = {}

    def handle(req: httpx.Request) -> httpx.Response:
        seen.update(json.loads(req.content))
        seen["path"] = req.url.path
        return httpx.Response(
            200,
            json={
                "model": "qwen-test",
                "message": {"role": "assistant", "content": "Key idea: gears."},
                "prompt_eval_count": 12,
                "eval_count": 5,
            },
        )

    out = await _provider(httpx.MockTransport(handle)).generate(
        system="be a coach", turns=[ChatTurn(role="user", content="why?")], max_tokens=50
    )
    assert out.text == "Key idea: gears." and out.input_tokens == 12 and out.output_tokens == 5
    assert seen["path"] == "/api/chat" and seen["stream"] is False and seen["think"] is False
    assert seen["options"] == {"num_predict": 50}
    assert seen["messages"] == [
        {"role": "system", "content": "be a coach"},
        {"role": "user", "content": "why?"},
    ]


@pytest.mark.parametrize(
    "response",
    [httpx.Response(500, text="boom"), httpx.Response(200, json={"no": "message"})],
)
async def test_ollama_failures_become_llm_errors(response: httpx.Response) -> None:
    with pytest.raises(LLMError):
        await _provider(httpx.MockTransport(lambda _: response)).generate(
            system="s", turns=[], max_tokens=10
        )


def test_ollama_requires_a_model() -> None:
    with pytest.raises(ValueError, match="OLLAMA_MODEL"):
        Settings(llm_provider="ollama", ollama_model="")


def test_ollama_auth_header_only_when_key_set() -> None:
    with_key = OllamaProvider(Settings(llm_provider="ollama", ollama_model="m", ollama_api_key="k"))
    without = OllamaProvider(Settings(llm_provider="ollama", ollama_model="m"))
    assert with_key._client.headers["authorization"] == "Bearer k"
    assert "authorization" not in without._client.headers
