# Product coherence audit (branch `product-coherence`, base tag `visual-impact-v3`)

Benchmark: the student Study Desk (v3). Evidence: `artifacts/design/pc1`, `pc2` — every screen of
the client demo flow at 390 / 768 / 1024 / 1440, plus `contact-sheet.png` per round.

## Visual cliffs found (before this pass)
1. Premium dark AI-tutor card on the desk → plain AI tutor page header.
2. Designed session lifecycle → a generic stacked form ("Request a tutor").
3. Hire → straight into a placeholder checkout with no product context.
4. Payment → a one-line "Payment received" page.
5. Tutor desk → sparse rows with no hierarchy or earnings.
6. Auth → generic centred form.
7. Mobile: sticky top bar and sticky AI composer could cover content while scrolling.

## What changed
- **AI tutor (P1):** deep-indigo study header matching the desk card; honest
  Question → Understand → Practice path (Practice completes only when the student sends an attempt);
  answers as study material — large **Key idea** statement, Explanation, Worked example, **Try this**
  (loads "My attempt:" into the composer), Hint, Check yourself, Common mistake; maths set in italic
  serif, code in mono. Prompt asks the model for these labels; demo adapter emits them.
- **Request a tutor (P2):** "Describe what you're stuck on." — numbered steps 01–05 without boxes,
  subject quick picks with accents, budget chips, live request preview on the study path, and the
  honour code as a signed pledge.
- **Tutor desk (P3):** headline of what needs the tutor, editorial earnings computed from real
  transfers/tips/held payments, open requests as editorial rows, sessions on the path.
- **Checkout (P4):** new StudyHelp review step before the gateway — who you're hiring, server-side
  quote (`GET /tasks/{id}/quote`), Pay → Held → Delivered → Released journey, three protections.
  Demo checkout and the return page now carry task context ("Your payment is held.").
- **Auth (P5):** one quiet editorial aside with the path motif; forms unchanged.
- **Motif formalised** in DESIGN.md §12; subject accents in §13.
- Mobile chrome no longer sticky; AI composer sticky on desktop only.

## Ranking (A showcase · B polished · C functional · D unfinished)

| Screen | Before | After |
| --- | --- | --- |
| Landing | A− | A− |
| Sign in / Sign up | C | B+ |
| Study desk | A | A |
| AI tutor | B | **A** |
| Request a tutor | C | **A−** |
| Tutor desk | C | **B+** |
| Tutor: open request / bid | B | B+ |
| Student: offers & hire | B | B+ |
| Checkout review (new) | — | **A−** |
| Demo checkout | D | B |
| Payment held | C | B+ |
| Session (work with tutor) | B+ | B+ |
| Session complete / released | B+ | B+ |
| Operations (admin, off demo path) | B | B |

No screen on the main demo path is below B; Study desk and AI tutor are A.

## Second critique (ranked) → outcome
1. Dense path labels collided in the request preview → fixed (dense shows the current label only).
2. Desktop sidebar drifted in long pages → fixed (`self-start`; captures scroll to top).
3. Old sentence-case section labels on the session page → unified to micro-labels.
4. Zero metrics in full ink on the tutor desk → muted.
5. Request form squeezed by its preview at 1024 → preview from 1280px up.

Remaining: the session page is B+, not A (its next-step and conversation are strong but the lower
details column is quiet); admin untouched by design; no dark theme.
