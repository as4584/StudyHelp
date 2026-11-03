# Sprint 12 — Client feedback release preparation

Status: ACTIVE
Governing specs: HANDOFF.md sections 4, 7, 9; docs/specs/payments.md

## Goal
Restore the full quality gate for PR #10, merge verified feedback and hardening PRs,
and prepare email-confirmed signup and a reviewable demo release.

## Scope
- Regenerate the API contract and format the video E2E file omitted from PR #10.
- Verify the full gate and API-image CI before merging; close superseded #8/#9.
- Inspect existing SMTP infrastructure without disclosing credentials.
- Audit the additional client revenue and affiliate requests against implementation.
- No live deploy, database reset, host hardening execution or client-domain changes
  without the approval required by HANDOFF.md.

## Acceptance criteria
- PR #10 and #11 merge only with green full-gate and API-image checks.
- Email confirmation remains enabled; SMTP credentials are validated privately.
- Clearly distinguish implemented commission logic from planned affiliate features.
- Record remaining release approvals and any exact blockers.

## Verification
- scripts/check (full local gate where supported), GitHub full-gate/API-image jobs.
- Generated OpenAPI comparison, Prettier check, git diff --check.
- SMTP TLS/authentication check without sending messages.

## Risks
- Demo reseeding removes activity and all non-demo accounts.
- Older operations/demo documents contain superseded deployment and pricing details.
- Affiliate payment eligibility and fee allocation still require business decisions.

## Outcome
In progress. Original PR #10 CI: 140 API tests passed; OpenAPI drift failed before
frontend/build/E2E. API image passed. PR #11 CI passed at its original head.
