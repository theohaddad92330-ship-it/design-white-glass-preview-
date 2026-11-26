"""Plafond de coût du job promptfoo (.github/scripts/promptfoo-cost.py) : il doit savoir dire NON."""

from __future__ import annotations

import importlib.util
import json
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[3] / ".github" / "scripts" / "promptfoo-cost.py"
spec = importlib.util.spec_from_file_location("promptfoo_cost", SCRIPT)
assert spec and spec.loader
cost = importlib.util.module_from_spec(spec)
spec.loader.exec_module(cost)


def _write(tmp_path: Path, name: str, prompt: int, completion: int) -> Path:
    path = tmp_path / name
    path.write_text(
        json.dumps({"results": {"stats": {"tokenUsage": {"prompt": prompt, "completion": completion}}}}),
        encoding="utf-8",
    )
    return path


def test_under_the_cap_passes(tmp_path, monkeypatch, capsys):
    monkeypatch.delenv("PROMPTFOO_MAX_COST_USD", raising=False)
    f = _write(tmp_path, "a.json", 100_000, 10_000)  # 0,30 + 0,15 = 0,45 $
    assert cost.main([str(f)]) == 0
    assert "0.4500" in capsys.readouterr().out


def test_over_the_cap_fails(tmp_path, monkeypatch):
    monkeypatch.setenv("PROMPTFOO_MAX_COST_USD", "0.40")
    f = _write(tmp_path, "a.json", 100_000, 10_000)
    assert cost.main([str(f)]) == 1


def test_sums_every_file(tmp_path, monkeypatch):
    monkeypatch.delenv("PROMPTFOO_MAX_COST_USD", raising=False)
    files = [str(_write(tmp_path, f"{i}.json", 400_000, 40_000)) for i in range(2)]  # 2 x 1,80 $
    assert cost.main(files) == 1


def test_unmeasured_is_named_not_zero(tmp_path, capsys):
    assert cost.main([str(tmp_path / "absent.json")]) == 0
    assert "non mesuré" in capsys.readouterr().out


def test_falls_back_to_per_row_usage(tmp_path, monkeypatch):
    monkeypatch.setenv("PROMPTFOO_MAX_COST_USD", "0.01")
    path = tmp_path / "r.json"
    path.write_text(
        json.dumps({"results": {"results": [{"response": {"tokenUsage": {"prompt": 50_000, "completion": 0}}}]}}),
        encoding="utf-8",
    )
    assert cost.main([str(path)]) == 1
