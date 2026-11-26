"""RV4-E-FIX 4287.4 (#3769.1, recette prod 20/10) — trois ciblages successifs : la 1re réponse est une carte
« Cartographie partielle », la 2e et la 3e du TEXTE BRUT « Aucun compte ne reste vérifiable après les deux
filtres ». Cause : un raffinement ne porte aucun marqueur de famille (`classify_reply_family` → None) et le
modèle répond de mémoire (aucune lecture d'outil) : ni la carte d'absence (qui exige une famille ET une lecture
à zéro) ni le repli « sans lecture » ne s'appliquaient. Un vide d'un fil qui a déjà une carte garde la MÊME
famille de rendu (carte d'état vide), avec UNE action, jamais celle déjà proposée."""

from __future__ import annotations

from app.services.known_shape_gate import route_known_shapes
from app.services.reply_blocks import split_reply_blocks

EMPTY = "Aucun compte ne reste vérifiable après les deux filtres."
REFINE = "Garde seulement ceux qui recrutent en Occitanie"


def _cards(routed: str) -> list[dict]:
    return [s.block for s in split_reply_blocks(routed) if s.kind == "block" and s.block]


def test_an_empty_refinement_keeps_the_card_family_of_the_thread() -> None:
    routed = route_known_shapes(EMPTY, [], user_message=REFINE, prior_card_family="account_map")
    cards = _cards(routed)
    assert [c["type"] for c in cards] == ["missing_data"], f"texte brut : {routed!r}"
    assert EMPTY.rstrip(".") in cards[0]["missing"][0]["what"]


def test_the_empty_card_proposes_one_action_never_the_one_already_proposed() -> None:
    first = _cards(route_known_shapes(EMPTY, [], user_message=REFINE, prior_card_family="account_map"))[0]
    assert len(first["still_possible"]) == 1
    seen = tuple(first["still_possible"])
    second = _cards(
        route_known_shapes(EMPTY, [], user_message=REFINE, prior_card_family="account_map", proposed_actions=seen)
    )[0]
    assert len(second.get("still_possible", [])) <= 1
    assert not set(second.get("still_possible", [])) & set(seen)


def test_a_plain_answer_in_a_card_thread_stays_a_sentence() -> None:
    reply = "Airbus compte environ 150 000 salariés."
    assert route_known_shapes(reply, [], user_message="Et ses effectifs ?", prior_card_family="account_map") == reply


def test_an_empty_sentence_without_a_card_thread_is_untouched() -> None:
    assert route_known_shapes(EMPTY, [], user_message=REFINE) == EMPTY
