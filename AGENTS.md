# AGENTS.md — standing contract for coding agents

Global Study Help Tutor: a tutoring marketplace (students, vetted global tutors, admin) with
an AI study assistant, auto-translated chat and platform-held payments. This file is the
entry point for any agent. The repository — not chat history — is the memory.

## Read order

1. `AGENTS.md` (this file)
2. `docs/architecture/system.md`, then the topic doc you are touching
   (`auth.md`, `payments.md`, `realtime.md`, `storage.md`, `ai-providers.md`)
3. The governing spec in `docs/specs/` and the active sprint in `sprints/active/`
4. The live code and its tests

`docs/architecture/current-state-audit.md` records the latest audit and open findings.

## Architecture (non-negotiable)

- **Next.js (`web/`) is UI only.** No business rules, prices, fees or authorization in React.
- **FastAPI (`api/`) is the trusted backend boundary.** Every business-critical mutation —
  tasks, bids, hiring, payments, releases, refunds, admin actions, messages — goes through it.
- **PostgreSQL is authoritative application state.** Supabase provides managed Postgres,
  Auth, Realtime and Storage; it is infrastructure, not the backend.
- **SQLAlchemy + Alembic own the schema.** Every schema/RLS change is an Alembic migration.
  Never `create_all()`, never click schema changes in the Supabase dashboard.
- **Stripe is authoritative for payment/subscription/transfer state.** We mirror it from
  signed webhooks into an append-only ledger (`payment_events`).
- **External AI/translation/storage/payment providers sit behind protocols** in
  `api/app/providers/`. Model ids and provider choice are configuration.

## Security — never

- trust a client-supplied `user_id`, role, price, fee or status
- read roles, approval, suspension, premium or payout state from token claims (always the DB)
- expose the Supabase secret/service key, Stripe secrets or provider keys to the browser
- bypass FastAPI for payment/admin state changes, or treat frontend state as proof of payment
- store long-lived credentials in `localStorage` (Supabase session lives in cookies)
- commit secrets (`scripts/security` must pass), or use live Stripe keys (config refuses them)
- weaken or delete authorization/RLS/payment tests to get a green build

## Product guardrails

Tutoring, explanation, guidance and feedback only. No features for impersonation, exam
cheating, sharing school-portal credentials or submitting tutor work as the student's own.
Students upload screenshots of rubrics; tutors deliver walkthroughs and practice material.
Do not assert payment-provider policy conclusions; record them as client verification items.

## Process

- Substantial work (auth, payments, security, schema, deployment, role/policy, major
  features): **AUDIT → PLAN (sprint file) → EXECUTE → VERIFY → ADVERSARIAL REVIEW → FIX →
  VERIFY AGAIN → ARCHIVE** using `sprints/TEMPLATE.md`.
- Tiny, low-risk changes: a short Change Note (`sprints/CHANGE_NOTE_TEMPLATE.md`).
- Implement only the active sprint's scope. No drive-by refactors. Explain unexpected diffs.
- Commit atomically and often; never force-push or rewrite shared history.

## Verification — the only definition of done

```bash
scripts/check          # full gate: lint, types, env, pytest (auth/RLS/payments/migrations),
                       # OpenAPI drift, web lint/types, secret scan, next build, Playwright E2E
scripts/check --fast   # partial; prints what it SKIPPED. Never report it as full verification.
```

Code compiling, a plausible UI, an HTTP 200 or an AI's opinion is not evidence. Sprint
status is `DONE` only with passing gate output recorded in the sprint file; otherwise
`UNVERIFIED` or `BLOCKED` with the exact blocker.

## Local environment

```bash
cd infra && npx supabase@2.122.0 start      # Postgres/Auth/Realtime/Storage in Docker
python scripts/gen_signing_key.py            # first time only: ES256 key (gitignored)
scripts/local-env                            # writes api/.env and web/.env.local
cd api && uv sync && uv run alembic upgrade head && uv run python scripts/seed.py --reset
uv run uvicorn app.main:app --port 8000      # API
cd web && npm ci && npm run dev              # web on :3000
```

Windows note: the dev workstation's Application Control blocks SQLAlchemy's compiled
extension; `app/__init__.py` selects the pure-Python fallback on win32 only.

## Human approval required

Production deploys, DNS changes, live payment credentials or any real-money action,
destructive production migrations, fee-policy or compliance-positioning changes, rotating
real credentials, and creating paid cloud resources.
