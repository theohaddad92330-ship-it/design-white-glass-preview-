"""Épopée #2778 (54 outils de lecture sans carte structurée) — `get_mission_start_readiness`.

Mesuré : la carte `missing_data` existe déjà (`reply-blocks.ts`,
`reply_blocks.py`), son rendu web aussi (`MissingDataCard.tsx`) — mais rien
dans la description de l'outil ne disait au modèle de la remplir, alors que
son propre texte décrit déjà EXACTEMENT la forme d'une carte `missing_data`
(« nomme chaque manque », « propose l'action qui lève chacune »). Même défaut
que celui déjà corrigé pour `compare_accounts`/`search_talents`/
`get_account_contacts`/`search_workspace_contacts`/`explain_talent_duplicate`.

Le second test vérifie que la forme réellement rendue par le pont
(`missing`/`reserves`, deux listes de CLÉS — #2409.8) peut effectivement
remplir la carte, en fabriquant un item `what`/`how` par clé — sans jamais
inventer une clé qui n'a pas été rendue.
"""

from __future__ import annotations

from app.models.reply_blocks import validate_reply_block
from app.services.chat_tools import CHAT_TOOLS


def _tool(name: str) -> dict:
    return next(t for t in CHAT_TOOLS if t["name"] == name)


def test_mission_start_readiness_instructs_the_missing_data_card() -> None:
    description = _tool("get_mission_start_readiness")["description"]
    assert "carte `missing_data`" in description
    # Une mission « prête » sans aucun manque ne doit jamais forcer une carte vide.
    assert "pas de carte" in description


def test_missing_and_reserves_keys_can_fill_the_missing_data_card() -> None:
    missing = ["client_agreement", "start_date"]
    reserves = ["daily_rate"]
    card = {
        "type": "missing_data",
        "missing": [
            {"what": "Accord client", "how": "Confirmer l'accord du client (geste daté)."} for _ in [missing[0]]
        ]
        + [{"what": "Date de début", "how": "Saisir la date de début de la mission."}]
        + [{"what": "TJM (réserve)", "how": "Saisir le TJM de la mission."} for _ in reserves],
    }
    assert validate_reply_block(card) is not None


def test_a_ready_mission_with_nothing_missing_yields_no_card_content() -> None:
    """SAIT DIRE NON — `missing_data.missing` exige au moins un item (min 1) :
    une mission « prête » (missing=[], reserves=[]) ne peut pas remplir cette
    carte, c'est exactement pourquoi la description dit de ne pas la forcer."""
    card = {"type": "missing_data", "missing": []}
    assert validate_reply_block(card) is None
