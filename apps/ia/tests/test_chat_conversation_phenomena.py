"""#2899 (#2278.11) — la garde du registre des sept phénomènes de conversation.

Garde de COMPTE (même patron que `test_chat_hard_failures.py`) PLUS une garde
de VÉRITÉ : pour chaque phénomène, elle vérifie que la citation existe
RÉELLEMENT dans le code vivant — jamais une prose non vérifiée dans le
docstring du module. C'est l'appelant qui rend `chat_conversation_phenomena.py`
autre chose que du vocabulaire mort.
"""

from __future__ import annotations

from app.eval.chat_conversation_phenomena import (
    PHENOMENON_COVERAGE,
    ConversationPhenomenon,
    phenomenon_coverage,
)
from app.models.chat import ChatAttachedFile
from app.prompts.bellum_advisor import build_system_prompt
from app.prompts.thread_state import INTERRUPTED_WORK_BLOCK
from app.services.rag_service import ephemeral_attached_documents, format_attached_documents

BARE = build_system_prompt({}, {}, "", "")


def test_exactly_seven_conversation_phenomena() -> None:
    assert len(list(ConversationPhenomenon)) == 7


def test_every_phenomenon_has_a_coverage_with_a_real_citation() -> None:
    assert set(PHENOMENON_COVERAGE.keys()) == set(ConversationPhenomenon)
    for phenomenon, coverage in PHENOMENON_COVERAGE.items():
        assert coverage.fr.strip(), f"{phenomenon} sans texte FR"
        assert coverage.en.strip(), f"{phenomenon} sans texte EN"
        assert coverage.already_covered_by.strip(), f"{phenomenon} sans citation — il serait DEVINÉ"


def test_no_two_phenomena_share_the_same_citation() -> None:
    citations = [coverage.already_covered_by for coverage in PHENOMENON_COVERAGE.values()]
    assert len(citations) == len(set(citations))


def test_phenomenon_coverage_raises_on_an_unknown_value_rather_than_guessing() -> None:
    import pytest

    with pytest.raises(KeyError):
        phenomenon_coverage("not_a_real_value")  # type: ignore[arg-type]


# ── La preuve : chaque citation existe VRAIMENT, pas seulement en prose ─────


def test_contested_fact_block_is_really_in_the_bare_prompt() -> None:
    assert "CONTESTATION D'UN FAIT CITÉ" in BARE


def test_scope_change_block_is_really_in_the_bare_prompt() -> None:
    assert "CONFLIT DE PORTÉE" in BARE


def test_typo_rule_is_really_in_the_bare_prompt() -> None:
    assert "Tu ne corriges jamais son orthographe" in BARE


def test_frustration_block_is_really_in_the_bare_prompt() -> None:
    assert "QUAND ELLE EST IRRITÉE" in BARE


def test_resumption_block_is_a_real_non_empty_constant() -> None:
    # Le bloc n'entre dans le prompt QUE si un job est en cours
    # (`format_interrupted_work_block`) — ici on vérifie que la constante
    # elle-même est réelle et non vide, la condition étant déjà testée par
    # `tests/test_chat_thread_interrupted_work.py`.
    assert INTERRUPTED_WORK_BLOCK.strip()


def test_attachment_pipeline_is_really_callable() -> None:
    docs = ephemeral_attached_documents([ChatAttachedFile(name="CV Martin", text="Expérience " * 50)])
    assert docs
    rendered = format_attached_documents(docs)
    assert "CV Martin" in rendered
