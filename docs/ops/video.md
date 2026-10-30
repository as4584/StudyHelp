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

## Production edge: DECIDED, option A (2026-10-30)

Alex chose to self-host with **no outside services**:
- The home server is on a wired connection to the router, and Alex has router access.
- Public IPv4 is `24.146.145.204`. It is not CGNAT, but it still has to be confirmed against
  the WAN IP the router shows.
- PC LAN address: `192.168.0.137`.

`infra/edge/` (Docker Desktop):
- **HAProxy 3.2.26** does an SNI split on 443: `turn.*` goes to LiveKit TURN/TLS, everything
  else to Caddy.
- **Caddy 2.11.7** serves the Let's Encrypt certificates and `rtc.*` WSS.
- **LiveKit 1.13.11** sends all UDP media over a **single port (mux, 7882)**, with embedded
  TURN.

Router port forwards, all to `192.168.0.137`, and nothing else:

| Protocol | Port | Purpose |
|---|---|---|
| TCP | 80 | certificate issuance and renewal (HTTP-01) |
| TCP | 443 | HTTPS/WSS signaling plus TURN/TLS |
| TCP | 7881 | ICE/TCP fallback |
| UDP | 7882 | media |
| UDP | 3478 | TURN/UDP |

### Bring-up order
1. Router: give the PC a **DHCP reservation** for `192.168.0.137` and add the 5 forwards above.
   Check the router's WAN IP: it must equal the public IP (otherwise there's a second NAT in
   front of us).
2. `infra/edge/firewall.ps1`, run as Administrator.
3. DNS: `A rtc` and `A turn` → public IP, **DNS-only** (not proxied).
4. `python infra/edge/render.py --domain <domain> --email <email>`, then
   `docker compose -f infra/edge/docker-compose.yml up -d`.
5. From a phone **on cellular** (not home Wi-Fi), run the network tests below.

### Keeping the IP stable
Residential IPs are dynamic but usually last for months.
- `render.py` re-detects the IP and refuses private or CGNAT addresses.
- If the IP changes: re-run it, then restart livekit and update the two A records.
- A static IP from the ISP removes that step entirely.

## Production edge: background on the options

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
