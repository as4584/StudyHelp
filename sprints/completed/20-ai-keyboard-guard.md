# Sprint 20 — Guard keyboard submission

Status: DONE

## Audit and scope
The textarea calls requestSubmit on Enter. Disabling the Ask button does not block that
path, and onSubmit only checked for empty input. Guard the submit handler for pending
requests and exhausted quota so keyboard submission cannot clear the next draft or send
extra requests. Backend quota enforcement remains authoritative.

## Verification
Desktop/mobile browser tests cover Enter while pending and while quota is exhausted.
Run scripts/check and inspect PR #20 CI to completion. No deploy or merge.

## Outcome
Full scripts/check passed: 168 API tests, all static/contract/secret checks, production
build, 10 desktop/mobile browser tests passed, 2 live-video tests skipped. New tests hold
an AI response and verify Enter retains a second draft without another request, and mock
an exhausted quota to verify Enter retains the draft without creating a chat. Review:
the guard runs before clearing input; normal Enter submission still works in the first
test; backend quota rules are unchanged. No merge or deployment.
