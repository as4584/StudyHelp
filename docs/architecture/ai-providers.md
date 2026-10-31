# AI & translation providers

## LLM (`api/app/providers/llm/`)

`LLMProvider.generate(system, turns, max_tokens) -> LLMResult(text, model, input_tokens,
output_tokens)` with `ClaudeProvider` (Anthropic Messages API), `OpenAIProvider` (Chat
Completions; the client RFP names OpenAI) and `FakeLLMProvider`.

```
LLM_PROVIDER=anthropic|openai|fake
ANTHROPIC_MODEL=<model id>   OPENAI_MODEL=<model id>   LLM_MAX_TOKENS=800
```

Model ids are configuration; config refuses a real provider without its key and model.
The system prompt (`services/ai.py`) coaches: explain, ask guiding questions, worked examples
of similar problems, no submission-ready graded answers, suggest a live expert when stuck.

- **Premium gate is server-side** (`is_premium` from `subscriptions`). Denials are logged.
- **Usage** (`ai_usage`): user, chat, provider, model, status ok/error/denied, latency, token
  counts as reported by the provider (null when not reported — no invented costs), premium,
  request id.
- **Escalation** (`POST /ai/chats/{id}/escalate`) turns the owner's own questions into a task
  draft; the client pre-fills the request form and the student sets the budget.
- AI chats are owner-only (404 for anyone else, including admins via this API).

## Translation (`api/app/providers/translation/`)

`TranslationProvider.translate(text, source, target)` with `DeepLProvider`, `GoogleProvider`
and `FakeTranslationProvider` (labelled `[EN→ES] …`, supports a forced-failure marker for
tests). Any provider error raises `TranslationError`; chat stores `status=failed` and keeps the
original. Timeout: `TRANSLATION_TIMEOUT_S` (5 s). One configured provider is sufficient.

## Ollama (self-hosted open model)

`LLM_PROVIDER=ollama`, `OLLAMA_MODEL=qwen3:8b`, `OLLAMA_BASE_URL` (default `http://127.0.0.1:11434`),
optional `OLLAMA_API_KEY` (bearer, for an auth proxy). Uses `/api/chat` non-streaming with
`think=false`. Measured on the dev workstation (RTX 5070 Ti, 16 GB): `qwen3:8b` answers a full
structured tutor reply in ~2–4 s; `qwen3.6:27b` (17.7 GB) spills to CPU at ~1 tok/s — too slow
for interactive use. Models decorate section labels (`**Key idea:**`, `### Hint:`); the web
answer parser normalizes those. Reaching a workstation Ollama from the hosted demo requires a
public authenticated endpoint — an infrastructure change that needs human approval.
