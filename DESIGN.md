# DESIGN.md — visual source of truth

> **A beautiful digital study desk with an intelligent tutor built into it.**
> The user should feel: *"I can think here."*

## 1. Personality & philosophy

Calm · intelligent · trustworthy · focused · encouraging · premium · human.

Not a SaaS dashboard, not a corporate LMS, not a ChatGPT clone, not a game, not a purple AI startup.

Principles:
1. **Typography does the work first.** Scale, weight and the serif/sans contrast create hierarchy
   before any border, card or colour.
2. **Paper, not panels.** One warm paper ground; content sits on it, separated by space and hairline
   rules. A surface (white sheet) is used only for things you *work in*: the conversation, a form,
   the receipt. Never a card inside a card.
3. **Colour carries meaning.** Remove a colour and information must disappear. Neutrals are thinking
   space.
4. **One question per screen,** answered by the biggest thing on it.
5. **Honest UI.** Everything shown is real data; demo adapters stay labelled.

## 2. Colour tokens (semantic)

| Token | Value | Role |
| --- | --- | --- |
| `--paper` | `#F7F6F2` | app ground — warm desk paper |
| `--sheet` | `#FFFFFF` | working surfaces (conversation, forms, receipt) |
| `--sunken` | `#EFEDE7` | wells: inputs on paper, code, quiet fills |
| `--rule` | `#E4E1D9` | hairlines, dividers |
| `--rule-strong` | `#CFCBC1` | input borders, focus-adjacent |
| `--ink` | `#14161B` | primary text (16.8:1 on paper) |
| `--ink-2` | `#3C4049` | secondary body |
| `--muted` | `#636873` | meta text (5.3:1 on paper, 5.7:1 on sheet) |
| `--tutor` | `#4338CA` | **indigo = intelligence / tutor / active learning**: the AI tutor, current step, primary action |
| `--tutor-soft` | `#EEEEFB` | tutor message tint, selected nav |
| `--mastery` | `#0F766E` | **teal = mastery / done / money released** (text-safe); fill `#14B8A6` only for marks |
| `--mastery-soft` | `#E3F4F1` | |
| `--attention` | `#B45309` | **amber = needs you / discovery**: next action, pending, "ask a live expert" (text-safe); mark fill `#F59E0B` |
| `--attention-soft` | `#FDF3E1` | |
| `--danger` | `#B91C1C` | destructive / errors only |
| `--danger-soft` | `#FDECEC` | |

