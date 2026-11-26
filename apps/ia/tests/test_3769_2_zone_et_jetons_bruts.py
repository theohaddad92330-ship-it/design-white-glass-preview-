"""#3769.2 (lot Q02, recette prod 09/10 soir) — après « seulement en Occitanie » :
  1. la carte `account_ranking` écrite PAR LE MODÈLE n'affichait pas l'axe
     « Zone : Occitanie » que l'outil avait appliqué (la restauration de
     géographie ne connaissait que « Département : » et « Région : ») ;
  2. le jeton brut `to_watch` (valeur de `emptyBuckets`) s'affichait en texte.
"""

from __future__ import annotations

import json

from app.services.known_shape_gate import route_known_shapes
from app.services.reply_blocks import REPLY_BLOCK_FENCE, split_reply_blocks

MESSAGE = "seulement en Occitanie"

_TOOL_CARD = {
    "type": "account_ranking",
    "title": "Priorités du portefeuille",
    "axes": ["Catégorie de la règle du portefeuille", "Zone : Occitanie"],
    "items": [{"name": "Compte tls", "why": ["Classé « maintenant » par la règle du portefeuille."]}],
}
_MODEL_CARD = {
    "type": "account_ranking",
    "title": "Priorités du portefeuille",
    "axes": ["Catégorie de la règle du portefeuille"],
    "items": [{"name": "Compte tls", "why": ["Classé « maintenant » par la règle du portefeuille."]}],
}
_READ = {
    "tool": "get_portfolio_priorities",
    "count": 1,
    "what": "Comptes à prioriser dans le portefeuille",
    "blocks": {"account_ranking": _TOOL_CARD},
}


def _fence(block: dict) -> str:
    return f"```{REPLY_BLOCK_FENCE}\n{json.dumps(block, ensure_ascii=False)}\n```"


def _first_ranking(reply: str) -> dict:
    return next(s.block for s in split_reply_blocks(reply) if s.kind == "block" and s.block["type"] == "account_ranking")


def test_the_zone_axis_applied_by_the_tool_is_restored_on_the_models_card() -> None:
    routed = route_known_shapes(f"Voici.\n\n{_fence(_MODEL_CARD)}", [{"shape_read": dict(_READ)}], user_message=MESSAGE)
    assert "Zone : Occitanie" in _first_ranking(routed)["axes"]


def test_no_zone_applied_by_the_tool_means_no_zone_added() -> None:
    read = {**_READ, "blocks": {"account_ranking": {**_TOOL_CARD, "axes": ["Catégorie de la règle du portefeuille"]}}}
    routed = route_known_shapes(f"Voici.\n\n{_fence(_MODEL_CARD)}", [{"shape_read": read}], user_message=MESSAGE)
    assert not any(a.startswith("Zone") for a in _first_ranking(routed)["axes"])


def test_raw_bucket_tokens_never_reach_the_prose() -> None:
    reply = "Aucun compte en to_watch, rien en to_verify, ni en not_now.\n\nto_watch encore."
    routed = route_known_shapes(reply, [], user_message=MESSAGE)
    assert "to_watch" not in routed and "to_verify" not in routed and "not_now" not in routed
    assert "à surveiller" in routed and "à vérifier" in routed and "pas maintenant" in routed


def test_raw_bucket_tokens_are_named_in_english_too() -> None:
    routed = route_known_shapes("Nothing in to_watch.", [], user_message="only Occitanie", language="en")
    assert "to_watch" not in routed and "to watch" in routed


def test_a_card_payload_is_left_byte_identical() -> None:
    block = {**_MODEL_CARD, "items": [{"name": "to_watch_corp", "why": ["x"]}]}
    reply = _fence(block)
    assert route_known_shapes(reply, [], user_message=MESSAGE) == reply
