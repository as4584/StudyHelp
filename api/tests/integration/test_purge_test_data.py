"""The pre-launch purge: dry run by default, guarded deletes, append-only rows respected."""

import importlib.util
import uuid
from pathlib import Path

from app.core.config import get_settings
from tests.conftest import Flow, UserFactory

_spec = importlib.util.spec_from_file_location(
    "purge_test_data", Path(__file__).resolve().parents[2] / "scripts" / "purge_test_data.py"
)
assert _spec and _spec.loader
purge = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(purge)

# Test accounts get emails ending in "@t".
ARGS = ["--domain", "t"]


async def _counts(db, task_ids: list[str]) -> dict[str, int]:  # type: ignore[no-untyped-def]
    ids = [uuid.UUID(t) for t in task_ids]
    return {
        "tasks": await db.fetchval("select count(*) from tasks where id = any($1)", ids),
        "events": await db.fetchval("select count(*) from payment_events"),
        "policies": await db.fetchval("select count(*) from policy_acceptances"),
    }


async def test_purge_is_a_dry_run_unless_told_and_guards_the_environment(
    flow: Flow, db, capsys
) -> None:  # type: ignore[no-untyped-def]
    free = await flow.post_task()
    before = await _counts(db, [free])
    assert await purge.run(ARGS) == 0
    assert "DRY RUN" in capsys.readouterr().out
    assert await _counts(db, [free]) == before
    # --yes alone, or with the wrong environment name, deletes nothing.
    for extra in (["--yes"], ["--yes", "--env", "production"]):
        assert await purge.run([*ARGS, *extra]) == 2
    assert await _counts(db, [free]) == before


async def test_purge_clears_test_activity_and_keeps_ledger_admin_and_owner(
    flow: Flow, make_user: UserFactory, db
) -> None:  # type: ignore[no-untyped-def]
    admin = await make_user("admin")
    owner = await make_user("student")
    await db.execute(
        "update auth.users set email = 'ed@globalstudyhelptutor.com' where id = $1",
        uuid.UUID(str(owner.id)),
    )
    free = await flow.post_task()
    await flow.client.post("/ai/chats", headers=flow.student.h, json={"subject": "Math"})
    paid = (await flow.to("paid")).task_id
    events_before = await db.fetchval("select count(*) from payment_events")
    policies_before = await db.fetchval("select count(*) from policy_acceptances")

    env = get_settings().environment
    assert await purge.run([*ARGS, "--yes", "--env", env]) == 0

    left = {str(r["id"]) for r in await db.fetch("select id from tasks")}
    assert free not in left  # no money attached: gone
    assert paid in left  # tied to the append-only payment ledger: kept
    assert await db.fetchval("select count(*) from ai_chats") == 0
    assert await db.fetchval("select count(*) from payment_events") == events_before
    assert await db.fetchval("select count(*) from policy_acceptances") == policies_before
    active = {
        str(r["id"]): r["is_active"] for r in await db.fetch("select id, is_active from profiles")
    }
    assert active[str(flow.student.id)] is False and active[str(flow.tutor.id)] is False
    assert active[str(admin.id)] is True and active[str(owner.id)] is True
