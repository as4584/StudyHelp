# Sprints 01–07 — Foundation → Demo polish (greenfield build, 2026-10-25)

Because the repository started empty, Milestones 1–7 were delivered as consecutive bounded
slices within one session, each verified before the next. This single archive records them
with evidence; future work uses one file per sprint (`sprints/TEMPLATE.md`).

Governing specs: `docs/specs/{marketplace,payments,chat,ai-assistant,admin,demo}.md`.

| # | Milestone | Status | Evidence |
| --- | --- | --- | --- |
| 1 | Foundation: monorepo, FastAPI, SQLAlchemy/Alembic baseline + RLS, Supabase JWKS auth, role guards, typed OpenAPI client, seed, gate, CI | DONE | auth suite (20 tests), migration round-trip, `scripts/check`, CI workflow |
| 2 | Marketplace: tasks, bids, hire, deliver, review, ratings | DONE | `test_marketplace.py` (14 tests) + E2E |
| 3 | Payments: Checkout, webhook ledger, fee, release/refund, Connect onboarding, tips, premium, admin revenue | DONE (fake gateway) / UNVERIFIED against live Stripe test API | `test_payments.py` (17 tests) incl. Stripe's own signature verifier + E2E |
| 4 | Chat + translation + private files | DONE (fake translator) | `test_chat_ai_files.py`, `test_rls.py`, E2E EN↔ES |
| 5 | AI assistant: premium gate, provider abstraction, usage log, escalation | DONE (fake LLM) / Claude+OpenAI adapters UNVERIFIED without keys | unit + integration + E2E |
| 6 | Admin: approvals, users, disputes, payments, revenue, audit log | DONE | integration + E2E approval |
| 7 | Demo polish: mobile-first UI, PWA, landing, seeded accounts, demo script, full E2E | DONE locally / deployment BLOCKED (approval + accounts) | E2E desktop + Pixel 7 |

## Verification (actual runs)

- `scripts/check` (full) on Windows dev box → exit 0:
  `FULL CHECK PASSED: ruff format ruff lint mypy env validation pytest openapi drift prettier
  eslint tsc secret scan next build playwright e2e` — pytest `102 passed`, Playwright `2 passed`
  (desktop + mobile) against the built web artifact on :3100 and API on :8100.
- API image: `docker build` → `/health` reports baked `git_sha`, runs as uid 10001,
  `ENVIRONMENT=production` with fake adapters is refused.
- RLS mutation check: replacing `tasks_visible` with `using (true)` makes
  `test_students_cannot_read_each_others_tasks` fail (`assert 1 == 0`) — the test detects
  a weakened policy.
- `scripts/security`: gitleaks over full history + working tree → no leaks.

## Adversarial review → fixes

| Finding | Severity | Fix |
| --- | --- | --- |
| Student could cancel a *hired* task while a Checkout was open; the later webhook would fail forever (InvalidState on retry) | High (payments) | removed `hired → cancelled`; test `test_hired_task_cannot_be_cancelled` |
| Suspended tutors with approved status were still hireable | Medium (authz) | `tutor_is_approved` requires `is_active`; test `test_suspended_tutor_cannot_be_hired` |
| Chrome's `scrollIntoView` now returns a Promise → React treated it as an effect cleanup → task page crashed | High (demo) | effects are blocks returning nothing; caught by E2E |
| E2E `isVisible()` branch raced page load (premium upgrade skipped on fresh seed) | Medium (test validity) | wait for `a.or(b)` before branching; action timeouts |
| Secret scan in `dir` mode flagged gitignored local files; a shell pipe hid the nonzero exit and a push proceeded | Medium (process) | verified history clean (`no leaks found`); scan now history + working tree; never pipe gate output before `&&` |
| Self-onboarding as `admin` | checked | schema `Literal["student","tutor"]` → 422 (test) |
| Token role claims (`app_metadata.role=admin`) | checked | ignored; DB role used (test) |
| HS256/alg-confusion, foreign key with trusted `kid` | checked | rejected (tests) |
| Direct DB writes with a user JWT (PostgREST path) | checked | `permission denied` for every write and for internal tables (tests) |

## Known limitations / deferred

- Real Stripe/LLM/DeepL calls not exercised (no keys). Adapters implemented to current docs.
- Tip transfers deferred when tutor not onboarded have no retry job.
- No rate limiting; no video/whiteboard (Phase 1b); Capacitor wrapper (Phase 2).
- Supabase cloud project, Vercel and tunnel deployment pending approval.
