"""Épopée #2778 (lot b, 27/09) — `search_partners`.

Classé `_deferred_fit` par le lot du 26/09 (« partenaires classés avec score et
ses axes — sous trois placements = pas de score — compatible `account_ranking`,
non câblé ce lot »). FINIR-V2-27-09 : un « reste » compatible se lève ce tour.
`PartnerRelationScore` (`packages/contracts/src/schemas/partner-pipeline.ts`)
porte déjà CINQ axes NOMMÉS (`volume`, `fiabilite`, `marge`, `acces`,
`reciprocite`), chacun soit mesuré (`points`/`max`/`evidence`) soit dans
`unmeasured` — exactement la forme qu'`account_ranking` attend (axes[] +
items[] avec `why`/`not_evaluated`), déjà démontrée par `search_dormant_network`
pour un classement de personnes plutôt que de comptes.
"""

from __future__ import annotations

import pytest

from app.models.reply_blocks import validate_reply_block
from app.services import bellum_api
from app.services.chat_tools import CHAT_TOOLS, execute_chat_tool

_AXIS_LABELS = {
    "volume": "Volume",
    "fiabilite": "Fiabilité",
    "marge": "Marge",
    "acces": "Accès",
    "reciprocite": "Réciprocité",
}


def _tool(name: str) -> dict:
    return next(t for t in CHAT_TOOLS if t["name"] == name)


def test_search_partners_instructs_the_account_ranking_card() -> None:
    description = _tool("search_partners")["description"]
    assert "carte `account_ranking`" in description
    assert "pas de carte" in description


@pytest.mark.asyncio
async def test_search_partners_output_can_fill_the_account_ranking_card(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)

    async def _partner_pipeline(*_a: object, **_k: object) -> dict:
        return {
            "partners": [
                {
                    "id": "p-1",
                    "name": "Cap ESN",
                    "score": {
                        "score": 62,
                        "scoreMax": 100,
                        "axes": [
                            {"axis": "volume", "points": 20, "max": 25, "evidence": "6 besoins reçus sur 90 jours"},
                            {"axis": "fiabilite", "points": 18, "max": 20, "evidence": "3 placements sur 3 honorés"},
                        ],
                        "unmeasured": ["marge", "acces", "reciprocite"],
                    },
                }
            ],
            "truncated": False,
        }

    monkeypatch.setattr(bellum_api, "partner_pipeline", _partner_pipeline)
    result = await execute_chat_tool(
        "search_partners",
        {},
        user_id="33333333-3333-4333-8333-333333333333",
        profile_data=None,
    )
    partners = result["partners"]
    axes = partners[0]["score"]["axes"]
    unmeasured = partners[0]["score"]["unmeasured"]
    card = {
        "type": "account_ranking",
        "axes": list(_AXIS_LABELS.values()),
        "items": [
            {
                "name": partners[0]["name"],
                "why": [f"{_AXIS_LABELS[a['axis']]} : {a['evidence']}" for a in axes],
                "not_evaluated": [_AXIS_LABELS[key] for key in unmeasured],
            }
        ],
    }
    validated = validate_reply_block(card)
    assert validated is not None
    assert validated["items"][0]["not_evaluated"] == ["Marge", "Accès", "Réciprocité"]


def test_no_partner_yields_no_card_content() -> None:
    """SAIT DIRE NON — `account_ranking.items` exige au moins un item (min 1) :
    un canal partenaire vide ne peut pas remplir cette carte."""
    card = {"type": "account_ranking", "axes": ["Volume"], "items": []}
    assert validate_reply_block(card) is None
