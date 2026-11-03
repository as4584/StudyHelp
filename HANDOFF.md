# HANDOFF — read this first if you are picking up this project

Written 2026-11-03 for whoever continues the work: a person, Codex, ChatGPT or another
Claude session. It covers the current state, how to run and deploy, what's open, and the
traps already found. The rules for coding agents are in [AGENTS.md](AGENTS.md). Architecture is
in [docs/architecture/system.md](docs/architecture/system.md).

---

## 1. What this is

A tutoring marketplace:
- Students post a request, tutors bid, and the student hires one.
- The payment is **held** until the student confirms delivery, then released minus a **25%** fee.
- Tips go 100% to the tutor.
- Chat is auto-translated.
- There is an AI study assistant: 5 free questions a day, or Premium at **$9.99/month**.
- Admins approve tutors (a minors-safety gate), handle disputes and see revenue.

The target launch is **Nov 30, 2026**. The client owns the production domain and its
DNS/mail. **This repo is PUBLIC:** client contact details, commercial terms and client
communication notes live in a private file outside git (ask Alex for
`gsht-private-notes.md`). Never commit them.

## 2. Live environments

| What | Where | Notes |
|---|---|---|
| Web (demo) | https://studyhelp-web.vercel.app | Vercel team `studyhelp`, project `studyhelp-web` |
| API (demo) | https://studyhelp-api.vercel.app (`/health`, `/ready`) | project `studyhelp-api`, Python serverless |
| Database/Auth | Supabase project `yofnnebtdkvsdswuueom` ("studyhelp-demo") | API connects as role `studyhelp_api` via the pooler |
| Video (LiveKit) | `wss://rtc.lexmakesit.com`, TURN `turn.lexmakesit.com` | **Self-hosted on Alex's home PC.** See §5 |

**Deploys:**
- Both Vercel projects are deployed **from the CLI, not from git**:
  `cd api && npx vercel deploy --prod --yes --scope studyhelp` (same for `web`).
- Deploy from a clean checkout of `main`. The `.vercel/` folder links each sub-folder to its
  project.
- **Never deploy from the repo root.** It once created a stray project and uploaded `.env`
  files. That project was deleted and the keys rotated, and `.vercelignore` files now block it.

**Demo logins** (password `demo-password-123`, demo only):
- `student@demo.gsht` (Maya)
- `tutor@demo.gsht` (Diego, Spanish)
- `tutor2@demo.gsht` (Aisha)
- `applicant@demo.gsht` (Ravi, should be **pending**)
- `admin@demo.gsht`

Providers on the demo:
- payments, LLM, translation and storage are **fake** (labelled demo adapters)
- video is **livekit** (real)

## 3. Branches and PRs (state on 2026-11-03)

`main` is protected by habit: **never push to main directly.** Work on a branch, open a PR,
and merge only when CI (`scripts/check` full gate + API image) is green.

| Branch / PR | What | State |
|---|---|---|
| PR #8 `fix-video-grant` | Migration 0005: grants `studyhelp_api` access to `video_sessions` + future tables | CI green, **not merged**. Already **applied to the live DB** (live schema = 0005) |
| PR #9 `e2e-hosted` | `DATABASE_POOL=none` (NullPool) fixes 500s / "Loading…" with 2+ users; video e2e runs against a live server | CI green, **not merged, not deployed** |
| `client-feedback-2` | Includes #8 + #9, plus client feedback round 2 (§4) | Pushed, PR not opened yet |
| `security-hardening` | Edge container limits, HAProxy flood guard, `infra/edge/harden-host.ps1`, `.vercelignore` | Pushed, PR not opened yet |

Suggested order: open a PR for `client-feedback-2`, which contains #8 and #9. Then merge
`security-hardening`.

## 4. Client feedback round 2 (Nov 3) — status

1. **Prices $15–$25.** Done on `client-feedback-2`.
   - The API rejects budgets and bids outside the range (`PRICE_MIN_CENTS`/`PRICE_MAX_CENTS`).
   - Form presets are 15/20/25; the homepage wording and example were fixed.
2. **Daily AI limit + $9.99 visible.**
   - The UI already existed (`web/src/components/ai-quota.tsx`). It was hidden because the
     demo student had been upgraded to Premium by test runs.
   - Added a homepage pricing line, and the premium demo checkout now shows $9.99/month.
   - **Needs a demo reseed** so Maya is free again.
3. **Tutor approval gate.** The code works: pending tutors cannot bid (tested).
   - On the live demo, an admin approved Ravi on 2026-10-28.
   - **Needs a demo reseed** so Ravi is pending again.
4. **Demo labels on every payment screen.** Done: `DemoPaymentNote` on the pay page, tips and the
   premium upgrade.
