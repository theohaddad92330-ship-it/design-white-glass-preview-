"""Épopée #2778 (LOT j1 26/09) — `explain_talent_duplicate` reste en texte : aucune carte `verdict`.

Mesuré le 26/09/2026 : le bloc `verdict` existe (`reply_blocks.py`,
`reply-blocks.ts`), son rendu web existe (`VerdictCard.tsx`) — mais rien dans
la description de l'outil `explain_talent_duplicate` ne dit au modèle de la
remplir. Même défaut que celui déjà corrigé pour `compare_accounts`/
`search_talents`/`get_account_contacts`/`search_workspace_contacts`.

Le second test vérifie que la FORME réellement rendue par l'outil
(`state`/`items[].explanation`, cf. l'exécuteur `explain_talent_duplicate`)
peut effectivement remplir la carte `verdict` que l'instruction promet — sans
`reasons` vide (min 1) et sans jamais inventer un chiffre de confiance.
"""

from __future__ import annotations

from unittest.mock import AsyncMock, patch

import pytest

from app.models.reply_blocks import validate_reply_block
from app.services import bellum_api
from app.services.chat_tools import CHAT_TOOLS, execute_chat_tool


def _tool(name: str) -> dict:
    return next(t for t in CHAT_TOOLS if t["name"] == name)


def test_explain_talent_duplicate_instructs_the_verdict_card() -> None:
    description = _tool("explain_talent_duplicate")["description"]
    assert "carte `verdict`" in description
    # La doctrine « aucune probabilité » se lit dans l'instruction elle-même,
    # pas seulement dans un commentaire — sinon rien ne l'empêche de dériver.
    assert "chiffre" in description


@pytest.mark.asyncio
async def test_explain_talent_duplicate_output_can_fill_the_verdict_card(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)
    with patch(
        "app.services.bellum_api.talent_identity_explanation",
        new_callable=AsyncMock,
        return_value={
            "state": "probable_duplicate",
            "items": [
                {
                    "talentId": "t-2",
                    "fullName": "Claire Dubois",
                    "explanation": "Même e-mail professionnel que la fiche consultée.",
                }
            ],
        },
    ):
        result = await execute_chat_tool(
            "explain_talent_duplicate",
            {"talent_id": "t-1"},
            user_id="33333333-3333-4333-8333-333333333333",
            profile_data=None,
        )

    assert result["state"] == "probable_duplicate"
    reasons = [item["explanation"] for item in result["items"]]
    card = {
        "type": "verdict",
        "conclusion": "Ces deux fiches semblent désigner la même personne (à confirmer).",
        "reasons": reasons,
    }
    assert validate_reply_block(card) is not None


@pytest.mark.asyncio
async def test_explain_talent_duplicate_without_a_talent_id_yields_no_card_and_no_call() -> None:
    """SAIT DIRE NON — sans fiche consultée, aucun appel ni carte inventée."""
    with patch(
        "app.services.bellum_api.talent_identity_explanation",
        new_callable=AsyncMock,
    ) as explanation:
        out = await execute_chat_tool(
            "explain_talent_duplicate",
            {"talent_id": "  "},
            user_id="33333333-3333-4333-8333-333333333333",
            profile_data=None,
        )
    explanation.assert_not_called()
    assert "error" in out
