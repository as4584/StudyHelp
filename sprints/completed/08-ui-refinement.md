# Sprint 08 — UI refinement (design-system + UX + visual refactor)

Status: DONE (see verification) · Branch: `ui-refinement`
Governing docs: `DESIGN_AUDIT.md` (audit + after), `DESIGN.md` (source of truth).

## Scope
Visual/UX refactor of every web screen. **Out of scope and untouched:** API, routes, auth, data
models, business rules. Only dev data changed: `api/scripts/seed.py --reset` now prunes test
accounts and uses realistic names.

## Method
Taste-skill (app-screen rules: product face, one question per screen, truthful data),
Impeccable (craft floor + refuse list) and UI/UX Pro Max conventions were used as **read**
references (their SKILL.md/reference files fetched and studied); their installers and scripts
were not added to the harness. 21st.dev, SkillUI and WebGPU: not used — no component or effect
earned its place against DESIGN.md (WebGPU explicitly rejected: no interaction it would improve).

## Decisions
- Type: Newsreader (reading/display, optical sizes) + Hanken Grotesk (UI, tabular figures).
- Colour roles: indigo = tutor/current/primary, teal = mastery/done/released, amber = needs
  you/escalate, red = errors only, warm paper neutrals.
- Shell: 232px sidebar on ≥1024, top bar + tabs below; product mark drawn.

## Verification
- `npx tsc --noEmit`, `eslint`, `prettier --check` clean.
- Playwright demo loop (desktop + Pixel 7) passes against the redesigned build.
- Visual review: 3 rounds × 13 screens × 1440/1024/390 (`artifacts/design/*`).
- `scripts/check` full gate: see commit message of the final sprint commit.
