# System architecture

```
                 Next.js (web/)  — UI only, mobile-first PWA
                        │  HTTPS, Authorization: Bearer <Supabase access token>
                        ▼
                 FastAPI (api/)  — trusted boundary: authn, authz, business rules
        ┌───────────────┼──────────────────┬───────────────────┐
        ▼               ▼                  ▼                   ▼
   PostgreSQL      Stripe Connect     LLM provider        Translation provider
   (Supabase)      + Billing          (Claude/OpenAI)     (DeepL/Google)
   SQLAlchemy/     (test mode)
   Alembic
        │
   Supabase Auth (issues JWTs) · Realtime (change signals) · Storage (private buckets)
```

| Concern | Owner | Notes |
| --- | --- | --- |
| Identity | Supabase Auth | ES256 access tokens; FastAPI verifies via JWKS ([auth.md](auth.md)) |
| Authorization | FastAPI services | DB-backed role/approval/suspension checks; RLS is defense in depth |
| Schema | Alembic | `api/alembic/versions/`; constraints + RLS + buckets in migrations |
| Money | Stripe + `payments`/`transfers`/`payment_events` | [payments.md](payments.md) |
| Chat | FastAPI writes; Realtime signals | [realtime.md](realtime.md) |
| Files | Supabase Storage, signed URLs from FastAPI | [storage.md](storage.md) |
| AI / translation | provider protocols | [ai-providers.md](ai-providers.md) |

## Code map

- `api/app/api/dependencies.py` — token → current profile → role guards
- `api/app/services/` — all business logic (`marketplace`, `payments`, `chat`, `ai`, `admin`,
  `fees`, `state`, `audit`)
- `api/app/routers/` — thin HTTP layer, schemas in `api/app/schemas/api.py`
- `api/app/providers/` — `payments/`, `llm/`, `translation/`, `storage/` (real + fake adapters)
- `web/src/lib/api.ts` — typed client; types generated from FastAPI OpenAPI
  (`web/openapi.json` → `web/src/lib/api-types.ts`, drift-checked by `scripts/check`)

## Task lifecycle

`open → hired → paid → delivered → completed`, with `paid|delivered → disputed →
completed|refunded` and `open → cancelled`. Transitions live in `api/app/services/state.py`.
`hired → cancelled` is deliberately disallowed: a Checkout may be in flight and its webhook
must always be able to land.

## Fake adapters

Each provider has an explicit fake used when keys are absent (tests, keyless demo).
Config refuses fakes when `ENVIRONMENT=production`. `/health` reports which adapters are live.

## Operations

- `GET /health` — identity: status, version, git SHA, environment, active providers
- `GET /ready` — DB reachable + Alembic revision (503 if not)
- Structured JSON logs with `x-request-id` correlation; tokens/secrets never logged
- See [operations.md](operations.md) for deploy, release verification and rollback
