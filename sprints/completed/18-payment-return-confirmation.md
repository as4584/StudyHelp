# Sprint 18 — Truthful payment return states

Status: DONE
Governing spec: docs/specs/payments.md PAY-2, PAY-10; AGENTS.md payment proof invariant.

## Goal and audit
The return page uses status=success to announce held funds, active Premium or a sent tip.
It marks Paid done before its one API read resolves, silently discards read failures and
never polls for delayed webhooks. Cancellation also asserts no charge purely from the URL.
Revisiting a released/refunded checkout still claims funds are held.

## Scope and files
web/src/app/payments/return/page.tsx, web/e2e/payment-return.spec.ts, and demo-loop assertions.
UI read-back only; no payment mutation, provider, price, schema or deployment changes.

## Invariants and acceptance criteria
- PAY-2: only current API state may confirm held/released/refunded/expired funds.
- PAY-10: active Premium is shown only after an authoritative /me read.
- Poll unconfirmed reads a bounded number of times, with manual retry after pending/errors.
- Tips lack per-checkout read-back: give a neutral return message, not a receipt.
- Cancel/missing/malformed context never asserts a charge outcome.
- Ignore responses from an old route/unmounted component.

## Test plan
Reproduce the delayed API case in Playwright before the fix. Test pending->held, read failure
and retry, terminal states, Premium read-back, tip/missing/cancel context on desktop/mobile.
Keep the real signed simulated-checkout demo loop and assert confirmed task/Premium headings.
Run scripts/check; review polling bounds, timer cleanup and authoritative status handling.

## Known risks
UI-state mocks do not verify Stripe delivery. The real local demo uses signed fake events;
live Stripe and live-video proof remain outside this task.

## Outcome
- Before the fix, a production-build Playwright repro failed as expected: a mocked pending
  API payment displayed 'Your payment is held.' and marked Paid done. The test's error
  context confirmed those rendered claims, not just a source-code inference.
- Return-page success headings/progress now depend on current API state. Up to five
  confirmation attempts handle delayed updates; pending/error states offer GET-only retry.
  Released/refunded/expired results are distinguished. Premium reads /me; tip/cancel returns
  use neutral copy because they cannot prove a specific charge outcome.
- Query-context keys and effect cleanup prevent old responses/timers from updating a new
  return context. The polling loop stops after a confirmed terminal state or read error.
- `scripts/check` passed on 2026-11-10: 168 API tests; lint/types/env/contract checks; secret
  scan; production build; 28 desktop/mobile E2E passed, 2 live-video tests skipped by config.
- 22 of those E2E cases are deliberate UI-state tests using mocked API reads. The existing
  real local demo loop now asserts API-confirmed task/Premium headings after signed
  simulated events on both viewports. Neither suite establishes live Stripe verification.
- Adversarial review: no mutation endpoint is called by polling/retry; no URL-only proof,
  optimistic Paid checkmark or silent error remains; missing context stays neutral;
  refunded/released pages do not imply actual delivery from payment state alone.
- Existing PR #17 was confirmed CI green at head 2203519; #18's image/full quality gate
  passed and its mutation step was still running during this fix. Neither was merged.
- No deployment, live database, provider credential, price or fee-policy changes.
