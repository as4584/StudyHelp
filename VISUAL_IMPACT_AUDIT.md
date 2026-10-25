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
