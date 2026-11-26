"""#2899 (#2278.40) — les corrections humaines deviennent des cas golden en MOTIF ANONYMISÉ AGRÉGÉ seulement.

Doctrine c64 / GA-412 : l'unité est la FONCTION (« les messages préparés sont corrigés N fois »), jamais la
personne, jamais l'espace, jamais le corps du message ni la valeur corrigée. Le motif ne naît que d'un agrégat
déjà publié au-dessus du plancher de réponses distinctes.
"""

from __future__ import annotations

import pytest

from app.eval import chat_correction_motifs as motifs
from app.services import bellum_api

REPORT = {
    "minDistinctReplies": 3,
    "windowDays": 90,
    "withheldTools": 1,
    "byTool": [
        {
            "tool": "prepare_message",
            "replies": 12,
            "feedbacks": 15,
            "contested": 6,
            "corrected": 4,
            "contestedShare": 0.4,
        },
        {"tool": "search_talents", "replies": 5, "feedbacks": 5, "contested": 1, "corrected": 0, "contestedShare": 0.2},
        {"tool": "tiny_tool", "replies": 2, "feedbacks": 2, "contested": 2, "corrected": 2, "contestedShare": 1.0},
    ],
}


def test_only_corrected_functions_above_the_floor_become_golden_motifs() -> None:
    cases = motifs.golden_motifs_from_report(REPORT)
    assert [c["tool"] for c in cases] == ["prepare_message"]  # 0 correction : pas un motif ; sous le plancher : retenu
    case = cases[0]
    assert case["identifiant"] == "correction-motif/prepare_message"
    assert case["corrected"] == 4 and case["feedbacks"] == 15
    assert case["source"] == "export_corrections" and case["provenance"] == "anonymise_agrege"


def test_a_motif_never_carries_a_person_a_workspace_a_body_or_a_corrected_value() -> None:
    dirty = {
        "minDistinctReplies": 3,
        "byTool": [
            {
                "tool": "prepare_message",
                "replies": 9,
                "feedbacks": 9,
                "contested": 3,
                "corrected": 3,
                "user_id": "u-1",
                "workspace_id": "w-1",
                "note": "Sarah a corrigé le téléphone de Marc",
                "correction_value": "06 12 34 56 78",
            }
        ],
    }
    (case,) = motifs.golden_motifs_from_report(dirty)
    assert set(case) == set(motifs.ALLOWED_MOTIF_KEYS)
    assert "Sarah" not in repr(case) and "06 12" not in repr(case) and "w-1" not in repr(case)


def test_a_tool_name_that_looks_like_free_text_is_refused() -> None:
    odd = {
        "minDistinctReplies": 3,
        "byTool": [{"tool": "Sarah Martin a dit non", "replies": 9, "feedbacks": 9, "contested": 3, "corrected": 3}],
    }
    assert motifs.golden_motifs_from_report(odd) == []


def test_malformed_or_missing_reports_give_no_motif_and_no_invention() -> None:
    assert motifs.golden_motifs_from_report(None) == []
    assert motifs.golden_motifs_from_report({"byTool": "nope"}) == []
    assert (
        motifs.golden_motifs_from_report({"minDistinctReplies": 3, "byTool": [{"tool": "x", "replies": "NaN"}]}) == []
    )


@pytest.mark.asyncio
async def test_the_bridge_off_is_named_unavailable_never_zero_motifs(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _off(*_a, **_k):
        return None

    monkeypatch.setattr(bellum_api, "reply_contestations", _off)
    out = await motifs.load_correction_motifs()
    assert out.measured is False and out.motifs == []


@pytest.mark.asyncio
async def test_the_bridge_on_reads_the_aggregate(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _on(*_a, **_k):
        return REPORT

    monkeypatch.setattr(bellum_api, "reply_contestations", _on)
    out = await motifs.load_correction_motifs()
    assert out.measured is True and [m["tool"] for m in out.motifs] == ["prepare_message"]
