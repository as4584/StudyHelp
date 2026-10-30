"""Generate a LiveKit API key/secret pair into infra/video/.env (gitignored).

Prints the matching API settings (server-side only; never NEXT_PUBLIC_*). Refuses to overwrite
an existing .env so a running server's keys aren't silently rotated.
"""

import secrets
import sys
from pathlib import Path

env = Path(__file__).with_name(".env")
if env.exists() and "--force" not in sys.argv:
    sys.exit(f"{env} exists; pass --force to rotate the keys")
key, secret = "API" + secrets.token_hex(6), secrets.token_urlsafe(36)
env.write_text(f"LIVEKIT_KEYS={key}: {secret}\n", encoding="utf-8")
print(f"wrote {env}\nAPI settings:\n  LIVEKIT_API_KEY={key}\n  LIVEKIT_API_SECRET=<in {env.name}>")
