# Spec: live video + screen share (V1–V9)

The student and the tutor they hired meet live, with camera, microphone and screen sharing,
inside the app. The media runs on a self-hosted LiveKit SFU: there are no per-minute fees and
no third-party video vendor.

| Id | Requirement | Enforced by |
|---|---|---|
| V1 | Only the task's student and its hired tutor can join. Admins can see the status but never join. Anyone else gets 404, with no existence oracle. | `services/video.py`, `test_video.py` actor tests |
| V2 | Video is available only while the work is funded: task `paid` or `delivered`. Every other state returns 409. | `JOINABLE`, stage tests |
| V3 | A credential works for one room only, lasts ~10 minutes, may publish camera, mic and screen share (plus screen-share audio) only, has no data channel and no admin grants. | `mint_livekit_token`, claim tests |
| V4 | The room name is opaque (`room_` + 128 random bits) and contains no task id or PII. The participant identity is a stable hash, so a rejoin replaces the old connection rather than adding one, and it doesn't reveal the user id. | `new_room_name`, `participant_identity` |
| V5 | Either party can end the session. Ending is idempotent, closes the room (`DeleteRoom`) and stops new credentials from being issued. | `end`, end tests |
| V6 | `VIDEO_ENABLED=false` returns 404 `video_disabled` and leaves every marketplace flow untouched. | router dependency, flag test |
| V7 | Production refuses the fake video provider. The `livekit` provider needs a key, a secret of at least 32 chars and a `wss://` public URL. Secrets never reach the browser. | `Settings._validate`, unit tests |
| V8 | The server stays light. Media never touches FastAPI. Each join costs one locked row read plus a local HMAC signature. Ending costs one HTTP call. Clients use adaptive stream, dynacast and simulcast, with the camera capped at 720p and screen share at 1080p/15 fps. | design; Sprint 11 client config |
| V9 | `video_sessions` is internal: RLS is forced and there are no client grants. | migration 0004, `test_rls.py` |

## API

- `POST /tasks/{id}/video/join` returns `{url, token, expires_at, room, identity}`
- `GET /tasks/{id}/video` returns `{status: none|created|active|ended, joinable}`
- `POST /tasks/{id}/video/end` returns `{status: "ended", joinable: false}`

## Not yet (see `sprints/planning/10-video-and-self-hosting.md`)

- The call UI is Sprint 11.
- The LiveKit container and the real two-browser test are Sprint 12.
- The public media edge (UDP ports and TURN/TLS on 443) is Sprint 13. It can't go through the
  Cloudflare Tunnel.
