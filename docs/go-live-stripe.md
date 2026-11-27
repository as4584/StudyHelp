# Going live: real Stripe payments and final policy texts

Two switches stand between the demo and launch: live Stripe keys, and the attorney's final
policy texts. Both are small, reviewed changes. Every step below needs Alex's explicit OK
(AGENTS.md: live keys, prod deploys and real money are human approval boundaries).

## What the site shows in each payments mode

The API reports `providers.payments_mode` on the public `/health` endpoint. It is worked out
from the configured key itself, never from a separate flag:

| `payments_mode` | Configuration | What the website shows |
|---|---|---|
| `demo` | `PAYMENTS_PROVIDER=fake` | The simulated "Test checkout" page, the "Demo mode" notes, and "Demo build — payments run in test mode" on the homepage |
| `test` | `PAYMENTS_PROVIDER=stripe` + `sk_test_…` key | Stripe's own checkout in test mode; the homepage says "Payments run in test mode" |
| `live` | `PAYMENTS_PROVIDER=stripe` + `sk_live_…` key | Nothing says demo or test |

The simulated checkout and payout pages only exist with the fake provider. With Stripe
configured, checkout goes to Stripe's hosted page.

## 1. Allow live keys (a switch, needs approval)

`api/app/core/config.py` refuses live keys unless `STRIPE_LIVE_MODE=true` is set, and that
switch is itself refused outside `ENVIRONMENT=production`, with a test key, or without
`STRIPE_PREMIUM_PRICE_ID`. Setting it is the human approval step: Alex sets it, nobody else.

## 2. API environment variables (production)

Set these on the API project in production. Names only; values come from the client's Stripe
account and go through Doppler. Use Bash `printf` with `vercel env update`, never a PowerShell
pipe (it adds a BOM).

| Variable | Value |
|---|---|
| `ENVIRONMENT` | `production` (today `demo`; see "Production switch checklist" below) |
| `STRIPE_LIVE_MODE` | `true` |
| `TURNSTILE_SECRET_KEY` | the real Turnstile secret; production refuses to start without one |
| `CORS_ORIGINS` | JSON list with exactly the public website origin(s) |
| `PAYMENTS_PROVIDER` | `stripe` |
| `STRIPE_SECRET_KEY` | live secret key (`sk_live_…`) |
| `STRIPE_WEBHOOK_SECRET` | signing secret (`whsec_…`) of the live webhook endpoint below |
| `STRIPE_PREMIUM_PRICE_ID` | live `price_…` for Premium ($9.99/month recurring) |
| `WEB_BASE_URL` | the public website origin, used for the checkout return and payout onboarding URLs |
| `PLATFORM_FEE_BPS` | unchanged unless the client approves a fee change (must stay 2000–3000) |

Stripe Connect must be turned on for the live account (Express accounts), because tutor
payouts use Connect transfers.

## 3. Live webhook endpoint

In the Stripe dashboard (live mode), go to Developers → Webhooks → Add endpoint:

- URL: `<API origin>/webhooks/stripe`
- Listen to events on your account **and on connected accounts** (`account.updated` comes from
  connected accounts)
- Events:
  - `checkout.session.completed`
  - `checkout.session.async_payment_succeeded`
  - `checkout.session.expired`
  - `customer.subscription.updated`
  - `customer.subscription.deleted`
  - `charge.refunded`
  - `account.updated`

Copy the endpoint's signing secret into `STRIPE_WEBHOOK_SECRET`, then redeploy the API.

## 4. Smoke test: one $1 live charge and refund

Run this right after the deploy, with a real card you control. Run the Cloudflare status
check before and after the deploy.

1. `GET <API origin>/health`: `providers.payments` is `stripe` and `providers.payments_mode`
   is `live`. The homepage no longer shows any demo or test line.
2. In the Stripe dashboard (live mode), create a **$1.00 Payment Link** (a one-off product).
   Pay it with your own card.
3. Check that the payment shows as succeeded in Stripe, and that the webhook endpoint shows a
   delivered `checkout.session.completed` with status 200 (the app ignores it because it
   belongs to no session, which is expected).
