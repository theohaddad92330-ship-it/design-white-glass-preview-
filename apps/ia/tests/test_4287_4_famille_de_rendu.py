"""#4287.4 (contrat validé par Louis le 29/10/2026) — pour une MÊME intention, Laura rend UNE seule famille de rendu.

Mesure prod du 28/10 : « quelle est la prochaine action, et qu'est-ce qui manque ? » posée sur Servier, Sanofi
et Thales rendait DEUX formes — le gabarit texte CONSEIL (« Ce qui manque » absent) ou une carte `verdict` sans
`limits` aux tours 1 et 2, une carte `account_card` (« Fiche compte THALES ») au tour 3. Cause : aucune famille ne
reconnaissait cette demande (`classify_reply_family` → None) ; la forme dépendait de l'outil que le modèle avait
appelé (`get_account_suitability_verdict` → `verdict`, `get_account_briefing` → `account_card`) et de son humeur.

La preuve : trois fois la même intention, trois sorties de modèle de formes DIFFÉRENTES, une seule forme rendue —
la carte `verdict`, mêmes sections dans le même ordre, « Ce qui manque » toujours présent. Contrôle négatif : une
demande d'une AUTRE famille n'est jamais forcée dans ce gabarit."""

from __future__ import annotations

import json

import pytest

from app.services.known_shape_gate import route_known_shapes
from app.services.reply_blocks import split_reply_blocks
from app.services.reply_family import classify_reply_family, reply_family_directive, reply_family_outcome

QUESTIONS = (
    "Sur Servier, quelle est la prochaine action, et qu'est-ce qui manque ?",
    "Sur Sanofi, quelle est la prochaine action, et qu'est-ce qui manque ?",
    "Sur Thales, quelle est la prochaine action, et qu'est-ce qui manque ?",
)

_SECTIONS = ("conclusion", "reasons", "limits", "next_action")


def _fence(block: dict) -> str:
    return f"```bellum-block\n{json.dumps(block, ensure_ascii=False)}\n```"


# Tour 1 — le gabarit texte CONSEIL, SANS « Ce qui manque » (la mesure du 28/10).
TURN_SERVIER = (
    "**Verdict :** Relancer la DSI de Servier cette semaine.\n\n"
    "**Pourquoi :**\n- Programme de migration annoncé le 12/10\n- Deux contacts IT identifiés\n\n"
    "**Prochaine action :** Préparer un message au DSI adjoint."
)
# Tour 2 — une carte `verdict` écrite par le modèle, sans `limits`.
TURN_SANOFI = "Voici où en est Sanofi.\n\n" + _fence(
    {
        "type": "verdict",
        "conclusion": "Qualifier le besoin data avant toute approche.",
        "reasons": ["Appel d'offres data publié le 03/10", "Aucun contact achats connu"],
        "next_action": {"label": "Identifier l'acheteur IT"},
    }
)
# Tour 3 — une « Fiche compte THALES » (`account_card`), avec son « Ce qui manque ».
TURN_THALES = _fence(
    {
        "type": "account_card",
        "name": "THALES",
        "href": "/accounts/7c1f6a0e-9a2b-4c55-9a1e-0f3d2b8e6a11",
        "verdict": "À qualifier avant prospection",
        "highlights": ["Recrutements cloud en hausse", "Nouveau RSSI nommé le 20/10"],
        "limits": ["Budget IT 2027 inconnu", "Aucun interlocuteur achats", "ESN en place non identifiées"],
        "action": {"label": "Qualifier le périmètre cloud avec le RSSI"},
    }
)


def _cards(routed: str) -> list[dict]:
    return [s.block for s in split_reply_blocks(routed) if s.kind == "block" and s.block]


def _shape(routed: str) -> list[tuple[str, tuple[str, ...]]]:
    """La FORME rendue : chaque carte, ses sections non vides dans l'ordre d'affichage."""
    return [(c["type"], tuple(k for k in _SECTIONS if c.get(k))) for c in _cards(routed)]


def test_the_three_questions_of_the_measure_are_one_family() -> None:
    families = {classify_reply_family(q) for q in QUESTIONS}
    assert families == {"account_next_step"}


def test_three_turns_of_the_same_intent_render_the_same_sections_in_the_same_order() -> None:
    shapes = [
        _shape(route_known_shapes(reply, [], user_message=question))
        for question, reply in zip(QUESTIONS, (TURN_SERVIER, TURN_SANOFI, TURN_THALES), strict=True)
    ]
    assert shapes[0] == shapes[1] == shapes[2], shapes
    assert shapes[0] == [("verdict", ("conclusion", "reasons", "limits", "next_action"))]


