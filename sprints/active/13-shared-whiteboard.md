# Sprint 13 — Shared whiteboard in paid sessions

Status: UNVERIFIED (local gate pieces pass; needs human review + migration OK before prod)
Governing spec: client request (whiteboard inside a paid session)

## Goal
The hired student and tutor open one shared board (Excalidraw, MIT, pinned 0.18.0) from the
call page and the task page, draw on it live, and keep it across reloads and outside a call.

## Scope (in / out)
- In: `task_whiteboards` table (migration 0010), `GET/PUT /tasks/{id}/whiteboard`, LiveKit
  data-channel sync in a call, polling of the saved copy outside a call, Save as image (PNG),
  phone layout, keyboard close.
- Out: cursors/presence, per-stroke history, self-hosting Excalidraw fonts (loaded from its
  default free CDN).

## Invariants
- Only the task's student and hired tutor reach the board (admins, other students/tutors,
  applicants get 4xx); only once paid (paid, delivered, completed, disputed).
- Browser roles have no grants on `task_whiteboards` (RLS forced); FastAPI is the only path.
- Body cap 2 MB on the whiteboard route only (413 above); other JSON keeps 256 KB.
- Optimistic `base_version`: a stale save gets 409 + the current scene, never overwrites.
- LiveKit tokens now grant `canPublishData` (the room only ever holds the two parties).

## Test plan
- API: `tests/integration/test_whiteboard.py` (sharing, 409 versioning, 413 cap, closed
  before payment and to others); whiteboard GET/PUT added to `test_outsiders.py`;
  `task_whiteboards` added to the RLS internal-table check.
- E2E: `web/e2e/whiteboard.spec.ts` (draw, save, tutor sees it, PNG export, no horizontal
  overflow, keyboard close + focus return, outsider gets no board) on desktop + mobile.

## Verification commands
`scripts/check` pieces run individually on ports API 8121 / web 3121 (see PR body).
