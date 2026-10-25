# Design audit — Global Study Help Tutor (before UI refinement)

Date: 2026-10-25 · Branch: `ui-refinement` · Evidence: `artifacts/design/before/*` (13 screens ×
1440 / 1024 / 390, captured by `web/design/shots.mjs` driving the real flow on the real API).

Method: Taste-skill app-screen rules (product face, one question per screen, data that tells the
truth, one gutter, no tiles-for-everything), Impeccable craft floor + critique (anti-slop refuse
list, contrast, states, browser surfaces), UI/UX Pro Max conventions (education UX, touch targets,
type scale). Judged from rendered screenshots, not source.

## What works (keep)

- The **flow itself** is sound and fully functional: request → bids → hire → pay → chat → deliver
  → release → tip → review; premium AI → escalate; admin approvals/disputes/revenue.
- **Payment breakdown** (paid / fee / tutor receives) is honest and legible — a genuine trust moment.
- **Translation affordance** ("Translated from ES · show original") is the right idea.
- Copy is mostly plain and specific; the honor-code positioning is correct.
- Mobile layout doesn't overflow; touch targets are ≥44px on buttons.

## What looks AI-generated (the tells)

1. **Purple gradient hero box** with a tracked-uppercase eyebrow ("GLOBAL STUDY HELP TUTOR") above the
   headline — the single most recognisable template move. Gradient = no information.
2. **Six numbered icon-less cards** ("1 Ask the AI …") as the page structure; Impeccable refuse list.
3. **Every block is the same rounded-2xl white card** with a faint shadow — Request, Files, Next step,
   Payment, Chat, Premium, Tutor hub sections, admin sections. Cards carry no meaning; nothing has
   hierarchy because everything has the same container.
4. **Progress shown as five solid indigo blocks** — heavy, reads like buttons, and colour = "done"
   and "brand" at once (no semantic distinction).
5. **Pastel status pills everywhere** (Paid, Held, Approved, Open) with near-identical hues; the
   pill appears next to the title *and* inside the payment card for the same fact.
6. Unicode glyphs as icons: `★`, `✓`, `→`, `+`. No icon system.
7. Geist (Next.js default) as the only face; weights do little work; headings and body feel the same.

## Hierarchy & product moments

- **Student dashboard doesn't answer "what next?"** "Hi Maya (Student)" greeting, a Premium
  upsell card as the first block, then a list. The one actionable thing (pay / review bids / release)
  is hidden inside the task.
- **Task page**: four stacked cards on the left compete equally; the *next action* ("Next step") is
  third. The chat is a generic box; tutor vs student messages differ only by colour.
- **Assistant**: a form in a card; the AI answer looks like any chat bubble; "Ask a live expert" — the
  product's key differentiator — is a secondary ghost button.
- **Tutor hub**: three equal cards; status (approved, payouts, rating) is scattered in the header.
- **Admin**: KPI tiles of equal weight ($0.00 shown as large as real money); applications list is
  repetitive cards; users list is a wall of "Suspend" buttons. Revenue doesn't state its meaning.

## Typography

Single default sans, 14px body almost everywhere, small grey 12px meta lines; no display voice, no
reading face for long text (requests, tutor explanations, AI answers). Numbers aren't tabular.

## Spacing / layout

Uniform 16px gaps; no grouping rhythm (tight inside groups, generous between). Content capped at
1024px with large dead space on 1440. Chat card fixed at 32rem with an empty void. On 390 the
5-step stepper truncates labels ("Paid (held)").

## Navigation

Top bar shows "Maya (Student) · student" (role repeated), plain text links with no active state, no
product mark. No sense of "where am I".

## Components & states

- Native file input ("Choose File No file chosen") — browser default, breaks the design.
- No loading skeletons ("Loading…" text), empty states are one grey line.
- Focus rings are browser defaults; selection, caret, scrollbars unthemed.
- Errors are a red box; fine, but inconsistent placement.

## Accessibility

- Muted grey on #f7f8fb ≈ 4.6:1 (borderline); 11px translated-from link fails comfort.
- Status pills rely on colour + text (OK) but low-contrast pastels.
- No visible focus style beyond default; `prefers-reduced-motion` not considered (no motion yet).

## Data hygiene (demo)

Admin shows a dozen "E2E Applicant …" accounts from test runs; `seed.py --reset` does not prune
non-demo users. Demo-day risk → fix in seed (dev-only script).

## Opportunities for delight (real, not decorative)

- "Next up" focus block computed from real task state.
- Ask the AI tutor straight from the dashboard (real: pre-fills the assistant).
- A calm session timeline that makes the lifecycle legible.
- Conversation that reads like a study session: tutor voice distinct, translation quietly available.
- Payment as a receipt — the trust moment of the demo.

## Must NOT change

API calls, payloads, routes, auth flow, role guards, business rules, data-testids/labels used by
`web/e2e/demo-loop.spec.ts` (labels may only change together with the test, behaviour never), the
honor-code requirement, DEMO MODE labelling, and the honest fee breakdown.

---

## After — UI refinement (branch `ui-refinement`)

Evidence: `artifacts/design/round1`, `round2`, `round3` (same 13 screens × 3 widths).

| Before | After |
| --- | --- |
| Purple gradient hero, eyebrow, 6 numbered cards | Editorial headline in Newsreader beside the product's real working surface (translated exchange + held-payment receipt); session sequence as one timeline |
| Every block a rounded card | Paper ground; sheets only for things you work in (next step, conversation, receipt, forms); hairline-ruled sections elsewhere |
| Dashboard greeting + upsell first | "Study desk": the **Next up** block is computed from real task state and is the largest thing on the screen; the AI tutor is one textarea away |
| Solid indigo stepper blocks | Quiet timeline: teal = done, indigo ring = current, rule = ahead; segmented bar in dense lists |
| Pastel pills everywhere | Dot + text in semantic tone, stated once per screen |
| Generic chat bubbles | Other person's voice in the reading serif; yours in a quiet sunken bubble; translation and demo labels as small tags |
| Equal KPI tiles | One headline figure (fees earned) + a ledger line of the rest; muted when zero |
| Native file input, unicode icons | Designed file picker; lucide icon set at one stroke |

Critique rounds (three most important tells each round, all fixed):
1. Dead right rail before hire · mobile buried the conversation under details · seed names with
   role suffixes and honorific initials ("P").
2. Fixed-height chat with a void · demo-adapter prefixes inside reading text · truncated names /
   stale seed subjects.
3. Duplicate status statement on tutor desk (caught by E2E) · tutor shown "with" themself.

Remaining weaknesses: no dark theme; demo adapters' bracketed labels still visible (intentional
honesty); no illustrations/photography (deliberately none rather than stock); video sessions
absent (Phase 1b); compact timeline has no tooltip per step.
