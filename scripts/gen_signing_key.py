"""Generate a local ES256 JWT signing key for the local Supabase stack.

The Supabase CLI's `gen signing-key` fails when the configured file is absent,
so we write the JWK array format it expects ourselves. Output is gitignored.
"""

import base64
import json
import sys
import uuid
from pathlib import Path

from cryptography.hazmat.primitives.asymmetric import ec


def b64(n: int) -> str:
    return base64.urlsafe_b64encode(n.to_bytes(32, "big")).rstrip(b"=").decode()


def main(path: str) -> None:
    key = ec.generate_private_key(ec.SECP256R1())
    pub = key.public_key().public_numbers()
    jwk = {
        "kty": "EC",
        "kid": str(uuid.uuid4()),
        "use": "sig",
        "key_ops": ["sign", "verify"],
        "alg": "ES256",
        "ext": True,
        "crv": "P-256",
        "x": b64(pub.x),
        "y": b64(pub.y),
        "d": b64(key.private_numbers().private_value),
    }
    Path(path).write_text(json.dumps([jwk], indent=2))
    print(f"wrote ES256 key {jwk['kid']} to {path}")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "infra/supabase/signing_keys.json")
