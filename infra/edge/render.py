"""Prepare the edge: create .env (keys, domain, public IP) and render livekit.yaml.

  python render.py --domain lexmakesit.com --email you@example.com   # first time
  python render.py                                                    # re-render (e.g. new IP)

Both outputs are gitignored. Keys are generated once and never printed.
"""

import argparse
import ipaddress
import secrets
import urllib.request
from pathlib import Path

HERE = Path(__file__).parent
ENV = HERE / ".env"


def public_ip() -> str:
    with urllib.request.urlopen("https://api.ipify.org", timeout=10) as r:  # noqa: S310
        ip = r.read().decode().strip()
    addr = ipaddress.ip_address(ip)
    if addr.is_private or addr in ipaddress.ip_network("100.64.0.0/10"):
        raise SystemExit(f"{ip} is private/CGNAT: inbound media cannot reach this network")
    return ip


def load() -> dict[str, str]:
    if not ENV.exists():
        return {}
    pairs = (line.split("=", 1) for line in ENV.read_text().splitlines() if "=" in line)
    return {k: v for k, v in pairs}


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--domain")
    ap.add_argument("--email")
    ap.add_argument("--ip", help="public IPv4 (default: detect)")
    a = ap.parse_args()
    env = load()
    if a.domain:
        env["DOMAIN"] = a.domain
    if a.email:
        env["ACME_EMAIL"] = a.email
    if "DOMAIN" not in env or "ACME_EMAIL" not in env:
        raise SystemExit("first run needs --domain and --email")
    env["PUBLIC_IP"] = a.ip or public_ip()
    if "LIVEKIT_KEYS" not in env:
        env["LIVEKIT_KEYS"] = f"API{secrets.token_hex(6)}: {secrets.token_urlsafe(36)}"
    ENV.write_text("".join(f"{k}={v}\n" for k, v in env.items()), encoding="utf-8")
    tmpl = (HERE / "livekit.yaml.tmpl").read_text(encoding="utf-8")
    out = tmpl.replace("${DOMAIN}", env["DOMAIN"]).replace("${PUBLIC_IP}", env["PUBLIC_IP"])
    (HERE / "livekit.yaml").write_text(out, encoding="utf-8")
    d = env["DOMAIN"]
    print(f"rendered livekit.yaml for rtc.{d} / turn.{d} -> {env['PUBLIC_IP']}")
    print("DNS (DNS-only, not proxied): A rtc  ->", env["PUBLIC_IP"], "| A turn ->", env["PUBLIC_IP"])


if __name__ == "__main__":
    main()
