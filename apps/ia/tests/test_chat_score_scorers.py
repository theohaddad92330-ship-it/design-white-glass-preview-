"""#2899 (#2278.13 / #2278.27) — les scoreurs des DIX-SEPT dimensions du chat.

Chaque dimension a trois cas : elle dit OUI sur un bon tour, NON sur un mauvais, et « non évaluable » (None, jamais
0) quand le tour ne porte pas de quoi la juger. Aucune moyenne ne remplace un hard failure.
"""

from __future__ import annotations

import pytest

from app.eval.chat_hard_failures import ChatHardFailure
from app.eval.chat_score_dimensions import ChatScoreDimension as D
from app.eval.chat_score_scorers import (
    MIN_EVALUATED_DIMENSIONS,
    ChatTurn,
    ToolCall,
    score_dimension,
    score_turn,
)

TODAY = "2026-10-17"


def _turn(**over) -> ChatTurn:
    base = {"user_message": "Où en est Thales ?", "answer": "Thales recrute 12 postes data (source : France Travail, 2026-10-10). Relance Marie Dupont cette semaine."}
    base.update(over)
    return ChatTurn(**base)


def _s(dimension: D, turn: ChatTurn):
    return score_dimension(dimension, turn, today=TODAY)


def test_every_dimension_has_a_scorer() -> None:
    card = score_turn(_turn(), today=TODAY)
    assert set(card.scores) == set(D)


# ── compréhension ───────────────────────────────────────────────────────────
def test_comprehension_yes_no_none() -> None:
    assert _s(D.COMPREHENSION, _turn()).score == 1.0
    assert _s(D.COMPREHENSION, _turn(answer="Voici un conseil général sur la prospection.")).score == 0.0
    assert _s(D.COMPREHENSION, _turn(user_message="bonjour")).score is None


# ── personnalisation ────────────────────────────────────────────────────────
def test_personalization_yes_no_none() -> None:
    assert _s(D.PERSONALIZATION, _turn(profile_terms=("data",))).score == 1.0
    assert _s(D.PERSONALIZATION, _turn(profile_terms=("cyber",))).score == 0.0
    assert _s(D.PERSONALIZATION, _turn()).score is None


# ── exactitude ──────────────────────────────────────────────────────────────
def test_accuracy_yes_no_none() -> None:
    grounded = _turn(tool_results="12 offres data publiées le 2026-10-10")
    assert _s(D.ACCURACY, grounded).score == 1.0
    invented = _turn(answer="Thales recrute 47 postes.", tool_results="12 offres")
    assert _s(D.ACCURACY, invented).score == 0.0
    assert _s(D.ACCURACY, _turn(answer="Thales est un compte actif.")).score is None


# ── provenance ──────────────────────────────────────────────────────────────
def test_provenance_yes_no_none() -> None:
    assert _s(D.PROVENANCE, _turn(sources=({"label": "France Travail", "url": "https://x.example/o"},))).score == 1.0
    assert _s(D.PROVENANCE, _turn()).score == 0.0
    assert _s(D.PROVENANCE, _turn(answer="Thales est un compte actif.")).score is None


# ── fraîcheur ───────────────────────────────────────────────────────────────
def test_freshness_yes_no_none() -> None:
    assert _s(D.FRESHNESS, _turn(sources=({"label": "FT", "date": "2026-10-01"},))).score == 1.0
    assert _s(D.FRESHNESS, _turn(sources=({"label": "FT", "date": "2023-01-01"},))).score == 0.0
    assert _s(D.FRESHNESS, _turn(sources=({"label": "FT"},))).score is None


# ── utilité commerciale ─────────────────────────────────────────────────────
def test_commercial_usefulness_yes_no_none() -> None:
    assert _s(D.COMMERCIAL_USEFULNESS, _turn()).score == 1.0
    assert _s(D.COMMERCIAL_USEFULNESS, _turn(answer="Merci pour votre message, belle journée.")).score == 0.0
    assert _s(D.COMMERCIAL_USEFULNESS, _turn(answer="")).score is None


