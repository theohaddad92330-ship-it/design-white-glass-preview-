# Golden-set eval harness (#275)

Deck-parity work (zones, what-to-sell, source tags…) changes prompts, and prompt
changes regress silently. #275 makes a golden-set eval **obligatory** before
merging any such change. This is that harness.

## Layout

| File | Role |
|------|------|
| `golden_eval.py` | Pure, deterministic evaluator: `evaluate(output, expectations) → Report`. No I/O, no API — unit-tested in CI. |
| `golden/*.json` | Per-company expectations (Société Générale = the Skaizen deck reference; Doctolib = small counter-example). |
| `run_eval.py` | CLI: resolve output → normalise (re-apply pipeline enrichment) → score → print grouped report. |
| `judge.py` | Optional semantic LLM-judge (`--judge`, needs `ANTHROPIC_API_KEY`) — is "GBIS → COBOL" *plausible*? |

Checks are grouped (`entities`, `zones`, `what_to_sell`, …). A caller can gate on
a subset — the shipped groups stay green while the next increment's group is red.
That red **is** the spec.

## Run (from `apps/ia`)

```bash
python -m evals.run_eval                                # all goldens vs frozen fixtures
python -m evals.run_eval --company societe-generale     # one company
python -m evals.run_eval --source out.json --company doctolib   # a fresh pipeline output
python -m evals.run_eval --judge                        # + semantic judge (needs API key)
python -m evals.run_eval --require entities,zones       # exit 1 only if these fail (CI gate)
```

`normalize_output()` re-runs the deterministic priority/zone enrichment, so a
stale snapshot is always judged against current code. LLM-produced fields
(`whatToSell`, `stack`) pass through untouched — the harness can't invent them,
which is why `what_to_sell` stays red until the prompt produces it.

## Adding a golden

1. Drop `golden/<slug>.json` (`company`, `slug`, `expect{…}`).
2. Ensure an output exists: the frozen fixture `packages/contracts/.../research.<slug>.json`,
   or pass `--source` a fresh pipeline run.
3. `python -m evals.run_eval --company <slug>`.

Unit tests for the evaluator itself: `tests/test_golden_eval.py`.
