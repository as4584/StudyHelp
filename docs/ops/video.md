# Ops: self-hosted video (LiveKit OSS)

## Local (proven)

```bash
python infra/video/gen-keys.py                       # once; writes the gitignored infra/video/.env
docker compose -f infra/video/docker-compose.yml up -d
scripts/video-proof                                  # real two-browser call + screen share
```

Recorded result, 2026-10-30, LiveKit 1.13.11 on the dev workstation:

- Both participants connected over **UDP**, in 81–88 ms.
- Each received the other's camera.
- The tutor received the student's screen share.
- "End session" closed the room for both (`SERVICE_REQUEST_DELETE_ROOM`).

## Server load budget

- **The API never carries media.** Per join it does one locked row read and signs one HMAC
  token. Ending a session is one `DeleteRoom` call.
- **The SFU is one Go process**, with no Redis on a single node. `max_participants: 2` makes
  the SFU itself refuse a third participant.
- **Clients** use adaptive stream, dynacast and simulcast, with the camera capped at 720p and
  screen share at 1080p/15 fps, so the SFU forwards only the layers each viewer displays.
- **Bandwidth to plan for:** about 2.5 Mbps per participant, or roughly 19 MB per
  participant-minute. A 1:1 hour is about 2.25 GB of server egress. This is a planning
  assumption, so measure it on the real node.

## Production edge (Sprint 13, needs a human decision before anything is changed)

The current home server publishes through a **Cloudflare Tunnel**. A tunnel carries HTTP and
WebSocket only. **It cannot carry WebRTC media (UDP) or TURN.** Signaling could go through the
tunnel, but the media cannot. One of these is required:

| Option | What it takes |
|---|---|
| A. Home server, direct | Router port-forwards UDP 50000–60000, TCP 7881 and TCP 443. Needs a public IP that isn't behind CGNAT. 443 is shared with HTTPS through an HAProxy SNI split: `turn.` goes to LiveKit TURN/TLS, everything else to Caddy. |
| B. Small VPS as the media node | LiveKit only, with host networking and a static IP. The app stays where it is. No per-minute fees, only the VPS rent. |

Production config changes from the local one:

- `use_external_ip: true` (or `node_ip: <public IP>`)
- full port range 50000–60000
- `turn.enabled: true` with `tls_port: 5349`, put behind the SNI router on 443
- `LIVEKIT_PUBLIC_URL=wss://rtc.<domain>`
- `VIDEO_PROVIDER=livekit`, `VIDEO_ENABLED=true`

Before launch, these network tests must pass (from the architecture brief):

1. Direct UDP.
2. UDP blocked, so the call falls back to TCP 7881.
3. Only TCP 443 allowed, so the call goes through TURN/TLS. `getStats()` must show the
   selected candidate type as `relay`.
4. Reconnect after a network flap.

Then run `lk load-test` at 1, 10 and 25 rooms on the real node, and record CPU, egress and
packet loss here. Local Docker Desktop numbers would not be representative, so none are
recorded yet.

## Rollback

Set `VIDEO_ENABLED=false`. The video endpoints return 404 `video_disabled`, the session card
disappears, and every other marketplace flow is unchanged. Stop LiveKit only after active rooms
have drained.
