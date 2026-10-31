"""Targeted mutation testing: every critical rule must be guarded by a test that fails.

Applies one textual mutant at a time from tests/mutants.toml, runs the test suite, restores
the file byte-for-byte, and fails if any mutant survives (a surviving mutant = a missing test).

  uv run python scripts/mutate.py            # all mutants
  uv run python scripts/mutate.py video      # only mutants whose file path contains "video"
"""

import subprocess
import sys
import tomllib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
# uv from PATH, exactly as scripts/check runs it.
PYTEST = ["uv", "run", "--frozen", "pytest", "-q", "-x", "-p", "no:cacheprovider", "tests"]


def main() -> int:
    only = sys.argv[1] if len(sys.argv) > 1 else ""
    spec = tomllib.loads((ROOT / "tests" / "mutants.toml").read_text(encoding="utf-8"))
    mutants = [m for m in spec["mutant"] if only in m["file"]]
    survivors = []
    for m in mutants:
        path = ROOT / m["file"]
        src = path.read_bytes()
        text = src.decode()
        if text.count(m["old"]) != 1:
            print(f"STALE    {m['file']}: pattern not found exactly once: {m['old'][:60]!r}")
            survivors.append(m)
            continue
        path.write_bytes(text.replace(m["old"], m["new"]).encode())
        try:
            r = subprocess.run(  # noqa: S603  (fixed argv, no shell)
                PYTEST,
                cwd=ROOT,
                capture_output=True,
                text=True,
                check=False,
            )
        finally:
            path.write_bytes(src)
        killed = r.returncode != 0
        print(("KILLED  " if killed else "SURVIVED"), m["file"], "|", m["why"])
        if not killed:
            survivors.append(m)
    print(f"\n{len(mutants) - len(survivors)}/{len(mutants)} mutants killed")
    return 1 if survivors else 0


if __name__ == "__main__":
    sys.exit(main())
