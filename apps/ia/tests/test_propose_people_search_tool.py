"""#3869.a — `propose_people_search` : la recherche ACTIVE de nouvelles personnes
sur un rôle NON POURVU du comité d'achat.

Avant ce lot, quand `get_account_contacts` rendait `function_not_found`, Laura ne
pouvait que suggérer d'aller chercher ailleurs à l'écran. Ce test tient :

1. l'outil est exposé, compté comme écriture (une PROPOSITION), AVANT `push_profile` ;
2. il rend une carte : le compte LU dans le portefeuille, les rôles, le coût annoncé —
   jamais un effet, jamais un débit, jamais un nom de personne ;
3. un compte étranger ou deviné, aucun rôle, ou trop de rôles ne donnent AUCUNE carte.
"""

from __future__ import annotations

import pytest

from app.services import chat_tools
from app.services.chat_tools import CHAT_TOOLS, WRITE_TOOL_NAMES, execute_chat_tool

USER = "11111111-1111-4111-8111-111111111111"
ACC = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"


@pytest.fixture(autouse=True)
def _scoped_reads(monkeypatch: pytest.MonkeyPatch) -> None:
    async def fake_account_name(account_id, user_id):
        return "SNCF" if account_id == ACC else ""

    monkeypatch.setattr(chat_tools, "_account_name_for", fake_account_name)


async def _run(tool_input: dict) -> dict:
    return await execute_chat_tool("propose_people_search", tool_input, user_id=USER, profile_data=None)


def test_the_tool_is_a_proposal_exposed_before_push_profile() -> None:
    names = [t["name"] for t in CHAT_TOOLS]
    assert names.index("propose_people_search") < names.index("push_profile")
    assert "propose_people_search" in WRITE_TOOL_NAMES


def test_the_description_never_lets_a_role_pass_for_a_person() -> None:
    tool = next(t for t in CHAT_TOOLS if t["name"] == "propose_people_search")
    description = str(tool["description"])
    assert "jamais un nom de personne" in description
    assert "n'envoie rien" in description
    assert "function_not_found" in description


@pytest.mark.asyncio
async def test_a_vacant_role_gives_a_card_with_its_cost_never_an_effect() -> None:
    result = await _run(
        {"account_id": ACC, "roles": ["Responsable achats", " Responsable data ", "Responsable achats"]}
    )
    assert result["status"] == "pending_confirmation"
    proposal = result["proposal"]
    assert proposal["action"] == "propose_people_search"
    assert proposal["account_id"] == ACC
    assert proposal["company_name"] == "SNCF"
    assert proposal["roles"] == ["Responsable achats", "Responsable data"]
    assert proposal["cost_credits"] == 1
    assert proposal["credit_kind"] == "enrichment"


@pytest.mark.asyncio
async def test_an_unknown_account_never_gives_a_card() -> None:
    result = await _run({"account_id": "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", "roles": ["DSI"]})
    assert "error" in result
    assert "proposal" not in result


@pytest.mark.asyncio
@pytest.mark.parametrize("roles", [[], ["  "], None, [f"Rôle {i}" for i in range(6)]])
async def test_no_role_or_too_many_roles_never_give_a_card(roles) -> None:
    result = await _run({"account_id": ACC, "roles": roles})
    assert "error" in result
    assert "proposal" not in result


# ── #4057 / #4058 (lot LAURA-RECHERCHE 12/10) ────────────────────────────────


@pytest.mark.asyncio
async def test_une_expertise_suffit_sans_role_ni_tjm_ni_horizon() -> None:
    """« Interlocuteurs cyber de SNCF » : aucune donnée stratégique requise."""
    result = await _run({"account_id": ACC, "expertise": "cyber"})
    assert result["status"] == "pending_confirmation"
    proposal = result["proposal"]
    assert proposal["roles"] == []
    assert proposal["expertise"] == "cyber"
    for strategic in ("potentialVolume", "closingHorizon", "tjm", "horizon"):
        assert strategic not in proposal


@pytest.mark.asyncio
async def test_expertise_secteur_perimetre_et_roles_restent_distincts() -> None:
    result = await _run(
        {
            "account_id": ACC,
            "roles": ["RSSI"],
            "expertise": "GRC",
            "sector": "énergie",
            "scope": "filiale Ouest",
        }
    )
    proposal = result["proposal"]
    assert proposal["roles"] == ["RSSI"]
    assert proposal["expertise"] == "GRC"
    # #4058 — choisir « énergie » (secteur) ne remplace pas la compétence demandée.
    assert proposal["sector"] == "énergie"
    assert proposal["scope"] == "filiale Ouest"


@pytest.mark.asyncio
async def test_un_secteur_seul_n_est_pas_une_expertise() -> None:
    result = await _run({"account_id": ACC, "sector": "énergie"})
    assert "error" in result
    assert "proposal" not in result


def test_la_description_dit_que_les_criteres_strategiques_ne_sont_pas_requis() -> None:
    tool = next(t for t in CHAT_TOOLS if t["name"] == "propose_people_search")
    description = str(tool["description"])
    assert "TJM" in description and "horizon" in description
    assert "expertise" in tool["input_schema"]["properties"]
    # #4057 — `account_id` OU `company_name` (résolu sur les comptes de l'espace) : rien n'est requis seul.
    assert tool["input_schema"]["required"] == []
