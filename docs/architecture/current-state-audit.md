# Current-state audit

## Audit 1 — 2026-10-25 (repository discovery)

**Evidence:** `https://github.com/as4584/StudyHelp` was empty (GitHub API: "Git Repository
is empty", no commits); `C:\Users\AlexS\Projects\global-study-help-tutor` did not exist.
There was no existing code, tests, Docker, docs or env examples to preserve or reconcile.
Inputs were the client's two PDFs (Developer Brief/RFP, Master Strategy) and the
Autonomous Delivery Directive.

**Environment findings**

| Finding | Impact | Resolution |
| --- | --- | --- |
| Docker Desktop + Supabase CLI (npx) available | Real Postgres/Auth/Realtime/Storage locally and in CI | `infra/` local stack |
| `supabase gen signing-key` fails if the configured key file is absent | Can't enable ES256 locally via CLI | `scripts/gen_signing_key.py` writes the JWK |
| Windows Application Control blocks SQLAlchemy's unsigned Cython DLL | API can't import on the dev box | pure-Python fallback on win32 only (`app/__init__.py`) |
| asyncpg rejects multi-statement prepared SQL | Migrations with DDL scripts failed | migrations run scripts via the raw driver connection |
| No Stripe, Anthropic/OpenAI or DeepL keys | Third-party calls can't run for real | explicit fake adapters (labelled), real adapters implemented and unit-covered |
| gitleaks `dir` mode flags gitignored local env/build cache | False alarms, nearly masked real results | scan = full history + working-tree diff |

**Conflicting assumptions resolved**

- RFP suggests "Node.js/Firebase backend"; Alex's design doc fixes **FastAPI + Supabase**.
  Resolution: FastAPI + Supabase (newer, owner-authoritative).
- RFP says "escrow"; directive forbids calling it legal escrow and forbids manual-capture
  holds. Resolution: separate charges and transfers with a platform ledger (payments.md).
- RFP names an "OpenAI widget"; design default is Claude. Resolution: provider abstraction,
  both implemented, model ids from env.

## Audit 2 — after Milestones 1–7 (see `sprints/completed/`)

Built and verified; open items, prioritized:

1. **[external] Provider keys** — Stripe test keys (+ Connect enabled, premium Price id,
   webhook secret), Anthropic or OpenAI key + model id, DeepL key. Until then the demo runs
   labelled fake adapters.
2. **[external] Demo hosting** — Supabase cloud project, Vercel project, API container behind
   the Cloudflare tunnel. Requires approval (paid resources / DNS).
3. **[product] Video sessions** (Twilio/Agora + whiteboard) — not built; Phase 1b.
4. **[payments] Deferred tip transfers** have no retry job if a tutor onboards later.
5. **[payments] Real Stripe end-to-end** (Checkout redirect + `stripe listen`) not yet
   exercised; the signature/idempotency paths are tested with Stripe's own verifier.
6. **[ops] Rate limiting** on auth-adjacent and AI endpoints is not implemented.
7. **[business] Payment-provider category acceptance and payout-country coverage** — client
   verification items, not engineering decisions.
