# Sprint 09: client feedback, round 1 (2026-10-28 → 29)

The client reviewed the hosted demo and sent feedback over Instagram, plus two longer briefs.
This plan follows the "ordo" rules:
- Each item states its outcome as acceptance checks before any work starts.
- Every "done" claim must point to evidence: a test, a log, or a live URL.
- Blockers are reported, not silently retried.

## A. Already built (on branch `request-language`, not yet live)

| # | Request | Acceptance check | Evidence |
|---|---|---|---|
| A1 | Language choice on the request form | Request saves `language`, an invalid code is rejected (422), and tutors see it | `test_task_language_defaults_to_english_and_is_validated`, E2E picks Español |
| A2 | High school / college level | Level is required to post; tutors only see open requests at levels they teach; tutors choose levels on their application | `test_tutors_only_see_requests_at_levels_they_teach`, E2E asserts Post is disabled until a level is chosen |
| A3 | More subjects (English, Biology, Mathematics, hard classes) | 8 common subject chips, with "More subjects…" revealing 9 harder ones | Visual check |
| A4 | Budget starts at $10/$15 | Presets are $10/$15/$25/$40 and the default is $15 | Visual check |
| A5 | Tip after the review | Tip buttons are hidden until a review is saved, then shown | E2E: no tip before the review, tip after |
| A6 | Profile face photo (students and tutors) | Photo is resized in the browser to 256px; the server accepts only image data URLs of 200 KB or less; it shows in the shell, bids and checkout | `test_profile_photo_set_validated_and_cleared` |
| A7 | $10 English essay example on the home page | A second example card appears in the "How a session works" preview | Visual check |

Gate status:
- 107 backend tests pass.
- Playwright E2E passes on desktop and mobile.
- Lint, types, build and the secret scan are clean.

**Blocker to go live:** the live database needs three additive migrations (0002, 0003). The Supabase connector token expired with "Invalid or expired requestState", so the user must reconnect Supabase in claude.ai. After that: apply the migrations → deploy the API → deploy the web app → run a live smoke test.

## B. AI freemium limits (the client's spec)

The current behaviour is that AI is premium-only. The new rules:
- **Free users** get 5 AI questions per calendar day, counted in UTC and enforced on the server from `ai_usage`.
  - Question 6 returns 402 `{code: "ai_daily_limit", resets_at}`.
  - The chat then locks and shows an upgrade modal for the $9.99/month plan.
- **Premium users** have no daily limit, with a fair-use cap of 150 per calendar month.
  - Over the cap, the server returns 429 `{code: "ai_fair_use", resets_at}` with a calm message.
- **Logged-out visitors** get 5 per day keyed by a signed anonymous cookie plus IP, then are sent to sign up.
  - This needs a public `/ai/ask` path with rate limiting. It ships second, after B1–B3.
- Human tutoring stays pay-per-session and is never counted against the AI limits.

Acceptance checks:
- B1: Tests show the 5th question succeeds and the 6th is refused.
- B2: Tests show the day boundary resets the count.
- B3: Tests show premium users are unlimited daily, the 151st question in a month is refused, and denied calls are logged but not counted.
- B4: E2E checks the lock and the upgrade modal, and that a remaining-count indicator ("3 of 5 left today") is visible.
- B5: Limits come from config (`AI_FREE_DAILY=5`, `AI_PREMIUM_MONTHLY=150`), not hard-coded.

## C. New revenue features (client brief; each needs pricing sign-off before going live)

Under AGENTS.md, payment and fee changes need explicit approval. The client proposed the prices; Alex confirms them before Stripe goes live.

| # | Feature | Build | Acceptance checks |
|---|---|---|---|
| C1 | Urgent / fast-track (+$5–15) | Request has an `urgent` flag and `deadline_at`. The fee is a separate line item that goes 100% to the platform. Urgent requests sort first for tutors and show a badge. | Fee goes into the ledger as its own `payment_events` kind; sort order is tested; the fee is refunded if no tutor is hired before the deadline |
| C2 | Human Verification Seal ($5–10/doc) | New task `kind = verification`. The tutor returns a verdict, either "Verified correct" or "Needs changes" with notes. The seal is a page with a server-signed ID. | Seal can't be forged (signed ID, server lookup); only the hired tutor can issue it; the seal wording doesn't let it be presented as graded work (academic-integrity review) |
| C3 | Group sessions ($10–15 per seat, up to 10) | `group_sessions` and `seats` tables. Each seat is its own checkout; release happens per seat after the session; 25% commission per seat. | Can't oversell the 10 seats (database constraint plus a concurrency test); cancelling refunds every seat; the tutor payout equals the sum of seat net amounts |
| C4 | AI exam packs ($4.99 one-off) | `packs` table (draft → tutor-vetted → published); purchase grants access. | Only vetted packs can be bought; a purchase is idempotent; the content is stored as data, not generated per request |

Order: C1 → C4 → C3 → C2. This puts the cheapest-to-build and highest-margin features first.

## D. Creator affiliate tracking (client's "Step 4")

- `creators` table (name, email, code, status) and `/ref/{code}` links, which set a 30-day first-party cookie and redirect to signup.
- When an account is created, attribution is stored once, on the profile, and can't be changed afterwards.
- Commission rules:
  - $1.00 per *verified* signup (email confirmed).
  - 10% of each *paid* subscription invoice, driven by the `invoice.paid` webhook, with nothing paid on refunds.
- Ledger: an append-only `affiliate_events` table and a monthly payable report.
- Admin pages: creators, their links, signups, earnings, and "mark paid" (a manual payout first; Stripe Connect payouts later).
- Admin can add a creator and copy their link.
- Out of scope for the app: the shared Google Drive, scripts and the review folder. Those are operations; a checklist doc for creators is enough.

Acceptance checks:
- D1: Tests show a referred signup records the creator once, and self-referral and duplicates are rejected.
- D2: Tests show the 10% comes only from paid invoices, a refund reverses it, and webhook replays are idempotent.
- D3: The admin report totals match the ledger.

**Anti-fraud** (paying $1 per signup invites fake accounts):
- Count a signup only after email verification plus a first action (asking the AI or posting a request).
- Rate-limit signups per IP.
- Hold signup bonuses for 14 days before they become payable.

**Decision needed from the client:** is the $1 paid on signup or on first activity? Recommendation: on first activity.

## E. Still open / honest limits

- **Real payments:** going live with real payments needs the client's Stripe account. Everything here stays in test mode until then.
- **Logged-out AI (part of B):** this exposes the AI provider to the public internet. It needs rate limiting and a cost ceiling before real LLM keys go on.
- **Custom domain:** the domain globalstudyhelptutor.com must be bought before the `/ref/` links can use it. Until then the links use the vercel.app URL.
