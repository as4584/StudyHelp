# Chat & realtime

```
POST /conversations/{id}/messages
  → FastAPI verifies membership (student or hired tutor; admins excluded)
  → INSERT messages + COMMIT            (original is durable first)
  → translate to the other participant's preferred_language (if different)
  → INSERT message_translations(status ok|failed, provider, latency) + COMMIT
  → Supabase Realtime emits postgres_changes for both tables
  → subscribed clients refetch GET /conversations/{id}/messages from FastAPI
```

- Translation failure never loses the message: the original is shown with
  "Translation unavailable — showing original" (`status=failed`, `translated_body=null`,
  enforced by a DB check).
- Realtime is only a change **signal**; content is always read through FastAPI. Delivery of
  `postgres_changes` respects RLS on `messages`/`message_translations` (participants only), and
  those tables are added to the `supabase_realtime` publication in the baseline migration.
  The client also polls every 5 s as a fallback if the socket drops.
- Broadcast/Presence channels are not used. If added later, they must use
  `config: { private: true }` with RLS policies on `realtime.messages` (per Supabase Realtime
  Authorization docs).

Tests: `test_chat_ai_files.py` (both directions, failure-safe original, same-language skip,
outsider 404s) and `test_rls.py` (participant-only rows as the `authenticated` role).
