# Spec: AI study assistant

| Id | Requirement | Verified by |
| --- | --- | --- |
| AI-1 | Premium-only, enforced server-side; denials logged | `test_ai_requires_premium_server_side` |
| AI-2 | Provider selectable (Claude default, OpenAI supported, fake for keyless); model from env | unit `test_provider_selection_defaults_to_fake`, `test_config_requires_model_env_for_real_llm` |
| AI-3 | Usage logged: provider, model, latency, tokens (if reported), premium, request id | `test_ai_answers_logs_usage_and_escalates` |
| AI-4 | "Ask a live expert" converts the conversation into a pre-filled task draft | `test_ai_answers_logs_usage_and_escalates`, E2E |
| AI-5 | AI chats are private to their owner | `test_ai_chats_are_private` |
| AI-6 | Coaching system prompt: guide, don't produce graded submissions | `services/ai.py` `SYSTEM_PROMPT` (review item) |
