# Translation eval log

Self-hosted model via Ollama (no per-message cost). Re-run with
`uv run python scripts/translation_eval.py --model <m> [--pairs en|all] [--mode roundtrip]`.
chrF is 0-100 (higher is better). "Fails" are outputs the guards refused; chat then shows
the original message, so a fail is safe but untranslated.

## 2026-11-19 — reference corpus (13 messages x 7 languages)

| Round | Model | Change | chrF | Fails | p50 |
|---|---|---|---|---|---|
| 1 | qwen3:8b | baseline prompt | 75.1 | 6/156 | 145 ms |
| 2 | qwen3:8b | message framed as data + worked examples; formulas protected | 75.1 | 7/156 | 146 ms |
| 3 | qwen3:8b | fixed example leaking Chinese; month/digit checks | 79.2 | 0/156 | 147 ms |
| 3 | qwen3.6:27b | same prompt, larger model | 85.6 | 0/156 | 1027 ms |
| 3 | qwen3.6:27b | all 42 directions | 79.8 | 1/546 | 1092 ms |

## 2026-11-19 — round-trip screen (English -> X -> English), qwen3.6:27b

Round 2 folded native digits (१५, ۱۵, ১৫) before the number check; round 3 added the
unchanged-output retry and CJK ordinal leniency.

Enabled at >= 75 with <= 1 fail (Korean 72 enabled after reading outputs: correct but
paraphrased casual speech):

it 94.1 · sv 93.4 · es 93.2 · de 92.9 · fr 91.9 · pt 91.5 · nl 90.8 · ms 90.5 · ht 89.6 ·
ur 89.3 · el 88.9 · pl 88.7 · he 88.2 · gu 88.1 · tl 87.8 · cs 87.6 · ne 87.3 · ru 87.1 ·
ar 86.8 · pa 86.4 · th 86.4 · hi 86.2 · kn 85.0 · zh 84.4 · bn 84.3 · ml 84.2 · ro 84.2 ·
mr 83.4 · hy 83.0 · uk 82.9 · id 82.2 · fa 82.0 · te 81.9 · hu 81.8 · si 81.7 · km 81.5 ·
vi 80.3 · ta 79.4 · tr 78.4 · sw 76.0 · ka 75.5 · ko 72.0

Off (too weak today): ja 61.3 (2 fails) · so 63.1 · ig 66.5 · ha 69.3 · yo 70.2 ·
my 72.5 · zu 72.6 (1 fail) · am 73.9

## Next ideas
- Japanese: per-language worked examples; try a dedicated translation model.
- African languages: test a model trained for them (e.g. NLLB-style) behind the same guards.
