"""Demo-only self-healing: the demo logins are public, so a visitor can change a demo
account's password from the browser. Restoring it is harmless (the password is published)
and keeps the demo usable for the next visitor."""

import httpx

from app.core.config import get_settings
from app.core.errors import NotFound

DEMO_PASSWORD = "demo-password-123"  # noqa: S105 - published demo credential, demo only
DEMO_EMAILS = frozenset(
    {
        "student@demo.gsht",
        "tutor@demo.gsht",
        "tutor2@demo.gsht",
        "applicant@demo.gsht",
        "admin@demo.gsht",
    }
)


async def restore_demo_password(email: str, client: httpx.AsyncClient | None = None) -> None:
    s = get_settings()
    email = email.strip().lower()
    if s.environment != "demo" or email not in DEMO_EMAILS:
        raise NotFound("not a demo account")
    headers = {"apikey": s.supabase_secret_key, "Authorization": f"Bearer {s.supabase_secret_key}"}
    base = f"{s.supabase_url.rstrip('/')}/auth/v1/admin/users"
    own = client is None
    c = client or httpx.AsyncClient(timeout=10, trust_env=False)
    try:
        page = await c.get(base, headers=headers, params={"per_page": 1000})
        page.raise_for_status()
        uid = next((u["id"] for u in page.json()["users"] if u.get("email") == email), None)
        if uid is None:
            raise NotFound("not a demo account")
        r = await c.put(
            f"{base}/{uid}",
            headers=headers,
            json={"password": DEMO_PASSWORD, "email_confirm": True},
        )
        r.raise_for_status()
    finally:
        if own:
            await c.aclose()
