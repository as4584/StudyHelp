"""Alembic round-trip on a scratch database: upgrade -> downgrade -> upgrade must succeed."""

import asyncio
from pathlib import Path

import asyncpg
from alembic import command
from alembic.config import Config

from tests.conftest import ADMIN_URL

SCRATCH = "gsht_migcheck"


async def test_upgrade_downgrade_upgrade() -> None:
    admin = await asyncpg.connect(ADMIN_URL)
    await admin.execute(f"drop database if exists {SCRATCH}")
    await admin.execute(f"create database {SCRATCH}")
    await admin.close()
    url = ADMIN_URL.rsplit("/", 1)[0] + f"/{SCRATCH}"
    conn = await asyncpg.connect(url)
    await conn.execute((Path(__file__).parents[1] / "supabase_stub.sql").read_text())
    await conn.close()

    root = Path(__file__).parents[2]
    cfg = Config(str(root / "alembic.ini"))
    cfg.set_main_option("script_location", str(root / "alembic"))
    cfg.attributes["database_url"] = url.replace("postgresql://", "postgresql+asyncpg://")
    await asyncio.to_thread(command.upgrade, cfg, "head")
    await asyncio.to_thread(command.downgrade, cfg, "base")
    conn = await asyncpg.connect(url)
    leftover = await conn.fetchval(
        "select count(*) from information_schema.tables where table_schema='public' "
        "and table_name <> 'alembic_version'"
    )
    await conn.close()
    assert leftover == 0
    await asyncio.to_thread(command.upgrade, cfg, "head")

    admin = await asyncpg.connect(ADMIN_URL)
    await admin.execute(f"drop database if exists {SCRATCH} with (force)")
    await admin.close()
