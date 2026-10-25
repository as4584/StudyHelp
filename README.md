# Global Study Help Tutor — demo MVP

A tutoring marketplace: students get instant AI study help and escalate to vetted global
tutors; payments are held by the platform until delivery; chat is auto-translated.

- **Web:** Next.js 15 (App Router, strict TS, Tailwind), mobile-first PWA — `web/`
- **API:** FastAPI, SQLAlchemy 2 (async) + Alembic — `api/`
- **Infra:** Supabase (Postgres, Auth, Realtime, Storage), Stripe Connect (test mode)

Start with **[AGENTS.md](AGENTS.md)** (contract + local setup), then
[docs/architecture/system.md](docs/architecture/system.md) and the
[demo script](docs/specs/demo.md).

```bash
scripts/check          # the one command that says whether the repo is healthy
```

Status and evidence: [sprints/completed/](sprints/completed/) ·
open items: [docs/architecture/current-state-audit.md](docs/architecture/current-state-audit.md).
