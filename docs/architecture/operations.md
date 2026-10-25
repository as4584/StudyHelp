# Operations: environments, release verification, rollback

## Environments

| Env | Web | API | Data | Adapters |
| --- | --- | --- | --- | --- |
| local | `next dev` :3000 | uvicorn :8000 | local Supabase (Docker, `infra/`) | fake payments/LLM/translation, real storage |
| CI | built artifact :3100 | uvicorn :8100 | local Supabase in the runner | same as local |
| demo | Vercel | Docker image behind Cloudflare tunnel (`api-gsht.lexmakesit.com`) | Supabase cloud project | Stripe **test** keys when provided; fakes otherwise |
| production | — | — | — | not configured; fakes refused by config |

## Commands

| Purpose | Command |
| --- | --- |
| Full gate | `scripts/check` |
| Partial gate | `scripts/check --fast` (prints SKIPPED list) |
| Env validation | `cd api && uv run python scripts/env_check.py` |
| Secret scan | `scripts/security` |
| Diagnostics | `scripts/diagnostics [api_url] [web_url]` |
| Release verification | `scripts/verify-release <api_url> <expected_git_sha>` |
| Seed demo data | `cd api && uv run python scripts/seed.py --reset` (refuses production) |

## Release flow (demo)

1. `scripts/check` green on `main` (CI job `check`) and the `api-image` job green.
2. Build the API image once: `docker build --build-arg GIT_SHA=$(git rev-parse HEAD) -t gsht-api:<sha> api`.
3. `alembic upgrade head` against the demo database (migrations are additive; review any
   downgrade before running it — destructive migrations need human approval).
4. Run the image with the demo env; deploy web to Vercel with `NEXT_PUBLIC_*` vars.
5. `scripts/verify-release https://api-gsht.lexmakesit.com <sha>` — checks `/health` identity,
   `/ready` schema revision, and that unauthenticated `/me` is 401.

Production deploys and DNS changes require explicit human approval (AGENTS.md).

## Rollback

- API: re-run the previous image tag (`gsht-api:<previous-sha>`), then `scripts/verify-release`
  with that sha. Schema is backward compatible within a release; only roll the DB back with
  `alembic downgrade <rev>` after reviewing the downgrade for data loss (approval required).
- Web: Vercel "Promote" the previous deployment.

## Observability

JSON logs to stdout with `request_id` (also returned as `x-request-id`). Event names:
`http.request` (latency), `auth.rejected`, `authz.denied`, `webhook.processed|duplicate|
payment_unmatched`, `stripe.call` (latency, ok), `translation.done|failed`, `llm.ok|failed`,
`tip.transfer_deferred`, `ready.db_unavailable`, `domain.provider_error`.
