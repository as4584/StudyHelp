# Sprint 17 — Recheck teaching levels when hiring

Status: DONE
Governing spec: docs/specs/marketplace.md MKT-3, MKT-5; existing task-level bid rule.

## Goal
Prevent hiring from a stale bid after a tutor drops the task's teaching level.

## Audit
Application updates allow dropping a level without losing approval. place_bid validates
the task's level, but hire only rechecks approval and the signed agreement. Consequently,
a previously valid offer can hire a tutor who no longer teaches that level.

## Scope and files
api/app/services/marketplace.py, api/tests/integration/test_hire_teaching_levels.py,
api/tests/mutants.toml, and this sprint. No schema, frontend, pricing or deployment changes.

## Invariants and acceptance criteria
- Recheck the tutor's current teaching levels when accepting a bid.
- Lock the tutor profile through hiring so application edits cannot race the check.
- Reject stale offers with 409, leaving the task open, the bid pending and no conversation.
- Dropping an unrelated level must still permit hiring.

## Test plan and verification commands
Reproduce the removed-level case through real application/bid/hire API calls before fixing.
Run scripts/check and mutation checks, review lock order and record exact-head CI.

## Known risks
Hire locks task, bid, then tutor profile. Application edits only lock the tutor profile and
do not lock tasks/bids, so they do not introduce an inverse lock order.

## Outcome
- Reproduced via the API before the fix: after dropping college from an approved application,
  accepting its existing college bid returned 200 and hired the tutor. The unrelated-level
  control passed. After the fix the stale offer returns 409 without changing the task/bid or
  creating a conversation, and the unrelated-level control still hires successfully.
- Added a real-Postgres concurrency regression for an in-flight application edit. Hire now
  locks the tutor profile before reading current approval/teaching levels, through commit.
- Final-layout `scripts/check` passed on 2026-11-10: 171 API tests, all lint/types/env/contract
  checks, secret scan, production build, 6 desktop/mobile E2E passed. The 2 live-video tests
  remain skipped by configuration; no live-video verification is claimed.
- Local worktree scan initially failed because Docker could not resolve Windows gitdir
  metadata. Supplied an additional bind mount to the same scanner image with unchanged
  scan arguments. After relocating tests to a dedicated file, Git CRLF warnings also
  stopped the scanner; normalized those files to LF and reran the entire gate successfully.
- Final `python scripts/mutate.py marketplace`: 4/4 mutants killed, including removing the
  new tutor lock and removing the current-level check.
- Adversarial review: application edits/admin approval lock only tutor profile, so there is
  no inverse task/bid lock order; missing/unapproved tutors still fail; pricing, agreements
  and ownership checks remain enforced. Dedicated tests and appended guards avoid competing
  insertion points with the separate bid-closure PR.
- No deployment, live database changes or policy/price changes. CI checks the PR commit.
