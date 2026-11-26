"""#4287.5 (recette prod 19/10) — « Cartographie les comptes du département 34 » : l'absence d'objet se nommait
(« Aucun objet rendu ») SANS proposer la suite. Un résultat vide propose AUSSI ses actions suivantes (`still_possible`),
dans la même grammaire que les résultats pleins (verbes à l'impératif, une action par ligne)."""

from __future__ import annotations

import json

from app.services.known_shape_gate import route_known_shapes
from app.services.reply_blocks import REPLY_BLOCK_FENCE, split_reply_blocks

MESSAGE = "Cartographie les comptes du département 34"


def _empty_read() -> dict:
    # La porte de forme CONSOMME `shape_read` (pop) : une action neuve par appel.
    return {"shape_read": {"tool": "run_account_search", "count": 0, "what": "Comptes du département 34", "blocks": {}}}



def _missing_data(routed: str) -> dict:
    for segment in split_reply_blocks(routed):
        if segment.kind == "block" and segment.block["type"] == "missing_data":
            return segment.block
    raise AssertionError(f"pas de carte missing_data dans : {routed!r}")


def test_an_empty_result_card_proposes_its_next_actions() -> None:
    routed = route_known_shapes("Rien trouvé.", [_empty_read()], user_message=MESSAGE)
    card = _missing_data(routed)
    assert card["still_possible"], "un vide muet : aucune action suivante proposée"
    assert len(card["still_possible"]) >= 2


def test_the_next_actions_are_in_english_when_the_interface_is() -> None:
    routed = route_known_shapes("Nothing.", [_empty_read()], user_message=MESSAGE, language="en")
    card = _missing_data(routed)
    assert any("Widen" in action or "Search" in action or "Open" in action for action in card["still_possible"])


def test_a_named_absence_without_any_read_keeps_no_invented_next_action() -> None:
    # Sans lecture (on ne sait pas qu'il n'y a « rien ») la carte de repli ne prétend pas non plus savoir quoi proposer.
    block = {"type": "missing_data", "missing": [{"what": "x", "how": "y"}]}
    reply = f"```{REPLY_BLOCK_FENCE}\n{json.dumps(block)}\n```"
    assert route_known_shapes(reply, [], user_message="bonjour") == reply
