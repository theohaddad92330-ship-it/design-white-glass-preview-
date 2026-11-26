"""#3382 — le registre des contradictions, côté runtime Laura.

Parité JSON ↔ Python (le miroir ne diverge pas du registre TypeScript) et
preuve de branchement : les décisions arrivent dans le prompt du copilote, pas
seulement dans un fichier que personne ne lit.
"""

from __future__ import annotations

import json
from pathlib import Path

from app.knowledge import method_contradictions
from app.prompts.bellum_advisor import build_system_prompt

SHARED = (
    Path(__file__).resolve().parents[3]
    / "packages"
    / "contracts"
    / "src"
    / "schemas"
    / "method-contradictions.runtime.json"
)


def _shared() -> list[dict]:
    return json.loads(SHARED.read_text(encoding="utf-8"))


def test_python_mirror_carries_the_same_decisions_as_the_typescript_registry():
    expected = {
        entry["contradiction_id"]: [
            (d["channels"], d["condition"], d["decision"]) for d in entry["decisions"]
        ]
        for entry in _shared()
    }
    got = {
        c.contradiction_id: [(list(d.channels), d.condition, d.decision) for d in c.decisions]
        for c in method_contradictions.METHOD_CONTRADICTIONS
    }
    assert got == expected


def test_the_guard_knows_how_to_say_no_a_dropped_decision_is_detected():
    shared = _shared()
    shared[0]["decisions"] = shared[0]["decisions"][:1]
    expected = {e["contradiction_id"]: len(e["decisions"]) for e in shared}
    got = {c.contradiction_id: len(c.decisions) for c in method_contradictions.METHOD_CONTRADICTIONS}
    assert got != expected


def test_block_renders_every_decision_with_its_condition():
    block = method_contradictions.render_block()
    for contradiction in method_contradictions.METHOD_CONTRADICTIONS:
        assert contradiction.title in block
        for decision in contradiction.decisions:
            assert decision.decision in block
            if decision.condition:
                assert decision.condition in block


def test_block_forbids_picking_a_side_at_random():
    block = method_contradictions.render_block()
    assert "tu ne tranches jamais au hasard" in block
    assert "sans décision écrite" in block


def test_the_decisions_reach_laura_prompt():
    prompt = build_system_prompt({}, {}, "", "")
    assert method_contradictions.render_block() in prompt
