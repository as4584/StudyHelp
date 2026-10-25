# Payments — platform-held funds via Stripe Connect

This is **delayed payout of platform-held funds**, not a legal escrow arrangement.
Pattern: Stripe Connect **separate charges and transfers** (verified against Stripe docs on
2026-10-25): the student pays the platform; later the platform creates a `Transfer` to the
tutor's Express connected account with `source_transaction=<charge>` so the transfer can't
outrun settled funds. Manual-capture authorizations are NOT used as a holding mechanism.

```
student → Checkout (platform charge, transfer_group=task_<id>)
        → webhook checkout.session.completed (signed) → payments.status=held, task=paid
tutor delivers → student releases (or admin resolves dispute)
        → Transfer(tutor_net, source_transaction, idempotency_key=release:<payment_id>)
        → payments.status=released, task=completed; platform keeps the fee
```

## Money rules (`api/app/services/fees.py`)

- Integer cents only. `platform_fee = round_half_up(amount × bps / 10000)`, tutor gets the
  exact remainder. DB `check (platform_fee_cents + tutor_net_cents = amount_cents)`.
- `PLATFORM_FEE_BPS` configurable; config and DB both enforce the 20–30% policy. The fee
  basis points are stored on each payment (later fee changes don't rewrite history).
- Tips: $2/$5/$10 only (DB check), modelled separately (`tips`), transferred 100% to the tutor;
  Stripe processing fees on tips are absorbed by the platform.
- Premium: $9.99/month Stripe Billing subscription; premium = `subscriptions.status in
  (active, trialing)` and period not ended — evaluated server-side.

## Safety invariants (constraint + test for each)

| Invariant | Enforcement |
| --- | --- |
| Each webhook event applied once | `provider_events` PK, inserted in the same txn as effects |
| A payment is released once | unique partial index `transfers(payment_id)`; row lock on payment |
| One live payment per task | unique partial index on `payments(task_id)` for pending/held/released |
| Gateway retries are safe | idempotency keys derived from our row ids |
| History is auditable | `payment_events` append-only (UPDATE/DELETE trigger raises) |
| Disputed tasks can't be released by the student | state machine + service check |
| Signature required | `stripe.Webhook.construct_event` (tolerance window = replay guard) |
| Only test keys | config rejects any non-`sk_test_`/`rk_test_` key |

Webhook events handled: `checkout.session.completed`, `checkout.session.async_payment_succeeded`,
`checkout.session.expired`, `customer.subscription.updated|deleted`, `charge.refunded`,
`account.updated` (payouts enabled when `capabilities.transfers == active`).

## Fake gateway (keyless demo/tests)

`PAYMENTS_PROVIDER=fake` → checkout URLs open `/checkout/simulated/<id>` (labelled DEMO MODE).
Completing it builds a Stripe-shaped event, HMAC-signs it, and pushes it through the same
`parse_webhook` + `process_event` path. Routes under `/simulated/*` exist only when
`PAYMENTS_PROVIDER=fake` and never in production.

## Known limitations

- Tip transfers are deferred (logged `tip.transfer_deferred`) if the tutor hasn't completed
  payout onboarding; there is no automatic retry job yet.
- Fake subscription completion trusts any `cs_fake_*` id for the signed-in student (demo only).
- Cross-border payouts to tutors outside Stripe-supported regions need a fallback provider
  (PayPal Payouts/Wise) — business verification item.
