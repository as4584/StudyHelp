"""Validate runtime configuration without printing secret values. Exit 1 if invalid."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from pydantic import ValidationError

from app.core.config import Settings

try:
    s = Settings()
except ValidationError as exc:
    print("env-check: INVALID")
    for err in exc.errors():
        print(f"  - {'.'.join(str(p) for p in err['loc']) or 'settings'}: {err['msg']}")
    sys.exit(1)

print(
    "env-check: ok "
    f"(environment={s.environment}, payments={s.payments_provider}, llm={s.llm_provider}, "
    f"translation={s.translation_provider}, storage={s.storage_provider}, "
    f"fee={s.platform_fee_bps / 100}%, secret_key_set={bool(s.supabase_secret_key)})"
)
