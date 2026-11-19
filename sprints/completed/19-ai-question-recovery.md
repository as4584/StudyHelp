# Sprint 19 — Preserve failed AI questions

Status: DONE
Governing spec: docs/specs/ai.md; student question preservation.

## Audit and goal
The composer clears before chat creation and message submission. Failures discard the
question except for quota errors. Preserve it after either request fails, including when
the student has typed another draft while waiting.

## Scope and invariants
Assistant page and browser regression tests only. Do not retry writes automatically.
Keep successful submissions, quota dialogs and provider error handling intact.

## Verification
Reproduce both failure paths with mocked API errors in the local browser; verify the fix,
existing demo loop and full scripts/check. Review concurrent draft and failure behavior.

## Outcome
- Before the fix, desktop browser tests reproduced empty composers after both chat-creation
  and message-submission errors. An earlier attempt failed on local CORS setup; allowing the
  owned local test origin exposed the actual bug.
- Both request failures now restore the submitted question; any text typed while waiting is
  retained after it. Quota errors still open the existing dialog; no writes are retried.
- Full `scripts/check` passed: 168 API tests, lint/types/contract/secret checks, production
  build, 12 desktop/mobile browser tests passed and two live-video tests skipped.
- Review: a created chat remains available after message failure; optimistic messages are
  removed on failure; quota reload runs for both failure paths. Existing successful demo
  flow passed. Browser failure cases mock API errors and do not establish live provider behavior.
- The first gate run was interrupted before its result was captured; an isolated full rerun passed.
