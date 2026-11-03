# Edge change log (what was changed outside the repo, and how to undo it)

## 2026-10-31: router (TP-Link ER605, https://192.168.0.1), authorized by Alex

| Where | Entry | Undo |
|---|---|---|
| Transmission → NAT → Virtual Servers | `GSHT_HTTP` TCP 80 → 192.168.0.137:80 | trash icon on the row |
| same | `GSHT_HTTPS_TURN` TCP 443 → 192.168.0.137:443 | trash icon |
| same | `GSHT_ICE_TCP` TCP 7881 → 192.168.0.137:7881 | trash icon |
| same | `GSHT_MEDIA_UDP` UDP 7882 → 192.168.0.137:7882 | trash icon |
| same | `GSHT_TURN_UDP` UDP 3478 → 192.168.0.137:3478 | trash icon |
| Network → LAN → Address Reservation | `GSHT_media_server` FC-9D-05-07-8B-92 → 192.168.0.137 | trash icon |

Router WAN IP checked on the status page: `24.146.145.204`, the same as the public IP, so there is no double NAT.
Nothing else on the router was touched. The Virtual Server list was empty before this change.

## 2026-10-31: Windows firewall (run by Alex as Administrator)
Five inbound allow rules named `GSHT*` from `infra/edge/firewall.ps1`. Undo: `firewall.ps1 -Remove` (as Administrator).

## 2026-10-31: DNS (Cloudflare, zone lexmakesit.com), with token `CLOUDFLARE_DNS_EDIT_TOKEN` (Doppler api-keys/prd)
- `A rtc.lexmakesit.com → 24.146.145.204`, DNS-only, TTL 300
- `A turn.lexmakesit.com → 24.146.145.204`, DNS-only, TTL 300

Both carry the comment "GSHT video edge". Undo: delete the two records. No other record was touched.

## 2026-11-01: host and edge hardening (branch security-hardening)

- **Containers:**
  - All three edge containers get `mem_limit` and `pids_limit`.
  - Caddy is now `read_only` (tmpfs `/tmp`) and receives only `DOMAIN`/`ACME_EMAIL`, not the
    LiveKit keys.
  - Undo: revert `infra/edge/docker-compose.yml`, `docker compose up -d`.
- **HAProxy flood guard:** connection rate/concurrency caps on 443 and 80.
  - Docker Desktop hides client IPs (all clients appear as the bridge gateway `172.25.0.1`), so
    this is one shared budget, not per IP.
  - Undo: remove the `stick-table`/`tcp-request connection` lines.
- **`infra/edge/harden-host.ps1`** (run as Administrator; `-Undo` reverts):
  - sshd key-only (backup at `sshd_config.gsht-backup`).
  - GSHT firewall rules scoped to the Docker backend program.
  - Node rule limited to LAN + Tailscale.
  - Firewall drop logging.
  - Defender PUA + network protection.
  - Reports disk encryption status.