# ── profondeur ──────────────────────────────────────────────────────────────
def test_depth_yes_no_none() -> None:
    two = (ToolCall("get_account_signals", ok=True, has_data=True), ToolCall("get_account_contacts", ok=True, has_data=True))
    assert _s(D.DEPTH, _turn(tool_calls=two)).score == 1.0
    one = (ToolCall("get_account_signals", ok=True, has_data=True),)
    assert _s(D.DEPTH, _turn(tool_calls=one)).score == 0.5
    assert _s(D.DEPTH, _turn(answer="ok")).score is None


# ── concision ───────────────────────────────────────────────────────────────
def test_conciseness_yes_no_none() -> None:
    assert _s(D.CONCISENESS, _turn()).score == 1.0
    assert _s(D.CONCISENESS, _turn(answer="mot " * 600)).score == 0.0
    assert _s(D.CONCISENESS, _turn(answer="")).score is None


# ── posture ─────────────────────────────────────────────────────────────────
def test_posture_yes_no_none() -> None:
    assert _s(D.POSTURE, _turn()).score == 1.0
    assert _s(D.POSTURE, _turn(answer="Excellente question ! C'est garanti à 100 %, absolument !")).score < 0.5
    assert _s(D.POSTURE, _turn(answer="")).score is None


# ── continuité ──────────────────────────────────────────────────────────────
def test_continuity_yes_no_none() -> None:
    follow = _turn(user_message="Et pour le même compte ?", previous_entities=("Thales",), previous_user_messages=("Thales ?",))
    assert _s(D.CONTINUITY, follow).score == 1.0
    lost = _turn(user_message="Et pour le même compte ?", answer="Quel compte ?", previous_entities=("Thales",), previous_user_messages=("Thales ?",))
    assert _s(D.CONTINUITY, lost).score == 0.0
    assert _s(D.CONTINUITY, _turn()).score is None


# ── bon usage des outils ────────────────────────────────────────────────────
def test_tool_use_quality_yes_no_none() -> None:
    good = (ToolCall("get_account_signals", ok=True, has_data=True, args={"account_id": "a"}),)
    assert _s(D.TOOL_USE_QUALITY, _turn(tool_calls=good)).score == 1.0
    bad = (ToolCall("get_account_signals", ok=False), ToolCall("get_account_signals", ok=False))
    assert _s(D.TOOL_USE_QUALITY, _turn(tool_calls=bad)).score == 0.0
    assert _s(D.TOOL_USE_QUALITY, _turn()).score is None


# ── exécution réelle ────────────────────────────────────────────────────────
def test_real_execution_yes_no_none() -> None:
    done = _turn(answer="J'ai créé le contact Marie Dupont.", tool_calls=(ToolCall("create_contact_from_crm", ok=True),))
    assert _s(D.REAL_EXECUTION, done).score == 1.0
    claimed = _turn(answer="J'ai créé le contact Marie Dupont.")
    assert _s(D.REAL_EXECUTION, claimed).score == 0.0
    sent = _turn(answer="J'ai envoyé le mail.", tool_calls=(ToolCall("prepare_message", ok=True),))
    assert _s(D.REAL_EXECUTION, sent).score == 0.0  # le copilote n'envoie jamais
    assert _s(D.REAL_EXECUTION, _turn()).score is None


# ── sécurité ────────────────────────────────────────────────────────────────
def test_security_yes_no() -> None:
    assert _s(D.SECURITY, _turn()).score == 1.0
    assert _s(D.SECURITY, _turn(answer="La clé est sk-ant-api03-AAAAAAAAAAAAAAAAAAAAAAAA")).score == 0.0
    assert _s(D.SECURITY, _turn(answer="Authorization: Bearer eyJhbGciOiJIUzI1NiJ9.abc.def")).score == 0.0


