# Sprint 22 — Website language preferences

Status: DONE
Governing spec: docs/specs/website-language.md (LANG-1 through LANG-6)

## Audit and goal
The UI is English with a fixed document lang. Chat already has independent language
preferences and provider translations. No website negotiation or preference exists.
Implement the requested saved/browser/country/English order for the English launch.

## Scope and expected files
Locale resolver, root server layout, shared picker and server action; locale tests,
website-language spec and this sprint. No deployment, account/schema, chat or payment changes.

## Invariants
Only completed website locales can be selected. Auth cookies and URLs remain intact.
No raw IP storage or external geolocation requests. Do not inherit unrelated open PRs.

## Tasks and acceptance
- [x] Audit current UI, chat preferences, server rendering and host country headers.
- [x] Implement LANG-1 through LANG-6 with English-only enabled registry.
- [x] Test negotiation precedence against a synthetic future catalog and launch registry.
- [x] Browser-test initial HTML, save/reload/reset, isolation and failure recovery.
- [x] Full scripts/check, adversarial review and final verification.
- Publication: open a PR; leave unmerged and undeployed.

## Test plan and verification
Playwright pure resolver tests and desktop/mobile UI regressions; full scripts/check.
Test malformed cookies/headers, q weights and zero, regional preferences, unsupported
languages, country fallback, no detection persistence, and independent browser contexts.

## Risks
English-only means every current visitor sees English. Additional translations need
their own complete implementation before registry enablement. Browser preferences
are not account-synced. Request-dependent layout opts pages into dynamic rendering.

## Outcome
- Implemented the English-launch selection flow and documented future translation requirements.
- Full scripts/check passed on 2026-11-10: 168 API tests; 20 Playwright tests passed,
  two existing live-video tests skipped; lint/types, OpenAPI drift, secret scan and production build passed.
- Initial browser run: 16 passed, two failed due to a broad alert selector matching
  Next.js's route announcer too. Scoped the selector; retry and signed-in tests passed.
- Adversarial review: fixed progressive script/region lookup and prevented country
  fallback from choosing a browser-rejected language. Added regression assertions;
  reran the full gate successfully after these changes.
- Inspected mobile screenshot: picker and helper text fit the shared footer.
- Limitations: English-only UI, browser-specific persistence, dynamic root layout;
  live Vercel geolocation and deployment not tested. No production changes.
