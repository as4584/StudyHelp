# Spec: Payments

Architecture: [../architecture/payments.md](../architecture/payments.md).

| Id | Requirement | Verified by |
| --- | --- | --- |
| PAY-1 | Student pays the accepted bid amount via Stripe Checkout (test mode) after hiring | `test_charge_event_holds_funds_with_configured_fee`, E2E |
| PAY-2 | Payment becomes `held` only from a signed provider event; a checkout URL is not proof | `test_frontend_cannot_fake_payment` |
| PAY-3 | Configurable platform fee 20–30% (default 25%) stored per payment | unit fee tests, `test_config_enforces_fee_policy` |
| PAY-4 | Release after delivery transfers tutor net exactly once | `test_release_once_transfers_net_and_records_fee` |
| PAY-5 | No release before delivery, by non-owners, while disputed, or without tutor payout onboarding | `test_cannot_release_before_delivery`, `test_tutor_cannot_release_own_payment`, `test_disputed_task_cannot_be_released`, `test_release_blocked_without_payout_onboarding` |
| PAY-6 | Admin dispute resolution: release (transfer) or refund (no transfer), audited | `test_admin_can_resolve_dispute_by_release`, `test_disputed_task_cannot_be_released` |
| PAY-7 | Duplicate webhook deliveries have no additional effect | `test_duplicate_webhook_event_is_ignored` |
| PAY-8 | Stripe signatures verified; tampered/wrong-secret/stale events rejected | `test_stripe_signature_verification_accepts_valid_and_rejects_forged`, `test_webhook_endpoint_rejects_unsigned` |
| PAY-9 | Tips $2/$5/$10 after completion, 100% to tutor, separate from commission | `test_tips_go_fully_to_tutor_and_are_validated` |
| PAY-10 | $9.99/mo premium subscription activates/deactivates premium from provider events | `test_subscription_activates_and_deactivates_premium` |
| PAY-11 | Tutors onboard to Stripe Connect Express; payouts enabled from `account.updated` | E2E (simulated onboarding), `_on_account_updated` |
| PAY-12 | Financial history append-only; fee split consistency enforced by DB | `test_ledger_is_append_only`, `test_db_rejects_inconsistent_fee_split` |
| PAY-13 | Test keys only; fake adapter refused in production | `test_config_rejects_live_stripe_keys`, `test_config_rejects_fakes_in_production` |

Client verification items (not engineering decisions): Stripe/PayPal acceptance of the
business category, supported payout countries for target tutor markets, refund policy text.
