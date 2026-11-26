"""Épopée #2778 (54 outils de lecture sans carte structurée) — `search_dormant_network`.

Mesuré le 26/09/2026 : la carte `account_ranking` existe déjà (`reply-blocks.ts`,
`reply_blocks.py`), instruite pour `run_account_search` — mais rien ne la
proposait pour un CLASSEMENT DE CONTACTS. `search_dormant_network` rend
pourtant exactement la forme qu'`account_ranking` attend : un rang trié, neuf
axes NOMMÉS par contact (`reactivation_score.axes[].label`/`evaluated` —
#2799, `copilot-bridge.controller.ts`), chacun soit évalué (`why`) soit
explicitement NON évalué (`not_evaluated`) — jamais un axe muet compté comme
zéro. `account_ranking` ne restreint son schéma à aucune sémantique
« compte » : `items[].name` accueille un nom de PERSONNE aussi bien qu'un nom
d'entreprise.
"""

from __future__ import annotations

from app.models.reply_blocks import validate_reply_block
from app.services.chat_tools import CHAT_TOOLS


def _tool(name: str) -> dict:
    return next(t for t in CHAT_TOOLS if t["name"] == name)


def test_search_dormant_network_instructs_the_account_ranking_card() -> None:
    description = _tool("search_dormant_network")["description"]
    assert "carte `account_ranking`" in description
    assert "pas de carte" in description


def test_reactivation_axes_can_fill_the_account_ranking_card() -> None:
    """La forme réelle rendue par le pont (`reactivation_score.axes[].label`/
    `evaluated`, #2799) peut remplir la carte — les axes NON évalués sortent
    de `why` et rejoignent `not_evaluated`, jamais comptés comme zéro."""
    contact = {
        "full_name": "Julien Fabre",
        "company_name": "ACME",
        "reactivation_score": {
            "axes": [
                {"key": "silence", "label": "Ancienneté du silence", "evaluated": True, "points": 2, "max": 3},
                {"key": "relation", "label": "Qualité de la relation", "evaluated": True, "points": 3, "max": 3},
                {"key": "signal", "label": "Signal récent", "evaluated": False, "points": None, "max": 2},
            ]
        },
    }
    axes = contact["reactivation_score"]["axes"]
    card = {
        "type": "account_ranking",
        "axes": [axis["label"] for axis in axes],
        "items": [
            {
                "name": contact["full_name"],
                "why": [f"{axis['label']} : {axis['points']}/{axis['max']}" for axis in axes if axis["evaluated"]],
                "not_evaluated": [axis["label"] for axis in axes if not axis["evaluated"]],
            }
        ],
    }
    validated = validate_reply_block(card)
    assert validated is not None
    assert validated["items"][0]["not_evaluated"] == ["Signal récent"]


def test_no_dormant_contact_yields_no_card_content() -> None:
    """SAIT DIRE NON — `account_ranking.items` exige au moins un item (min 1) :
    aucun contact dormant ne peut pas remplir cette carte."""
    card = {"type": "account_ranking", "axes": ["Ancienneté du silence"], "items": []}
    assert validate_reply_block(card) is None