5. **Slowness, "Loading…" and pages not loading.**
   - Root cause: the DB connection pool ran out (EMAXCONNSESSION, see PR #9).
   - Deploy: set Vercel env `DATABASE_POOL=none` on `studyhelp-api`, then redeploy.
   - Cold starts on Vercel Python also add a few seconds.
6. **Duplicate demo data.** Caused by end-to-end tests run against the hosted demo.
   - Fix: **reseed the hosted DB** (`api/scripts/seed.py --reset` pointed at the demo DB).
   - The reseed is destructive to demo data, so get Alex's OK first.
   - Rule from now on: **never run the Playwright suite against the hosted demo.** Use local
     (`scripts/check`) or a separate project.
7. **Client's video question.** Video is **real**, not a shell. It runs on the self-hosted
   LiveKit server with screen sharing, and was tested from a phone on cellular, direct and relay.

**Also found (not yet fixed):** sign-up on the hosted demo fails with "email rate limit exceeded".
- Cause: Supabase's built-in email only allows ~2 emails/hour, to team members only.
- **Alex must choose:**
  - (A) turn off email confirmation on the demo, or
  - (B) add free SMTP: Gmail app password now, the client's Zoho on his domain at launch.
- Put the SMTP credentials in Doppler. **Never in git.**

## 5. Video server (self-hosted) — how it works

Everything is in `infra/edge/`. Docs: [docs/ops/video.md](docs/ops/video.md); every router,
DNS or firewall change, with undo steps: [docs/ops/edge-changes.md](docs/ops/edge-changes.md).

- **Runs on:** Alex's Windows 11 PC (Docker Desktop), wired to a TP-Link ER605 router.
  Public IP `24.146.145.204`; the PC is at `192.168.0.137` (DHCP reservation).
- **Router forwards:** TCP 80, TCP 443, TCP 7881, UDP 7882, UDP 3478 → the PC. Nothing else.
- **Containers:**
  - `haproxy` splits 443 by SNI: `turn.*` goes to LiveKit TURN/TLS, everything else to Caddy.
  - `caddy` handles TLS certificates (TLS-ALPN-01 only, **because the ISP blocks inbound port 80**).
  - `livekit` uses UDP mux 7882, TCP 7881 and TURN 3478/5349.
- **Start:** `docker compose -f infra/edge/docker-compose.yml up -d`. The config is rendered by
  `infra/edge/render.py` from `.env`, which is gitignored.
- **Keys:** `LIVEKIT_KEYS` in `infra/edge/.env`. The live API holds the same pair as Vercel env
  `LIVEKIT_API_KEY`/`LIVEKIT_API_SECRET`. Rotated 2026-11-01.
- **Known gotchas:**
  - If LiveKit starts with no network, run `docker compose up -d --force-recreate livekit`.
  - Restart LiveKit after Caddy renews the TURN certificate (about every 60 days).
  - Docker Desktop hides client IPs: everyone appears as `172.25.0.1`. Per-IP rate limits and
    bans are therefore impossible. Fix idea: move the edge into WSL Docker with mirrored networking.
  - Capacity is about **4 simultaneous 1:1 calls** (~32 Mbps home upload).
- **Proof test:** `PROOF_EDGE=1 scripts/video-proof` (local API + web against the public edge).

## 6. Secrets — where they live (names only)

- **Doppler** is the secrets manager. Its CLI is broken on Alex's PC, so use the REST API
  `https://api.doppler.com/v3/configs/config/secrets`. Report key names only.
  - `lexmakesit/prd`: `ROUTER_USERNAME`, `ROUTER_PASSWORD`
  - `api-keys/prd`: `CLOUDFLARE_DNS_EDIT_TOKEN` (zone lexmakesit.com only)
- **Vercel env** (studyhelp-api, production) — key names only:
  - `DATABASE_URL`
  - Supabase keys
  - `VIDEO_ENABLED`, `VIDEO_PROVIDER`
  - `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `LIVEKIT_URL`, `LIVEKIT_PUBLIC_URL`
  - provider selectors
- **Stripe:** TEST keys only. The config refuses anything that isn't `sk_test_`/`rk_test_`.
  - The client is setting up his Stripe account. He will invite Alex as a Developer.
  - Needed: `STRIPE_SECRET_KEY` (test), `STRIPE_WEBHOOK_SECRET`, `STRIPE_PREMIUM_PRICE_ID`
    ($9.99/month price), then `PAYMENTS_PROVIDER=stripe`.
- **No paid API keys** (Alex's rule). The free LLM is self-hosted Ollama via `LLM_PROVIDER=ollama`.
  For translation, use the DeepL free tier or Ollama.

## 7. Hard rules (from Alex and the delivery directive)

- **Never push to `main`.** Branch, open a PR, wait for green CI, merge. Tag versions.
- **Needs Alex's explicit OK:**
  - production deploys
  - live DB migrations or reseeds
  - deleting anything
  - credential rotation
  - fee or price policy changes
  - anything involving real money
- **Never touch the client's domain, DNS or mail records.** He adds DNS records himself.
- Never commit secrets (`scripts/security` runs gitleaks). Never use live Stripe keys.
- Don't weaken auth, RLS or payment tests to get green.
- Positioning: tutoring and explanations, not doing students' work (honour-code pledge on every request).

## 8. How to run and verify locally

See [AGENTS.md](AGENTS.md) for the full setup. Short version: Supabase CLI local stack + `uv` for
the API + `npm` for the web.

```bash
scripts/check            # full gate: ruff, mypy, pytest, alembic round-trip, eslint, tsc, build, Playwright, gitleaks
scripts/check --fast     # quicker; lists what it skipped
```

**Windows notes:**
- App Control blocks `.exe` shims, so use `python -m alembic`, `python -m pytest` and so on.
- PowerShell 5.1 has no `&&`.
- In bash, use forward slashes in paths.

## 9. Next steps (priority order)

1. Merge `client-feedback-2` (contains #8, #9). Set `DATABASE_POOL=none`, then deploy the API and web.
2. Reseed the hosted demo (with Alex's OK). Check that Maya is free, Ravi is pending, and there are no duplicates.
3. Fix hosted sign-up email: Alex picks option A or B (§4).
4. Re-test the whole loop by hand on the demo: post → bid → hire → pay → chat → deliver →
   release → review → tip, plus a video call. Use two devices.
5. Send the client the answers (see the private notes for what to say).
6. Stripe test mode, once the client's invite arrives (§6).
7. Security work:
   - merge `security-hardening`
   - Alex runs `infra/edge/harden-host.ps1` as Administrator
   - full app audit (auth on every route, input validation, dependency scans)
8. Real translation (free: DeepL free tier or Ollama). Custom domain on the client's DNS at launch.
