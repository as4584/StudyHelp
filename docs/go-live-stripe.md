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

## 1. Allow live keys (code change, needs approval)

`api/app/core/config.py` deliberately refuses any key that doesn't start with `sk_test_` or
`rk_test_` ("Only Stripe TEST keys are permitted in this build"). Going live means relaxing
that check in a reviewed PR, approved by Alex, and merging it before switching the keys.

## 2. API environment variables (production)

Set these on the API project in production. Names only; values come from the client's Stripe
account and go through Doppler. Use Bash `printf` with `vercel env update`, never a PowerShell
pipe (it adds a BOM).

| Variable | Value |
|---|---|
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