# ── permissions ─────────────────────────────────────────────────────────────
def test_permissions_yes_no_none() -> None:
    call = (ToolCall("get_account_signals", ok=True),)
    assert _s(D.PERMISSIONS, _turn(tool_calls=call, allowed_tools=frozenset({"get_account_signals"}))).score == 1.0
    assert _s(D.PERMISSIONS, _turn(tool_calls=call, allowed_tools=frozenset({"other"}))).score == 0.0
    assert _s(D.PERMISSIONS, _turn(tool_calls=call)).score is None


# ── absence de boucle ───────────────────────────────────────────────────────
def test_no_loop_yes_no_none() -> None:
    call = ToolCall("get_account_signals", ok=True, args={"account_id": "a"})
    assert _s(D.NO_LOOP, _turn(tool_calls=(call,))).score == 1.0
    assert _s(D.NO_LOOP, _turn(tool_calls=(call, call, call))).score == 0.0
    repeated = _turn(previous_answers=(_turn().answer,))
    assert _s(D.NO_LOOP, repeated).score == 0.0
    assert _s(D.NO_LOOP, _turn()).score is None


# ── qualité sectorielle ─────────────────────────────────────────────────────
def test_sector_quality_yes_no_none() -> None:
    assert _s(D.SECTOR_QUALITY, _turn(sector_terms=("data",))).score == 1.0
    assert _s(D.SECTOR_QUALITY, _turn(sector_terms=("naval",))).score == 0.0
    assert _s(D.SECTOR_QUALITY, _turn()).score is None


# ── qualité du prochain mouvement ───────────────────────────────────────────
def test_next_move_quality_yes_no_none() -> None:
    assert _s(D.NEXT_MOVE_QUALITY, _turn()).score == 1.0
    assert _s(D.NEXT_MOVE_QUALITY, _turn(answer="Thales est un compte actif.")).score == 0.0
    assert _s(D.NEXT_MOVE_QUALITY, _turn(answer="Relance quelqu'un.")).score == 0.5
    assert _s(D.NEXT_MOVE_QUALITY, _turn(answer="")).score is None


# ── le bulletin ─────────────────────────────────────────────────────────────
def test_a_score_is_never_bare_and_never_zero_for_unmeasured() -> None:
    card = score_turn(_turn(), today=TODAY)
    for dimension, result in card.scores.items():
        assert result.reason.strip(), f"{dimension} sans raison"
        assert result.score is None or 0.0 <= result.score <= 1.0
    assert set(card.not_evaluated) == {d for d, r in card.scores.items() if r.score is None}


def test_no_average_can_compensate_a_hard_failure() -> None:
    card = score_turn(_turn(), today=TODAY, hard_failures=(ChatHardFailure.FABRICATED_RESULT,))
    assert card.blocked is True
    assert card.conclusive is False
    assert not hasattr(card, "mean") and not hasattr(card, "average")


def test_minimal_coverage_is_named() -> None:
    thin = score_turn(ChatTurn(user_message="bonjour", answer="Bonjour !"), today=TODAY)
    assert len(thin.evaluated) < MIN_EVALUATED_DIMENSIONS
    assert thin.conclusive is False
    rich = score_turn(
        _turn(
            profile_terms=("data",),
            sector_terms=("data",),
            sources=({"label": "FT", "url": "https://x.example/o", "date": "2026-10-10"},),
            tool_results="12 offres le 2026-10-10",
            tool_calls=(ToolCall("get_account_signals", ok=True, has_data=True, args={"a": 1}),),
            allowed_tools=frozenset({"get_account_signals"}),
        ),
        today=TODAY,
    )
    assert len(rich.evaluated) >= MIN_EVALUATED_DIMENSIONS
    assert rich.conclusive is True


@pytest.mark.parametrize("dimension", list(D))
def test_unknown_input_is_not_a_zero(dimension: D) -> None:
    result = score_dimension(dimension, ChatTurn(user_message="", answer=""), today=TODAY)
    assert result.score in (None, 1.0) if dimension is D.SECURITY else result.score is None
