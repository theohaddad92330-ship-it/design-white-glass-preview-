"""SalesConnect completeness gate (roadmap §14) — chaque reco/play doit porter
les 6 champs signal/preuve/contact/action/message/risque, et sa preuve doit être
reliée à une source RÉELLE. Une reco sans preuve fondée est marquée `faible`
(non-actionnable), jamais supprimée."""

from __future__ import annotations

from app.services.play_completeness import (
    SALESCONNECT_FIELDS,
    evaluate_play_completeness,
)


def _complete_play() -> dict:
    """A play carrying the full 6-field SalesConnect chain with a founded preuve."""
    return {
        "perimeter": "VINCI Energies",
        "painSignal": "Recrutement massif de profils data cette année",
        "preuve": {
            "source": "France Travail",
            "date": "2026-06",
            "url": "https://candidat.francetravail.fr/offres/x",
            "signal": "12 postes data ouverts",
            "weak": False,
        },
        "targetContact": "Sophie Martin",
        "firstAction": "Contacter Sophie Martin (DSI) sur LinkedIn",
        "readyMessage": "Bonjour Sophie, vu vos 12 recrutements data…",
        "risk": "Achats structurés — cycle long",
    }


def test_salesconnect_fields_are_the_six_dod_fields() -> None:
    # The 6 SalesConnect fields, in DoD order.
    assert [label for label, _ in SALESCONNECT_FIELDS] == [
        "signal",
        "preuve",
        "contact",
        "action",
        "message",
        "risque",
    ]


def test_complete_play_with_founded_evidence_is_complete() -> None:
    verdict = evaluate_play_completeness(_complete_play())
    assert verdict["status"] == "complete"
    assert verdict["missing"] == []
    assert verdict["hasFoundedEvidence"] is True
    assert verdict["requiredFields"] == ["signal", "preuve", "contact", "action", "message", "risque"]


def test_play_without_evidence_is_flagged_faible_not_dropped() -> None:
    # No preuve at all → non-actionnable, but the play is still returned/flagged.
    play = _complete_play()
    play["preuve"] = None
    verdict = evaluate_play_completeness(play)
    assert verdict["status"] == "faible"
    assert "preuve" in verdict["missing"]
    assert verdict["hasFoundedEvidence"] is False


def test_weak_source_evidence_is_not_founded() -> None:
    # A weak/AI-reconstructed source is NOT a proof (Théo #2) → faible.
    play = _complete_play()
    play["preuve"] = {"source": "ia_reconstruction", "signal": "x", "weak": True}
    verdict = evaluate_play_completeness(play)
    assert verdict["status"] == "faible"
    assert "preuve" in verdict["missing"]
    assert verdict["hasFoundedEvidence"] is False


def test_weak_source_detected_even_without_explicit_weak_flag() -> None:
    # Robust: a preuve that forgot to set `weak` is still caught via source_quality.
    play = _complete_play()
    play["preuve"] = {"source": "ia_reconstruction", "signal": "x"}
    assert evaluate_play_completeness(play)["hasFoundedEvidence"] is False


def test_missing_message_marks_faible() -> None:
    play = _complete_play()
    play["readyMessage"] = None
    verdict = evaluate_play_completeness(play)
    assert verdict["status"] == "faible"
    assert "message" in verdict["missing"]


def test_placeholder_contact_marks_faible() -> None:
    play = _complete_play()
    play["targetContact"] = "à identifier"
    verdict = evaluate_play_completeness(play)
    assert verdict["status"] == "faible"
    assert "contact" in verdict["missing"]


def test_empty_source_evidence_is_not_founded() -> None:
    play = _complete_play()
    play["preuve"] = {"source": "", "signal": "x"}
    verdict = evaluate_play_completeness(play)
    assert verdict["hasFoundedEvidence"] is False
    assert "preuve" in verdict["missing"]


def test_verdict_is_deterministic() -> None:
    play = _complete_play()
    assert evaluate_play_completeness(play) == evaluate_play_completeness(dict(play))
