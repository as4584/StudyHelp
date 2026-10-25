"""LLM providers behind one protocol. Model ids are configuration, never hard-coded."""

from dataclasses import dataclass
from functools import lru_cache
from typing import Any, Literal, Protocol, cast

from app.core.config import Settings, get_settings


@dataclass(frozen=True)
class ChatTurn:
    role: Literal["user", "assistant"]
    content: str


@dataclass(frozen=True)
class LLMResult:
    text: str
    model: str
    input_tokens: int | None
    output_tokens: int | None


class LLMError(Exception):
    pass


class LLMProvider(Protocol):
    name: str

    async def generate(
        self, *, system: str, turns: list[ChatTurn], max_tokens: int
    ) -> LLMResult: ...


class ClaudeProvider:
    name = "anthropic"

    def __init__(self, settings: Settings) -> None:
        import anthropic

        self._client = anthropic.AsyncAnthropic(api_key=settings.anthropic_api_key, timeout=30)
        self._model = settings.anthropic_model
        self._errors: tuple[type[Exception], ...] = (anthropic.APIError,)

    async def generate(self, *, system: str, turns: list[ChatTurn], max_tokens: int) -> LLMResult:
        try:
            msg = await self._client.messages.create(
                model=self._model,
                max_tokens=max_tokens,
                system=system,
                messages=cast(Any, [{"role": t.role, "content": t.content} for t in turns]),
            )
        except self._errors as exc:
            raise LLMError(f"anthropic: {type(exc).__name__}") from exc
        text = "".join(getattr(b, "text", "") for b in msg.content)
        return LLMResult(
            text=text,
            model=msg.model,
            input_tokens=msg.usage.input_tokens,
            output_tokens=msg.usage.output_tokens,
        )


class OpenAIProvider:
    name = "openai"

    def __init__(self, settings: Settings) -> None:
        import openai

        self._client = openai.AsyncOpenAI(api_key=settings.openai_api_key, timeout=30)
        self._model = settings.openai_model
        self._errors: tuple[type[Exception], ...] = (openai.OpenAIError,)

    async def generate(self, *, system: str, turns: list[ChatTurn], max_tokens: int) -> LLMResult:
        try:
            resp = await self._client.chat.completions.create(
                model=self._model,
                max_completion_tokens=max_tokens,
                messages=cast(
                    Any,
                    [
                        {"role": "system", "content": system},
                        *({"role": t.role, "content": t.content} for t in turns),
                    ],
                ),
            )
        except self._errors as exc:
            raise LLMError(f"openai: {type(exc).__name__}") from exc
        usage = resp.usage
        return LLMResult(
            text=resp.choices[0].message.content or "",
            model=resp.model,
            input_tokens=usage.prompt_tokens if usage else None,
            output_tokens=usage.completion_tokens if usage else None,
        )


class FakeLLMProvider:
    """Deterministic, visibly-labelled adapter for tests and keyless demos."""

    name = "fake"

    async def generate(self, *, system: str, turns: list[ChatTurn], max_tokens: int) -> LLMResult:
        question = (turns[-1].content if turns else "").strip()[:200]
        # Uses the same section labels the real system prompt asks for, so the structured
        # answer UI renders identically with or without a provider key.
        text = (
            "[Demo AI — no provider key configured] "
            "Key idea: Name the concept first — the method follows from it.\n"
            "Explanation: Let's work through this together. You asked: "
            f"“{question}”. Start by naming the **key idea** the question is really about, "
            "then separate what you are given from what you are asked to find.\n"
            "Example: In a similar problem, write the givens in one column and the unknown in "
            "another — the relationship between them is usually the concept to apply.\n"
            "Try this: Write one line: “I am given ___ and I need ___.”\n"
            "Hint: Try the very first step yourself and tell me exactly where it stops "
            "making sense.\n"
            "Check yourself: Can you explain the idea back in one sentence without notes?\n"
            "Common mistake: Jumping to a formula before deciding which concept applies.\n"
            "Still stuck? Tap “Ask a live expert” and a tutor gets this whole conversation."
        )
        return LLMResult(text=text, model="fake-tutor-1", input_tokens=None, output_tokens=None)


@lru_cache
def get_llm_provider() -> LLMProvider:
    s = get_settings()
    if s.llm_provider == "anthropic":
        return ClaudeProvider(s)
    if s.llm_provider == "openai":
        return OpenAIProvider(s)
    return FakeLLMProvider()