def test_ce_qui_manque_is_kept_word_for_word_when_the_model_named_it() -> None:
    card = _cards(route_known_shapes(TURN_THALES, [], user_message=QUESTIONS[2]))[0]
    assert card["limits"] == ["Budget IT 2027 inconnu", "Aucun interlocuteur achats", "ESN en place non identifiées"]
    assert card["reasons"] == ["Recrutements cloud en hausse", "Nouveau RSSI nommé le 20/10"]
    assert card["next_action"] == {"label": "Qualifier le périmètre cloud avec le RSSI"}
    assert "THALES" in card["conclusion"] and "À qualifier avant prospection" in card["conclusion"]


def test_nothing_missing_is_said_in_words_never_zero_never_hidden() -> None:
    card = _cards(route_known_shapes(TURN_SANOFI, [], user_message=QUESTIONS[1]))[0]
    assert len(card["limits"]) == 1
    said = card["limits"][0]
    assert said.strip() and "0" not in said
    # La conclusion et les raisons du modèle ne changent pas : seule la FORME change.
    assert card["conclusion"] == "Qualifier le besoin data avant toute approche."
    assert card["reasons"] == ["Appel d'offres data publié le 03/10", "Aucun contact achats connu"]


def test_nothing_missing_follows_the_interface_language() -> None:
    fr = _cards(route_known_shapes(TURN_SANOFI, [], user_message=QUESTIONS[1], language="fr"))[0]["limits"]
    en = _cards(route_known_shapes(TURN_SANOFI, [], user_message=QUESTIONS[1], language="en"))[0]["limits"]
    assert fr != en


def test_the_conseil_template_text_is_not_said_twice_next_to_its_card() -> None:
    routed = route_known_shapes(TURN_SERVIER, [], user_message=QUESTIONS[0])
    assert "**Verdict :**" not in routed and "**Pourquoi :**" not in routed
    card = _cards(routed)[0]
    assert card["conclusion"] == "Relancer la DSI de Servier cette semaine."
    assert card["reasons"] == ["Programme de migration annoncé le 12/10", "Deux contacts IT identifiés"]
    assert card["next_action"] == {"label": "Préparer un message au DSI adjoint."}


def test_the_tool_verdict_and_the_model_account_card_make_one_card_not_two() -> None:
    tool_verdict = {
        "type": "verdict",
        "conclusion": "À surveiller — signaux encore faibles",
        "reasons": ["Fraîcheur : un seul signal daté"],
    }
    routed = route_known_shapes(TURN_THALES, [{"tool": "x", "verdict_block": tool_verdict}], user_message=QUESTIONS[2])
    cards = _cards(routed)
    assert [c["type"] for c in cards] == ["verdict"]
    assert cards[0]["limits"]  # « Ce qui manque » de la fiche n'est pas perdu dans la fusion


def test_the_turn_reads_as_structured() -> None:
    routed = route_known_shapes(TURN_SERVIER, [], user_message=QUESTIONS[0])
    assert reply_family_outcome("account_next_step", routed) == "structured"


def test_the_directive_asks_one_verdict_card_with_ce_qui_manque_always() -> None:
    directive = reply_family_directive("account_next_step")
    assert "`verdict`" in directive and "`limits`" in directive
    assert "`account_card`" in directive  # nommée pour être EXCLUE de cette demande


# --- Contrôles négatifs : une autre intention n'est jamais forcée dans ce gabarit. ---


@pytest.mark.parametrize(
    ("message", "family"),
    [
        ("Quels comptes n'ont pas de prochaine action ?", None),
        ("Qu'est-ce qui manque sur Servier ?", None),
        ("Fais-moi un plan d'action sur Alpha, et ce qui manque", "action_plan"),
        ("Classe-moi mes comptes avec leur prochaine action et ce qui manque", "account_ranking"),
    ],
)
def test_another_intent_is_not_this_family(message: str, family: str | None) -> None:
    assert classify_reply_family(message) == family


def test_an_account_card_for_another_intent_is_left_untouched() -> None:
    assert route_known_shapes(TURN_THALES, [], user_message="Présente-moi le compte Thales") == TURN_THALES


def test_a_plain_answer_to_this_intent_is_not_invented_into_a_card() -> None:
    plain = "Je n'ai pas trouvé Servier dans ton espace."
    assert route_known_shapes(plain, [], user_message=QUESTIONS[0]) == plain