4. Refund it in full from the dashboard. Check that `charge.refunded` is delivered with a 200.
5. On the site, as a tutor test account, start payout onboarding and check that the live
   Stripe onboarding page opens. You don't need to finish it.
6. Delete the Payment Link. Write the result, with time and payment id, into the launch notes.

A full in-app session payment ($15 minimum) is the next step, once a real tutor has finished
payout onboarding. Release it to that tutor, or refund it through an admin dispute.

## Policy texts: draft → final

Each policy has one flag. When the attorney's final text arrives:

1. **Student policy / Terms** (`/policies/student` and `/terms`) and **Tutor agreement**
   (`/policies/tutor`): in `web/src/content/policies.ts`, paste the final text into that
   policy's `body` and update its `rules` if the signature checklist changed. Then set
   `final: true` and bump `version` (for example `final-2026-11-30`).
2. Make the same `version` change in `VERSIONS` in `api/app/services/policies.py`, and update
   `RULE_COUNTS` if the number of rules changed. Everyone is then asked to accept the new
   version.
3. **Privacy** (`/privacy`): in `web/src/content/privacy.ts`, paste the final text into `body`
   and set `final: true`. It isn't accepted at sign-up, so it has no version.

With `final: true`, the "Draft … pending attorney review" line above the text becomes
"Effective November 30, 2026".

The business contact (email and phone) shown in the footer and on the homepage lives in one
place: `web/src/content/site.ts`.

## Production switch checklist

Verified locally by booting the API with `ENVIRONMENT=production` and test-shaped values
(`api/tests/unit/test_production_switch.py` keeps these true):

- [x] Refuses to start with any fake provider, without a real Turnstile secret (Cloudflare's
      always-pass test secret is rejected), or with live Stripe keys unless `STRIPE_LIVE_MODE`.
- [x] Demo-only routes are gone: `/demo/restore-login`, every `/simulated/*` payment route,
      and the API docs (`/docs`, `/redoc`, `/openapi.json`). Admins can suspend users again.
- [x] `/webhooks/stripe` returns 400 for unsigned and forged events.
- [x] CORS answers only the origins in `CORS_ORIGINS`.
- [x] Error responses are generic (`Invalid or missing credentials`, domain messages); no
      stack traces. Logs record path, status, timing and error *types* only — no tokens,
      emails, message text or provider keys.
- [x] API responses carry `nosniff`, `X-Frame-Options: DENY`, a deny-all CSP,
      `Referrer-Policy: no-referrer`, `Cache-Control: no-store`, and HSTS in production.
- [x] Website: HSTS, no framing, `nosniff`, a referrer policy, `robots.txt` that keeps
      signed-in areas out of search, `sitemap.xml` of the public pages, a friendly 404 and an
      error page instead of the framework's bare one.
- [x] Upload limits: storage buckets cap size and type (50 MB task files, 10 MB tutor
      documents), 20 files per person per task, 10 tutor documents per tutor.
- [x] Rate limits: 30 requests/day per student, 30 messages/minute and 1,000/day per person,
      AI questions per plan, file reading per day, one open dispute per session.

Still to do by a human at go-live:

- [ ] Supabase Auth (dashboard): confirm sign-in and sign-up rate limits, turn on Turnstile
      captcha once `/login` has the widget, and set the Site URL / redirect URLs to the real
      domain. Login attempts are limited by Supabase, not by this API.
- [ ] Set the website's `NEXT_PUBLIC_TURNSTILE_SITE_KEY` (and optionally
      `NEXT_PUBLIC_SITE_URL` if the public domain differs from Vercel's production domain, so
      the sitemap points at it).
- [ ] After switching, run `/ready` and check `environment: production` and
      `payments_mode: live`, then the $1 smoke test above.
- [ ] Clear demo data first (`api/scripts/purge_test_data.py`, dry run, then with approval):
      production mode turns off the demo password restore, so demo accounts stop being shared.
