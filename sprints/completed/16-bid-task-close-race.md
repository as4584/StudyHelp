# Sprint 16 — Serialize bidding with task closure

Status: DONE
Governing spec: docs/specs/marketplace.md MKT-3, MKT-5, MKT-9

## Goal
Prevent a bid from being accepted after a concurrent hire or cancellation closes bidding.

## Scope
Lock the task during bid placement using the same row lock as hire/cancel. Add real-Postgres
regressions and a mutation guard. No schema, pricing, deployment or frontend changes.

## Audit
place_bid reads the task without a row lock; hire/cancel lock it. A competing closure can
commit after the bid reads 'open' but before its insert, leaving a pending bid on a closed task.
The directory candidate was checked: the public route already excludes inactive tutors.

## Files expected to change
api/app/services/marketplace.py, api/tests/integration/test_marketplace.py, api/tests/mutants.toml

## Invariants and acceptance criteria
- MKT-5/MKT-9: closures that acquire the lock first prevent subsequent bids from committing.
- MKT-3: approved tutors can still bid on open tasks; duplicate bids remain conflicts.
- No weakened authorization, payment or RLS checks.

## Test plan and verification commands
- Reproduce both hired/cancelled races before the fix; pass them after the fix.
- scripts/check; direct Python module checks if Windows executable shims are blocked.
- Mutation guard removes only the new bid lock; the regression must fail.
- Review the diff for lock ordering and transaction boundaries; record CI at the PR head.

## Known risks
Brief serialization per task; no external provider call occurs while placing a bid.

## Outcome
- Before the fix, both closure regressions returned 201 with pending bids instead of 404.
  The first hired fixture hit a DB constraint; corrected it to update hiring fields together
  and then reproduced the actual stale-bid failure for both closure states.
- Added the shared task row lock in place_bid, real-Postgres regressions and a mutation guard.
- Full `scripts/check` passed on 2026-11-10: 170 API tests, lint/types, env validation,
  OpenAPI drift, secret scan, production build, 6 desktop/mobile E2E passed. The 2 live-video
  tests were skipped by configuration; no live-video claim is made.
- Initial verification accidentally ran two suites against gsht_test concurrently, causing
  failures. Stopped the duplicate; the isolated canonical rerun passed.
- `python scripts/mutate.py marketplace`: 3/3 mutants killed, including removal of the new lock.
- Adversarial review: task lock matches hire/cancel; duplicate bids are serialized and still
  conflict; no provider calls are made under the bid lock; rejected requests roll back on
  session cleanup. Tests wait on actual PostgreSQL blockers instead of timing assumptions.
- No deployment or live database changes. CI will independently verify the PR commit.
