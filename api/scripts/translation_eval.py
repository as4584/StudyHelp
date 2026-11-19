"""Measure chat translation quality and speed against the parallel corpus.

    uv run python scripts/translation_eval.py --model qwen3:8b [--pairs en|all] [--out FILE]

For every direction (source -> target) and every corpus row it translates the source text,
then scores it against the reference with chrF (character n-gram F-score, 0-100; higher is
better) and records guard failures (the provider refused its own output) and latency.
The source language is NOT given to the model: people don't always type in their profile
language, so detection has to work.
"""

import argparse
import asyncio
import json
import statistics
import sys
import time
from collections import Counter, defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.config import Settings
from app.providers.translation import TranslationError
from app.providers.translation.ollama import LANGUAGE_NAMES, OllamaTranslationProvider

CORPUS = Path(__file__).resolve().parents[1] / "evals" / "translation_corpus.json"


def _ngrams(s: str, n: int) -> Counter[str]:
    s = " ".join(s.split())
    return Counter(s[i : i + n] for i in range(len(s) - n + 1))


def chrf(hyp: str, ref: str, max_n: int = 6, beta: float = 2.0) -> float:
    precs, recs = [], []
    for n in range(1, max_n + 1):
        h, r = _ngrams(hyp, n), _ngrams(ref, n)
        if not h or not r:
            continue
        overlap = sum((h & r).values())
        precs.append(overlap / sum(h.values()))
        recs.append(overlap / sum(r.values()))
    if not precs:
        return 0.0
    p, r = statistics.mean(precs), statistics.mean(recs)
    if p + r == 0:
        return 0.0
    return 100 * (1 + beta**2) * p * r / (beta**2 * p + r)


async def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", required=True)
    ap.add_argument("--pairs", choices=["en", "all"], default="en")
    ap.add_argument("--base-url", default="http://127.0.0.1:11434")
    ap.add_argument("--timeout", type=float, default=60)
    ap.add_argument("--out")
    ap.add_argument("--mode", choices=["reference", "roundtrip"], default="reference")
    ap.add_argument("--langs", help="comma-separated codes for roundtrip (default: all)")
    args = ap.parse_args()

    rows = json.loads(CORPUS.read_text(encoding="utf-8"))["rows"]
    langs = list(LANGUAGE_NAMES)
    if args.pairs == "en":
        pairs = [(lang, "en") for lang in langs if lang != "en"]
        pairs += [("en", lang) for lang in langs if lang != "en"]
    else:
        pairs = [(a, b) for a in langs for b in langs if a != b]

    settings = Settings(
        translation_provider="ollama",
        translation_ollama_model=args.model,
        ollama_base_url=args.base_url,
        translation_timeout_s=args.timeout,
    )
    tr = OllamaTranslationProvider(settings)
    await tr.translate("warm up", source=None, target="es")  # load the model once
    if args.mode == "roundtrip":
        await roundtrip(tr, rows, args)
        return

    results = []
    for src, tgt in pairs:
        for row in rows:
            t0 = time.perf_counter()
            try:
                out = await tr.translate(row[src], source=None, target=tgt)
                err = None
            except TranslationError as exc:
                out, err = "", str(exc)
            ms = round((time.perf_counter() - t0) * 1000)
            score = chrf(out, row[tgt]) if out else 0.0
            results.append(
                {
                    "src": src,
                    "tgt": tgt,
                    "id": row["id"],
                    "tags": row["tags"],
                    "ms": ms,
                    "chrf": round(score, 1),
                    "error": err,
                    "out": out,
                    "ref": row[tgt],
                }
            )
            print(f"{src}->{tgt} {row['id']:<10} {score:5.1f} {ms:5d}ms {err or ''}", flush=True)

    by_dir: dict[str, list[dict]] = defaultdict(list)  # type: ignore[type-arg]
    for r in results:
        by_dir[f"{r['src']}->{r['tgt']}"].append(r)
    print("\ndirection   chrF  fails  p50ms  p95ms")
    for d, rs in sorted(by_dir.items(), key=lambda kv: statistics.mean(x["chrf"] for x in kv[1])):
        ms = sorted(x["ms"] for x in rs)
        print(
            f"{d:<10} {statistics.mean(x['chrf'] for x in rs):5.1f}"
            f" {sum(1 for x in rs if x['error']):5d}"
            f" {ms[len(ms) // 2]:6d} {ms[int(len(ms) * 0.95) - 1]:6d}"
        )
    all_ms = sorted(x["ms"] for x in results)
    print(
        f"\nOVERALL chrF {statistics.mean(x['chrf'] for x in results):.1f}  "
        f"failures {sum(1 for x in results if x['error'])}/{len(results)}  "
        f"p50 {all_ms[len(all_ms) // 2]}ms  p95 {all_ms[int(len(all_ms) * 0.95) - 1]}ms"
    )
    if args.out:
        save(args.out, results)


def save(path: str, results: list[dict]) -> None:  # type: ignore[type-arg]
    Path(path).write_text(json.dumps(results, ensure_ascii=False, indent=1), encoding="utf-8")


async def roundtrip(
    tr: OllamaTranslationProvider,
    rows: list[dict],  # type: ignore[type-arg]
    args: argparse.Namespace,
) -> None:
    """English -> X -> English, scored against the English original. Needs no references in X,
    so any language can be screened. Both legs must also pass the provider's guards."""
    from app.providers.translation.languages import LANGUAGES

    codes = args.langs.split(",") if args.langs else [c for c in LANGUAGES if c != "en"]
    summary, results = [], []
    for code in codes:
        scores, fails, ms = [], 0, []
        for row in rows:
            t0 = time.perf_counter()
            try:
                there = await tr.translate(row["en"], source="en", target=code)
                back = await tr.translate(there, source=code, target="en")
                score, err = chrf(back, row["en"]), None
            except TranslationError as exc:
                there = back = ""
                score, err = 0.0, str(exc)
                fails += 1
            ms.append(round((time.perf_counter() - t0) * 500))  # per leg
            scores.append(score)
            results.append(
                {
                    "lang": code,
                    "id": row["id"],
                    "chrf": round(score, 1),
                    "error": err,
                    "there": there,
                    "back": back,
                }
            )
        mean = statistics.mean(scores)
        summary.append((code, mean, fails, sorted(ms)[len(ms) // 2]))
        print(
            f"{code:<4} {LANGUAGES[code].name:<20} roundtrip chrF {mean:5.1f}  fails {fails:2d}"
            f"  p50/leg {sorted(ms)[len(ms) // 2]}ms",
            flush=True,
        )
    print("\nRANKED (worst first)")
    for code, mean, fails, p50 in sorted(summary, key=lambda x: x[1]):
        print(f"{code:<4} {mean:5.1f}  fails {fails}  {p50}ms")
    if args.out:
        save(args.out, results)


if __name__ == "__main__":
    asyncio.run(main())