Distribution target: ~85% neutrals, ~10% indigo, ≤5% teal+amber, red only on error/destructive.
Supporting blue (#2563EB) is not used: indigo already owns "intelligence"; a second blue would be
redundant information.

## 3. Typography

- **Newsreader** (variable, optical size) — display + reading voice: page titles, task titles,
  request text, tutor/AI explanations. Book-like, warm, credible for long study sessions; its optical
  sizing keeps 15–18px reading text open and display sizes tight.
- **Hanken Grotesk** (variable) — interface voice: navigation, labels, buttons, data, meta. A warm
  grotesk with humanist touches, very legible at 13–15px, with tabular figures for money.
- Two families only. Loaded via `next/font/google` (self-hosted at build, no layout shift).

Scale (rem @16px): `display 2.75 / 1.05 Newsreader 500 −0.02em` · `h1 2 / 1.15 Newsreader 500` ·
`h2 1.25 / 1.3 Newsreader 600` · `h3 1 / 1.4 Hanken 600` · `body 1 / 1.6 Hanken 400` ·
`reading 1.0625 / 1.65 Newsreader 400` · `small 0.875 / 1.5` · `meta 0.8125 / 1.45 Hanken 500`.
Measure: reading text max 68ch. Numbers: `font-variant-numeric: tabular-nums` for money and counts.
No uppercase eyebrows; section labels are sentence-case Hanken 600 in `--muted`.

## 4. Space, width, grid

- Spacing scale (px): 4, 8, 12, 16, 24, 32, 48, 64, 96. Tight within groups (8–12), generous between
  (32–48). More space above a heading than below.
- Shell: desktop ≥1024 → left sidebar 232px + fluid canvas (max content 1120px, gutter 40px);
  <1024 → top bar + horizontal nav. Mobile gutter 20px.
- Workspace (task page) 12-col: session column 5 / conversation 7 on ≥1024; stacked on mobile with
  the next action first.
- One gutter value per layout (24px between columns).

## 5. Radii, borders, elevation

- Radii: `6` controls & chips · `10` sheets · `999` avatars/marks only. Nothing else.
- Borders: 1px `--rule` hairlines. No coloured side-borders, no double borders.
- Elevation: paper is flat. Sheets: `0 1px 2px rgb(20 22 27 / .04), 0 1px 0 rgb(20 22 27 / .03)`.
  Popovers/menus only: `0 8px 24px -8px rgb(20 22 27 / .18)`. No glows, no coloured halos.

## 6. Components

- **Buttons.** Primary: indigo fill, white text, 40px (44px on touch), radius 6, Hanken 600 15px.
  Secondary: sheet + 1px rule-strong. Quiet: text-only with underline-on-hover. Attention: amber
  text + attention-soft fill (used for "Ask a live expert" and "needs you" CTAs). Danger: red text,
  red fill only inside a confirm step. Pressed: translateY(1px). Disabled: 45% opacity, no hover.
- **Inputs.** 44px, sheet background, 1px rule-strong, radius 6; focus = 2px indigo ring offset 1px.
  Labels above, Hanken 600 14px; hints in muted 13px. File inputs are a styled drop button showing the
  chosen filename — never the browser default.
- **Surfaces.** Paper by default. A sheet is allowed for: conversation, a form, the receipt, the
  next-up block. Lists are rows divided by hairlines, not cards.
- **Status.** A small dot + text in the semantic colour (not pastel pills). Dot colours: indigo =
  in progress with tutor, amber = needs you, teal = done/released, muted = closed, red = disputed.
  Stated once per screen.
- **Session timeline.** 5 steps on a 1px rule; done = teal check mark, current = indigo ring + label in
  ink, future = muted. On mobile the current step label is shown with "Step 3 of 5".
- **Tutor/AI messages.** Left, no bubble: author line (avatar initial in indigo, name, time), then
  Newsreader reading text. Translation note below in muted with a "Show original" quiet button.
- **Student messages.** Right-aligned, `--sunken` fill, radius 10, Hanken body; the tutor's voice
  is the one dressed in the reading face, so the two read differently without colour.
- **AI tutor** messages carry a small indigo "AI tutor" mark; demo output keeps its label.
- **Receipt (payment).** Sheet with hairline rows, tabular figures, the fee line named with its %,
  total line in ink 600, held/released stated as one status line.
- **Empty states.** One serif sentence of what will appear here + the one action that fills it.
- **Loading.** Skeleton lines in `--sunken` with a 1.2s opacity pulse (reduced-motion: static).
- **Errors.** Inline under the control or action, red text with an icon, naming the recovery.
- **Mastery/progress.** Only real measures: sessions completed, subjects studied, released payments.
  No invented scores or streaks.

## 7. Navigation

Sidebar: product mark (open-book glyph + "StudyHelp" wordmark in Newsreader), role-specific
destinations with lucide icons, active = `--tutor-soft` pill + indigo icon, account block at the
bottom (initial, name, role in muted, sign out). Mobile: top bar with mark + scrollable tabs.

## 8. Motion

Fast and physical: 120–180ms, `cubic-bezier(.2,.7,.2,1)` (exponential ease-out). Used for: button
press, focus ring, new message enter (opacity + 4px rise), timeline step completion, disclosure open.
One authored moment: the current-step ring on the timeline. `prefers-reduced-motion: reduce` disables
transforms and pulses.

## 9. Iconography

`lucide-react`, 1.75 stroke, 16/18/20px, `currentColor`. No emoji or unicode glyphs as icons.

## 10. Accessibility

WCAG AA: text ≥4.5:1, large ≥3:1; focus-visible ring on every interactive element; touch targets
≥44px on mobile; labels on all inputs; status never by colour alone; reduced motion honoured;
themed `::selection`, caret and scrollbar.

## 11. Anti-patterns (banned here)

Gradient heroes or gradient text · uppercase eyebrows above headings · numbered feature cards ·
cards in cards · same-size card grids as page structure · KPI tiles for every number · pastel pills
for every state · coloured left borders · glows/halos · glassmorphism · unicode/emoji icons ·
greeting titles ("Hi Maya") as the h1 · decorative WebGPU/3D/particles · fake metrics.
