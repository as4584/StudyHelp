"""Engine pooling: serverless hosts must not hold a pool (it exhausts the Supabase pooler)."""

import pytest
from sqlalchemy.pool import AsyncAdaptedQueuePool, NullPool

from app.core import db
from app.core.config import get_settings


@pytest.mark.parametrize(("mode", "pool"), [("none", NullPool), ("queue", AsyncAdaptedQueuePool)])
async def test_database_pool_setting_picks_the_pool(
    monkeypatch: pytest.MonkeyPatch, mode: str, pool: type
) -> None:
    monkeypatch.setenv("DATABASE_POOL", mode)
    get_settings.cache_clear()
    await db.reset_engine()
    try:
        assert isinstance(db.get_engine().pool, pool)
    finally:
        await db.reset_engine()
        get_settings.cache_clear()
