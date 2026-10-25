# Spec: Chat, translation & files

| Id | Requirement | Verified by |
| --- | --- | --- |
| CHAT-1 | A conversation exists per hired task; only the student and hired tutor can read/write | `test_outsiders_cannot_read_or_write_chat`, `test_conversations_and_messages_participant_only` |
| CHAT-2 | Messages are auto-translated into the recipient's preferred language | `test_translated_chat_both_directions`, E2E EN↔ES |
| CHAT-3 | Translation failure never loses the original; UI shows original + notice | `test_translation_failure_keeps_original` |
| CHAT-4 | Same-language participants skip translation | `test_same_language_skips_translation` |
| CHAT-5 | New messages appear without reload (Realtime signal + poll fallback) | E2E (tutor sees student reply without manual refresh) |
| FILE-1 | Rubrics/deliverables/qualifications live in private buckets via signed URLs | `test_task_files_are_private`, `test_tutor_documents_private` |
| FILE-2 | Paths are server-chosen; filenames sanitized | `test_task_files_are_private` (`../../etc/passwd` → 422) |

Deferred: in-app video/whiteboard (Twilio/Agora) — Phase 1b; the demo omits a video button
rather than faking one.
