"""Clear demo/test activity before launch, without touching the append-only records.

Usage:
  uv run python scripts/purge_test_data.py                       # dry run: counts only
  uv run python scripts/purge_test_data.py --env demo --yes      # actually delete

Targets accounts whose email ends in a test domain (default: demo.gsht; add more with
--domain). Admin accounts and the business owner's account are never targeted, nor is
anything passed with --keep.

What it does for the targeted accounts, in one transaction:
- deletes requests (and their offers, files, chats, video rooms, reviews, disputes) that
  never had money attached, their AI chats/usage, tutor documents, and pending offers
  they placed on other people's requests;
- suspends the accounts, so whatever has to stay (below) drops out of every feed.

What it deliberately does NOT do: payment_events, audit_logs and policy_acceptances are
append-only (database triggers). Requests that ever had a payment or tip are tied to the
payment ledger, and accounts that accepted a policy are tied to policy_acceptances, so those
rows stay. The script reports them; it never truncates or disables triggers to get around
that. Files in storage buckets are not removed either.

Deleting needs BOTH --yes and --env equal to the configured ENVIRONMENT, so a command
copied between machines cannot wipe the wrong database.
"""

# S608: the SQL below is composed only from the constant fragments in this file; every value
# (account ids) is a bound :ids parameter, never interpolated.
# ruff: noqa: S608

import argparse
import asyncio
import sys
from dataclasses import dataclass, field
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.db import get_sessionmaker, reset_engine

ALWAYS_KEEP = frozenset({"ed@globalstudyhelptutor.com"})
DEFAULT_DOMAINS = ("demo.gsht",)


@dataclass
class Plan:
    accounts: list[str] = field(default_factory=list)
    counts: dict[str, int] = field(default_factory=dict)
    kept: dict[str, int] = field(default_factory=dict)


async def _targets(db: AsyncSession, domains: list[str], keep: set[str]) -> list[tuple[str, str]]:
    rows = (
        await db.execute(
            text(
                "select p.id::text, lower(u.email) from profiles p join auth.users u on u.id = p.id"
                " where p.role <> 'admin'"
            )
        )
    ).all()
    out = []
    for uid, email in rows:
        if not email or email in keep:
            continue
        if any(email.endswith("@" + d.lower().lstrip("@")) for d in domains):
            out.append((uid, email))
    return out


# Requests posted by a targeted student that never had money attached.
_FREE_TASKS = (
    "select t.id from tasks t where t.student_id::text = any(:ids)"
    " and not exists (select 1 from payments p where p.task_id = t.id)"
    " and not exists (select 1 from tips x where x.task_id = t.id)"
)
_MONEY_TASKS = (
    "select t.id from tasks t where t.student_id::text = any(:ids)"
    " and (exists (select 1 from payments p where p.task_id = t.id)"
    " or exists (select 1 from tips x where x.task_id = t.id))"
)
_STRAY_BIDS = (
    "select b.id from bids b where b.tutor_id::text = any(:ids) and b.status <> 'accepted'"
    " and b.task_id not in (" + _FREE_TASKS + ")"
    " and not exists (select 1 from tasks t where t.accepted_bid_id = b.id)"
)

COUNTS = {
    "requests": f"select count(*) from ({_FREE_TASKS}) s",
    "offers on other requests": f"select count(*) from ({_STRAY_BIDS}) s",
    "ai chats": "select count(*) from ai_chats where user_id::text = any(:ids)",
    "ai usage rows": "select count(*) from ai_usage where user_id::text = any(:ids)",
    "tutor documents": "select count(*) from tutor_documents where tutor_id::text = any(:ids)",
    "accounts to suspend": "select count(*) from profiles where id::text = any(:ids) and is_active",
}
KEPT = {
    "requests with payment history (ledger)": f"select count(*) from ({_MONEY_TASKS}) s",
    "accounts with policy acceptances": "select count(distinct user_id) from"
    " policy_acceptances where user_id::text = any(:ids)",
}

DELETES = [
    f"delete from reviews where task_id in ({_FREE_TASKS})",
    f"delete from disputes where task_id in ({_FREE_TASKS})",
    f"update tasks set accepted_bid_id = null where id in ({_FREE_TASKS})",
    f"delete from tasks where id in ({_FREE_TASKS})",  # cascades: bids, files, chats, video
    f"delete from bids where id in ({_STRAY_BIDS})",
    "delete from ai_chats where user_id::text = any(:ids)",  # cascades ai_messages
    "delete from ai_usage where user_id::text = any(:ids)",
    "delete from tutor_documents where tutor_id::text = any(:ids)",
    "update profiles set is_active = false where id::text = any(:ids)",
]


async def plan(db: AsyncSession, domains: list[str], keep: set[str]) -> tuple[Plan, list[str]]:
    targets = await _targets(db, domains, keep)
    ids = [uid for uid, _ in targets]
    p = Plan(accounts=sorted(email for _, email in targets))
    for name, sql in COUNTS.items():
        p.counts[name] = int(await db.scalar(text(sql), {"ids": ids}) or 0)
    for name, sql in KEPT.items():
        p.kept[name] = int(await db.scalar(text(sql), {"ids": ids}) or 0)
    return p, ids


async def purge(db: AsyncSession, ids: list[str]) -> None:
    for sql in DELETES:
        await db.execute(text(sql), {"ids": ids})
    await db.commit()


def _print(p: Plan, dry: bool) -> None:
    print(("DRY RUN - nothing deleted" if dry else "DELETED") + f" ({len(p.accounts)} accounts)")
    for email in p.accounts:
        print(f"  account  {email}")
    for name, n in p.counts.items():
        print(f"  {'would remove' if dry else 'removed':12} {n:5}  {name}")
    for name, n in p.kept.items():
        print(f"  {'left as is':12} {n:5}  {name} (append-only; account suspended instead)")


async def run(argv: list[str]) -> int:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--domain", action="append", help="test email domain (repeatable)")
    ap.add_argument("--keep", action="append", default=[], help="email never to touch")
    ap.add_argument("--env", help="must equal the configured ENVIRONMENT to delete")
    ap.add_argument("--yes", action="store_true", help="really delete (default: dry run)")
    args = ap.parse_args(argv)
    env = get_settings().environment
    if args.yes and args.env != env:
        print(f"refusing: --env must be given and equal the configured ENVIRONMENT ({env!r})")
        return 2
    keep = {e.lower() for e in args.keep} | ALWAYS_KEEP
    domains = args.domain or list(DEFAULT_DOMAINS)
    async with get_sessionmaker()() as db:
        p, ids = await plan(db, domains, keep)
        if args.yes and ids:
            await purge(db, ids)
    _print(p, dry=not args.yes)
    return 0


async def _main() -> int:
    try:
        return await run(sys.argv[1:])
    finally:
        await reset_engine()


if __name__ == "__main__":
    raise SystemExit(asyncio.run(_main()))
