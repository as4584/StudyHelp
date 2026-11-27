# Authentication & authorization

**Supabase Auth creates the JWT. FastAPI verifies it and controls the application.**

## Verification (`api/app/security/jwt.py`)

Verified against Supabase docs (JWT signing keys / JWKS) on 2026-10-25:
JWKS at `<SUPABASE_URL>/auth/v1/.well-known/jwks.json`, issuer `<SUPABASE_URL>/auth/v1`,
audience `authenticated`, asymmetric ES256/RS256 keys. The local stack is configured with an
ES256 signing key (`infra/supabase/config.toml` → `signing_keys_path`), so local tokens match
production behaviour.

`TokenVerifier.verify` rejects (→ 401): missing/garbled tokens, unknown `kid`, any `HS*`
algorithm (no shared-secret or alg-confusion path), bad signature, wrong `iss`/`aud`,
missing/expired `exp`, missing `sub`/`iat`, and non-session tokens (`role != authenticated`,
i.e. anon/service keys). JWKS is cached and refetched on unknown `kid` (key rotation).

## Current user (`api/app/api/dependencies.py`)

`token → sub → profiles row (DB) → is_active? → role`. Nothing security-relevant comes from
claims: role, tutor approval, suspension, premium (subscriptions table) and payout
eligibility are read from Postgres on every request, so admin actions take effect immediately
on still-valid tokens.

- No profile → 403 "Onboarding required"; `POST /me/onboard` creates it with `id = sub`.
  Self-onboarding may only choose `student` or `tutor`; `admin` is seeded/operational only.
- Suspended → 403 on every endpoint.
- Guards: `StudentDep`, `TutorDep`, `AdminDep`. Object-level checks live in services
  (ownership/participation), returning 404 rather than 403 for objects you can't see.

## Browser session

`@supabase/ssr` `createBrowserClient` keeps the session in cookies (not `localStorage`).
The access token is sent to FastAPI as a bearer token; CORS allows only configured origins
and no credentials.

## Bot check on sign-up (Cloudflare Turnstile)

Sign-up itself goes from the browser straight to Supabase Auth, so the gate we control is
`POST /me/onboard`: no profile means no use of the app, and it requires a single-use Turnstile
token that `app/services/bot_check.py` verifies with Cloudflare (fail closed). The sign-up form
also passes its own token to `supabase.auth.signUp` as `captchaToken`, so turning on Supabase
Auth's captcha (provider Turnstile, same secret) also stops scripted account creation itself.

- `TURNSTILE_SECRET_KEY` (API, server-only) and `NEXT_PUBLIC_TURNSTILE_SITE_KEY` (web).
- Unset, both fall back to Cloudflare's published always-pass test keys (local runs, CI and
  the demo). `ENVIRONMENT=production` refuses to start without a real secret.
- Supabase captcha also gates sign-in and password reset. Add the widget to `/login` (whose
  demo password-restore retry signs in twice, so it needs two tokens) **before** turning that
  setting on.

## Tests

`api/tests/integration/test_auth.py` (no token, malformed, tampered payload, foreign key with
the trusted `kid`, expired, wrong aud/iss, missing exp, HS256 confusion, service-role token,
suspension, role guards, ignored role claims) and `test_rls.py` (DB-level isolation).
