"""#4059.1 — Un besoin classé reste « le besoin du fil » : chaque CV ajouté ensuite
se compare à CE besoin, sans qu'on le ressaisisse, et le classement rendu dit ce
qu'il a changé (`changes`, calculé côté API depuis le journal)."""

from __future__ import annotations

from app.services.chat_thread_state import ThreadStateCollector
from app.services.chat_tools import MATCH_NEED_TOOL

NEED_ID = "11111111-1111-4111-8111-111111111111"


def _ranked_output() -> dict:
    return {"runId": "r-1", "need": {"needId": NEED_ID, "role": "Dev Java"}, "recommended": []}


def test_le_besoin_classe_devient_le_focus_du_fil() -> None:
    collector = ThreadStateCollector()
    collector.record("run_matching", {"need_id": NEED_ID}, _ranked_output())
    focus = collector.state.focus_of("need")
    assert focus is not None
    assert (focus.id, focus.label) == (NEED_ID, "Dev Java")


def test_run_matching_sans_besoin_reprend_celui_du_fil() -> None:
    collector = ThreadStateCollector()
    collector.record("run_matching", {"need_id": NEED_ID}, _ranked_output())
    effective, _ = collector.prepare("run_matching", {})
    assert effective["need_id"] == NEED_ID


def test_run_matching_sans_besoin_ni_focus_ne_devine_rien() -> None:
    effective, _ = ThreadStateCollector().prepare("run_matching", {})
    assert "need_id" not in effective


def test_un_besoin_donne_explicitement_l_emporte_sur_le_focus() -> None:
    collector = ThreadStateCollector()
    collector.record("run_matching", {"need_id": NEED_ID}, _ranked_output())
    other = "22222222-2222-4222-8222-222222222222"
    effective, _ = collector.prepare("run_matching", {"need_id": other})
    assert effective["need_id"] == other


def test_l_outil_ne_force_plus_need_id_et_decrit_changes() -> None:
    assert "need_id" not in MATCH_NEED_TOOL["input_schema"]["required"]
    description = MATCH_NEED_TOOL["description"]
    assert "changes" in description
    assert "nouveau candidat" in description  # une nouvelle version d'une même personne n'en est pas un
