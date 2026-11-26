"""#3670.1 / #3670.5 — couverture méthode ↔ situation : preuve ou « à vérifier »."""

from __future__ import annotations

from pathlib import Path

from app.knowledge.method_packs import METHOD_PACK_RULES
from app.knowledge.method_situation_coverage import (
    METHOD_CONSUMERS,
    OUTPUT_FORMAT_BY_INTENT,
    SITUATION_COVERAGE,
    uncovered_situations,
)

_APP = Path(__file__).resolve().parents[1] / "app"


def test_the_seven_situations_of_the_issue_are_all_classified():
    assert len(SITUATION_COVERAGE) == 7
    assert len({c.situation for c in SITUATION_COVERAGE}) == 7


def test_a_pack_status_needs_a_real_rule_id_never_a_deduction():
    known = {r.rule_id for r in METHOD_PACK_RULES}
    for c in SITUATION_COVERAGE:
        if c.status == "pack":
            assert c.rule_ids and set(c.rule_ids) <= known, c.situation
        else:
            assert not c.rule_ids, f"{c.situation} : rule_id sans statut pack"
        if c.status == "a_verifier":
            assert c.missing, f"{c.situation} : dire ce qui manque"


def test_a_service_status_points_at_an_existing_file():
    for c in SITUATION_COVERAGE:
        if c.status == "service":
            assert c.service is not None
            rel = c.service.split(" ")[0].removeprefix("apps/ia/")
            assert (_APP.parent / rel).exists(), c.service


def test_no_document_means_to_verify_not_integrated():
    assert set(uncovered_situations()) == {"demande_orientation", "faire_connaitre_expertise", "preparer_appel"}


def test_every_consumer_is_proved_by_its_caller():
    for module, wired, proof in METHOD_CONSUMERS:
        assert wired, f"{module} : non câblé ({proof})"
        text = (_APP.parent / proof.removeprefix("apps/ia/")).read_text(encoding="utf-8")
        assert ("method_knowledge" if module == "chat_laura" else "method_block_for") in text, module


def test_only_the_single_door_retrieves_method_chunks_outside_the_chat():
    allowed = {"method_knowledge.py", "method_consumers.py"}
    for path in (_APP / "services").glob("*.py"):
        if path.name in allowed:
            continue
        assert "retrieve_method_chunks" not in path.read_text(encoding="utf-8"), path.name
    for path in (_APP / "routers").glob("*.py"):
        if path.name == "chat.py":
            continue
        assert "retrieve_method_chunks" not in path.read_text(encoding="utf-8"), path.name


def test_stable_output_format_per_intent():
    assert OUTPUT_FORMAT_BY_INTENT == {
        "compte": "diagnostic_prochaine_action",
        "approche": "angle_message",
        "appel": "discours_objections",
    }
