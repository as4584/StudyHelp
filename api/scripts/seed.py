"""Deterministic demo data: real Supabase Auth accounts + profiles. Idempotent.

Usage: uv run python scripts/seed.py [--reset]
Requires SUPABASE_URL, SUPABASE_SECRET_KEY and DATABASE_URL (local or demo project only).
"""

import asyncio
import sys
from datetime import date
from pathlib import Path

import httpx

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.db import get_sessionmaker, reset_engine
from app.services.policies import POLICIES, VERSIONS

DEMO_PASSWORD = "demo-password-123"  # noqa: S105 - published demo credential, local/demo only

ACCOUNTS = [
    # email, role, display name, language, tutor status
    ("student@demo.gsht", "student", "Maya Chen", "en", None),
    ("tutor@demo.gsht", "tutor", "Prof. Diego Ramírez", "es", "approved"),
    ("tutor2@demo.gsht", "tutor", "Dr. Aisha Bello", "en", "approved"),
    ("applicant@demo.gsht", "tutor", "Ravi Kumar", "hi", "pending"),
    ("admin@demo.gsht", "admin", "Jordan Ellis", "en", None),
]


async def ensure_auth_user(client: httpx.AsyncClient, email: str) -> str:
    s = get_settings()
    headers = {"apikey": s.supabase_secret_key, "Authorization": f"Bearer {s.supabase_secret_key}"}
    base = f"{s.supabase_url.rstrip('/')}/auth/v1/admin/users"
    r = await client.post(
        base,
        headers=headers,
        json={"email": email, "password": DEMO_PASSWORD, "email_confirm": True},
    )
    if r.status_code in (200, 201):
        return str(r.json()["id"])
    # Already exists: find it.
    page = await client.get(base, headers=headers, params={"per_page": 1000})
    page.raise_for_status()
    for u in page.json()["users"]:
        if u["email"] == email:
            return str(u["id"])
    raise RuntimeError(f"could not create or find {email}: {r.status_code} {r.text}")


async def prune_non_demo_users(client: httpx.AsyncClient, db: AsyncSession) -> int:
    """--reset only: remove accounts created by test runs so the demo shows the real cast."""
    s = get_settings()
    headers = {"apikey": s.supabase_secret_key, "Authorization": f"Bearer {s.supabase_secret_key}"}
    base = f"{s.supabase_url.rstrip('/')}/auth/v1/admin/users"
    page = await client.get(base, headers=headers, params={"per_page": 1000})
    page.raise_for_status()
    keep = {email for email, *_ in ACCOUNTS}
    removed = 0
    for u in page.json()["users"]:
        if u.get("email") in keep:
            continue
        await db.execute(text("delete from profiles where id = :id"), {"id": u["id"]})
        await db.commit()
        r = await client.delete(f"{base}/{u['id']}", headers=headers)
        r.raise_for_status()
        removed += 1
    return removed


async def main(reset: bool) -> None:
    s = get_settings()
    if s.environment == "production":
        raise SystemExit("refusing to seed production")
    async with httpx.AsyncClient(timeout=10) as client, get_sessionmaker()() as db:
        if reset:
            await db.execute(
                text(
                    "truncate audit_logs, ai_usage, ai_messages, ai_chats, disputes, reviews, "
                    "message_translations, messages, conversations, subscriptions, transfers, "
                    "payment_events, provider_events, tips, payments, bids, task_files, tasks, "
                    "tutor_documents, policy_acceptances restart identity cascade"
                )
            )
            await db.commit()
            print(f"pruned {await prune_non_demo_users(client, db)} non-demo accounts")
        for email, role, name, lang, tstatus in ACCOUNTS:
            uid = await ensure_auth_user(client, email)
            await db.execute(
                text(
                    "insert into profiles(id, role, display_name, preferred_language) "
                    "values (:id, :role, :name, :lang) on conflict (id) do update set "
                    "role = excluded.role, display_name = excluded.display_name, "
                    "preferred_language = excluded.preferred_language, is_active = true"
                ),
                {"id": uid, "role": role, "name": name, "lang": lang},
            )
            if tstatus:
                await db.execute(
                    text(
                        "insert into tutor_profiles(user_id, bio, subjects, years_experience,"
                        " hourly_rate_cents, status) values (:id, :bio, :subjects, 10, 1800, :st)"
                        " on conflict (user_id) do update set status = excluded.status,"
                        " subjects = excluded.subjects, years_experience = 10,"
                        " bio = excluded.bio, payouts_enabled = false,"
                        " stripe_account_id = null, rating_avg = 0, rating_count = 0"
                    ),
                    {
                        "id": uid,
                        "st": tstatus,
                        "subjects": ["Calculus", "Physics"],
                        "bio": "10 years teaching university calculus and physics.",
                    },
                )
            if role in POLICIES:
                # Demo accounts have already accepted their policy (Maya is an adult student).
                policy = POLICIES[role][0]
                await db.execute(
                    text("update profiles set date_of_birth = :dob where id = :id"),
                    {"id": uid, "dob": date(2004, 3, 14) if role == "student" else None},
                )
                await db.execute(
                    text(
                        "insert into policy_acceptances(user_id, policy, policy_version,"
                        " accepted_by, full_name, email) values (:id, :p, :v, 'user', :n, :e)"
                        " on conflict do nothing"
                    ),
                    {"id": uid, "p": policy, "v": VERSIONS[policy], "n": name, "e": email},
                )
            print(f"seeded {role:8} {email}")
        await db.commit()
    await reset_engine()
    print(f"password for all demo accounts: {DEMO_PASSWORD}")


if __name__ == "__main__":
    asyncio.run(main("--reset" in sys.argv))
