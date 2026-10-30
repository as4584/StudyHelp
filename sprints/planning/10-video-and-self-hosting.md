# Sprint plan 10–15: live video + screen share, then the self-hosting exit

Status:
- **10** DONE (PR #4)
- **11** DONE (PR #5)
- **12** DONE (PR #6); the load test is deferred to the real media node
- **13** ACTIVE. Alex chose option A: router port forwarding on a wired home server. Edge config
  is in `infra/edge/`. Waiting on the router forwards + DNS, then the network tests.
- **14–15** IN SCOPE. Alex decided on **no outside services**, so Supabase *and* Vercel are
  replaced by self-hosted equivalents. The payment processor (Stripe) and the domain's DNS stay
  external by necessity.

Evidence:
- `scripts/check` full gate green on each branch
- mutation testing 36/36 killed
- `scripts/video-proof` passed: a real UDP call, cameras both ways, screen share, end closes the room
Governing spec: `docs/specs/video.md`. The architecture input is the client-side brief
"Fully Self-Hosted Video Calling and Screen-Sharing Architecture" (2026-10-30), which
recommends LiveKit OSS with no per-minute SaaS.

The client asked for video calls with screen sharing in the launch scope, priced separately.
Building it does not change the money rules. Production deploys, DNS changes and live payment
keys still need human approval (AGENTS.md).

## Working rules for every sprint (regression and mutation discipline)

1. **TDD.** Write the failing test first, then the smallest code that makes it pass. Every
   authorization rule gets its own test that names the actor that must be refused.
2. **One PR per sprint**, stacked on the previous branch. Each PR needs a green CI
   (`scripts/check` full gate) before the next one stacks on it. Nothing is pushed to `main`.
3. **The full suite runs on every PR.** That is the "old features can't break silently"
   guarantee. No test is skipped, weakened or deleted to get a green build.
4. **Mutation testing** (`scripts/mutate`) on every new rule. Each sprint adds its mutants to
   `api/tests/mutants.toml`, and the suite must kill 100% of them. A surviving mutant means a
   missing test, and the sprint is not done until it is killed.
5. **Light server load is a requirement, not a nice-to-have:**
   - Media never passes through FastAPI or Next.js.
   - The API's only work is one indexed DB lookup plus a local HMAC signature per join, with
     no network call.
   - The room closes when the session ends.
   - Clients use adaptive stream + dynacast + simulcast, camera capped at 720p, screen share
     capped at 1080p/15 fps, so the SFU forwards only what each viewer can display.
6. **Read-only boundary.** Cloud consoles (Supabase, Vercel, Cloudflare) are read-only for the
   agent. Migrations and deploys are prepared and verified locally, and a human applies them.

## Sprint 10: video backend (API, schema, authorization). PR #4

- **Migration `0004_video_sessions`:** one row per task, with columns
  - `room_name`, which is opaque: `room_` + 128 random bits, containing no PII or task id
  - `status`: created / active / ended
  - timestamps

  RLS is forced and there are no client grants: the table is internal.
- **`VideoProvider` protocol** (`app/providers/video`):
  - `LiveKitProvider` mints LiveKit access tokens locally with PyJWT (HS256, the standard
    LiveKit claim set). No extra SDK dependency.
  - Ending a session calls `RoomService.DeleteRoom`: one HTTP call.
  - `FakeVideoProvider` is used for tests and the hosted demo.
- **`POST /tasks/{id}/video/join`** → `{url, token, expires_at, room, identity}`:
  - Only the task's student or hired tutor may join. Admins can see the task but cannot join
    (403). Anyone else gets 404, with no existence oracle.
  - Only `paid` and `delivered` tasks qualify, which means the session is funded. Other states
    return 409.
  - An ended session returns 409.
  - The token is good for ~10 minutes and for that one room only. It allows publishing camera,
    mic and screen share (plus screen-share audio) and no data channel. The identity is an
    opaque per-room HMAC, so a second tab replaces the first rather than adding a third
    participant.
- **`GET /tasks/{id}/video`** returns the status. **`POST /tasks/{id}/video/end`**: either
  party can end it. It closes the room and is idempotent.
- **`VIDEO_ENABLED` feature flag:** when off, the endpoints return 404 `video_disabled` and
  nothing else in the marketplace changes.
- **Config validation:** production refuses the fake video provider, and `livekit` needs a key,
  a secret ≥ 32 chars and a `wss://` public URL.
- **Acceptance:**
  - Tests for every actor in the matrix: student, hired tutor, non-hired bidder, unrelated
    student, unrelated tutor, admin, anonymous.
  - State tests: open/hired/completed/refunded/ended.
  - Token claim tests.
  - RLS test.
  - Migration round trip.
  - All mutants killed.

## Sprint 11: video UI. PR #5

- **`/tasks/[id]/call`** built on `livekit-client` (no stock conference UI):
  - pre-join device preview
  - camera and mic toggles
  - screen share, with the shared screen as the main stage and camera tiles secondary
  - connection indicator, reconnecting banner, leave and end buttons
- **States:** idle → preview → requesting-token → connecting → connected ⇄ reconnecting →
  left / ended / error.
- **Failures handled without killing the call:**
  - permission denied for camera or mic
  - the share picker being cancelled
  - "stop sharing" from the browser chrome
- **The "Start video session" button** shows on the task page only for the two parties in
  paid/delivered states.
- **Demo mode:** with the fake provider, the page shows a labelled preview-only mode, so the
  hosted demo never pretends to connect.
- **Acceptance:**
  - Playwright on desktop and Pixel 7, using fake media devices
    (`--use-fake-device-for-media-stream`).
  - Checks: the button shows only for the parties, the call page reaches preview, denied
    permissions are handled, and the demo-mode banner shows.
  - All existing E2E flows unchanged.

## Sprint 12: self-hosted LiveKit, local proof. PR #6

- `infra/video/`:
  - a docker compose file with `livekit/livekit-server:v1.13.11` (host networking) and Redis
  - `livekit.yaml` with embedded TURN, UDP 50000–60000, TCP 7881, and the Prometheus port
    internal-only
  - a key generator that writes to a gitignored env file
- A **real two-browser call test**: Playwright with two contexts against the local LiveKit
  container, asserting that remote audio and video tracks arrive and a screen-share track
  arrives.
- `lk load-test` script and recorded results (1, 10, 25 rooms) in `docs/ops/video-capacity.md`.

## Sprint 13: production video edge (needs human approval and a network decision)

- **Blocker found in the audit:** the current home server publishes through a Cloudflare
  Tunnel. A tunnel carries HTTP/WebSocket only. It **cannot carry WebRTC UDP media or
  TURN/TLS**. Production video needs one of:
  - (a) port forwarding on the home router: UDP 50000–60000, TCP 7881 and TCP 443, which needs
    HAProxy SNI because 443 is shared, plus a static or stable public IP with no CGNAT
  - (b) a small VPS used only as the media node
- Then: HAProxy 3.2 SNI split (`rtc.` → Caddy → LiveKit signaling; `turn.` → LiveKit
  TURN/TLS), firewall rules, certificates.
- **Network tests** (from the brief):
  - A: direct UDP
  - B: UDP blocked → TCP 7881
  - C: only TCP 443 → TURN/TLS, with `getStats()` proving `relay`
  - D: reconnect after a network flap
- Alerts on TURN %, connect failures, CPU and NIC saturation.

## Sprints 14–15: Supabase exit (only if the client wants zero SaaS; otherwise deferred)

Build the replacement and run it in parallel. Remove Supabase last, never first.

- **14:** self-hosted Postgres 18 + backups (pg_dump every 6 h, WAL archiving later, monthly
  restore drill), and local private file storage behind the existing `StorageProvider`
  protocol.
- **15:** FastAPI-owned auth: Argon2 (`pwdlib`), short access JWT, rotating opaque refresh
  sessions in HttpOnly cookies, CSRF/origin checks, email verification.
  Realtime goes over FastAPI WebSockets with Redis fanout; durable events stay in Postgres.
- **Exit test:** the full regression suite passes with every Supabase variable unset.

## Risks

- **Mobile Safari:** it supports camera/mic but not screen-share capture, so mobile users can
  view a share but not send one. This is stated in the UI.
- **Single server:** production-capable, not highly available. A host reboot drops live calls.
  Clients rejoin with a fresh token.
