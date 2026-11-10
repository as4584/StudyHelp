# Sprint 21 — Bound API read retries

Status: DONE

## Audit and scope
A retryable GET response followed by a transport failure enters the outer catch and sends
a third request. Use one shared retry budget for HTTP and transport failures. Preserve
one-shot writes and error formatting. Change api.ts and add production-client regression
tests to the existing Playwright runner, with authentication/transport mocked.

## Verification
Fail the 503/network regression before fixing; pass it afterward. Check success retries,
final HTTP errors, client errors and non-retried writes. Run full scripts/check.

## Outcome
The regression failed before the fix because the third response resolved successfully;
six control tests passed. An initial VM-promise matcher problem was corrected by bridging
the production client's promise into the test context before establishing that baseline.
After the fix all seven client cases passed. Full scripts/check passed: 168 API tests,
static/contract/secret checks, production build, 20 Playwright cases passed (14 isolated
client cases across the two projects, 6 browser E2E), 2 live-video cases skipped.
Review: the first attempt alone can continue the loop; the second returns or throws.
Writes never continue. Final HTTP errors retain their normal parsing. No deployment.
