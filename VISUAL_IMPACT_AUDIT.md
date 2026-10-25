# Visual impact audit (after UI refinement, before the art-direction pass)

Evidence: `artifacts/design/round3/*` at 1440 / 1024 / 390. Judged as static images.

**The ten questions, answered honestly**

1. *Where does the eye go first?* Dashboard: the page title. Task page: the title. AI tutor: nowhere —
   the page is a column of text with an empty bottom half.
2. *Should it?* No. On the desk it should land on today's session; in the tutor, on the explanation.
3. *What would I remember in 10 minutes?* The serif. Nothing else.
4. *Anything unique to this product?* The book mark and the translated-message tag. That's all.
5. *Depth?* None. One flat paper plane with white rectangles.
6. *Equal visual weight?* Yes — Next-up sheet, sessions list and AI-tutor panel all weigh the same.
7. *Typographic contrast?* Too little: titles 34px, block headings 20–24px, body 15px — a 2.3× range.
8. *Composition or components?* Components in a grid.
9. *Logo removed, any SaaS?* Yes, apart from the serif.
10. *What stops it being portfolio-quality?* No focal point, no signature graphic, no light.

## Too safe
- "Next up" is a white sheet with a heading and a stepper: correct, forgettable.
- Landing preview is good but static; nothing moves or reveals.
- The five-dot timeline is a generic stepper.

## Too flat
- Everything sits on one tonal plane; sheets are distinguished only by a 1px border.
- Primary buttons are flat fills; no light, no press feel.
- The conversation pane has no sense of being the working surface.

## Too uniform
- Headline sizes cluster (34 / 24 / 20). Numbers (budget, fee, counts) are body-sized.
- Dashboard right column (AI tutor, progress) has the same weight as the left.
- Subjects are plain grey text — "Calculus" looks like "Physics" looks like "Writing".

## Generic
- Stepper with circles and lines; segmented progress bar.
- AI answer = one paragraph with a sparkle icon (ChatGPT-in-a-page).
- Section labels in small grey sentence case over a hairline — every dashboard does this.

## Opportunities (real data only — no invented lessons or mastery %)
- A **study path** motif: sessions are stops on a drawn path; the current stop glows indigo, finished
  stops turn teal. It is the product's own lifecycle (bids → hired → paid → delivered → released) and
  its own history (sessions over time), so it belongs to this product and no competitor.
- **Subject identity** as a quiet accent on the path node, dot and hero light.
- **Structured tutor answers**: render the model's markdown into explanation / example / hint /
  check-yourself blocks with margin annotations; ask the model (system prompt) to use those labels.
- **Depth through light**: a localized indigo/subject glow behind the one hero element, a lifted
  conversation surface, tactile buttons with an inner highlight.

## Signature moments
1. **Study desk hero — "Today's focus."** Large display headline of the session that needs you, set
   over a softly lit field, with the session's path drawn in (animated stroke) and the one CTA.
2. **AI tutor as a study environment.** Answers arrive as structured, annotated sections that reveal
   in sequence; a context rail (subject, questions asked, escalation with the conversation attached).
3. **Study path progress.** Every session as a stop on one path, coloured by subject, with large
   numerals for steps completed and sessions finished — an honest, readable "oh, that's nice".

---

## Result (branch `visual-impact`; previous version tagged `ui-refinement-v1`)

Evidence: `artifacts/design/vi1` (first pass), `vi2`, `vi3` (after critique fixes).

- **Signature motif — the study path.** One drawn line with stops, used in three places: the
  session's own lifecycle (hero + session page), and the student's whole history (one stop per
  session, ring filled by real progress, ending in a dashed "next stop"). Travelled ink is teal,
  the current stop is lit in the subject's accent, the road ahead is a dashed pencil line; it draws
  itself in on load.
- **Moment 1 — Today's focus.** 56px display headline of the real next step, subject micro-label,
  a large typographic subject glyph (∫ ¶ Δ { } §) as graphic, localized subject-coloured light.
- **Moment 2 — AI tutor.** The question becomes the page's display headline; answers render as
  annotated sections (Explanation / Worked example / Hint / Check yourself / Common mistake) with
  margin labels, concept highlights and mono formulas; context rail with legend and escalation.
  The system prompt requests these labels; the keyless demo adapter emits them (still tagged demo).
- **Moment 3 — Study path progress.** Large numerals (steps complete / sessions finished /
  subjects) — all computed from real task states — above the history path.
- **Depth & colour:** deep-indigo AI panel with lavender/teal light; lifted hero and next-step
  sheets; tactile primary buttons (inner highlight, lift, press, arrow nudge). Subject accents:
  maths indigo, science teal, writing clay, computing violet.
- **Motion (5 moments):** path draw, hero stagger reveal (opacity + rise + blur), tutor sections
  revealing in sequence, button press/lift, thinking skeleton. All honour reduced motion.

Second critique — the five things keeping it from exceptional (ranked) and what happened:
1. Travelled path stopped short of the current stop → **fixed** (separate path ending on the stop).
2. Browser-yellow concept highlight → **fixed** (lavender underline highlight).
3. Study-path history was a lone ring → **fixed** (labelled stops on one path + next stop).
4. Hero glyph clipped / smudge-like → **fixed** (repositioned, fully visible).
5. Next-step block weaker than the new header → **fixed** (display-scale title, lift).
Plus a real bug found on review: study desk overflowed horizontally at 390px → fixed, and the E2E
now asserts no sideways scroll.

Still not exceptional: no dark theme; the landing page has not yet received the path motif; tutor
desk and operations screens are clean but not "moments"; fake-adapter tags remain (by design).
