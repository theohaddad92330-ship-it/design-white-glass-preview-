"""#4057 (reste) — « interlocuteurs cyber de Renault » : Laura n'a pas d'`account_id`,
`propose_people_search` résout le compte par son NOM sur les comptes de l'ESPACE.

Un seul compte porte ce nom ⇒ la carte. Plusieurs ⇒ une demande de PRÉCISION (jamais un
choix deviné). Aucun ⇒ une erreur claire, jamais une carte sur une entité devinée.
"""

from __future__ import annotations

import pytest

from app.services import chat_tools
from app.services.chat_tools import execute_chat_tool

USER = "11111111-1111-4111-8111-111111111111"
RENAULT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
RENAULT_TRUCKS = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
RENAULT_SAS_A = "cccccccc-cccc-4ccc-8ccc-cccccccccccc"
RENAULT_SAS_B = "dddddddd-dddd-4ddd-8ddd-dddddddddddd"


def _fake_accounts(monkeypatch: pytest.MonkeyPatch, rows: list[dict]) -> None:
    async def named_like(company: str, user_id: str) -> list[dict]:
        assert user_id == USER
        return rows

    async def account_name(account_id, user_id):
        return next((r["company_name"] for r in rows if r["id"] == account_id), "")

    monkeypatch.setattr(chat_tools, "_accounts_named_like", named_like)
    monkeypatch.setattr(chat_tools, "_account_name_for", account_name)


async def _run(tool_input: dict) -> dict:
    return await execute_chat_tool("propose_people_search", tool_input, user_id=USER, profile_data=None)


@pytest.mark.asyncio
async def test_a_name_with_one_exact_account_gives_the_card(monkeypatch: pytest.MonkeyPatch) -> None:
    _fake_accounts(
        monkeypatch,
        [{"id": RENAULT, "company_name": "Renault SAS"}, {"id": RENAULT_TRUCKS, "company_name": "Renault Trucks"}],
    )
    result = await _run({"company_name": "Renault", "expertise": "cyber"})
    assert result["status"] == "pending_confirmation"
    assert result["proposal"]["account_id"] == RENAULT
    assert result["proposal"]["expertise"] == "cyber"


@pytest.mark.asyncio
async def test_homonyms_ask_for_a_precision_never_a_guess(monkeypatch: pytest.MonkeyPatch) -> None:
    _fake_accounts(
        monkeypatch,
        [{"id": RENAULT_SAS_A, "company_name": "Renault SAS"}, {"id": RENAULT_SAS_B, "company_name": "Renault"}],
    )
    result = await _run({"company_name": "Renault", "expertise": "cyber"})
    assert "proposal" not in result
    assert result["needs_precision"] is True
    assert {c["account_id"] for c in result["candidates"]} == {RENAULT_SAS_A, RENAULT_SAS_B}
    assert "précision" in result["error"].lower() or "lequel" in result["error"].lower()


@pytest.mark.asyncio
async def test_a_near_name_without_exact_match_is_proposed_not_chosen(monkeypatch: pytest.MonkeyPatch) -> None:
    _fake_accounts(monkeypatch, [{"id": RENAULT_TRUCKS, "company_name": "Renault Trucks"}])
    result = await _run({"company_name": "Renault", "expertise": "cyber"})
    assert "proposal" not in result
    assert result["needs_precision"] is True
    assert [c["account_id"] for c in result["candidates"]] == [RENAULT_TRUCKS]


@pytest.mark.asyncio
async def test_an_unknown_name_gives_a_clear_error(monkeypatch: pytest.MonkeyPatch) -> None:
    _fake_accounts(monkeypatch, [])
    result = await _run({"company_name": "Zorbatek", "expertise": "cyber"})
    assert "proposal" not in result
    assert "Zorbatek" in result["error"]
    assert "needs_precision" not in result


# #4058.1 (recette prod 14/10, FAIL) — « interlocuteurs cyber GRC de EDF, secteur énergie » :
# EDF n'est pas (encore) un compte du portefeuille. L'erreur seule laissait Laura répondre en
# texte libre (« 0 contact enregistré », recherche élargie promise au tour suivant) plutôt que
# de chercher des personnes RÉELLES. `plan_account_analysis` est déjà LE chemin documenté pour
# « des personnes chez une entreprise absente » (#3859) : l'échec de résolution du nom doit
# pointer vers lui, dans le même tour, sans perdre expertise/secteur.
@pytest.mark.asyncio
async def test_an_unknown_name_redirects_to_account_analysis_in_the_same_turn(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _fake_accounts(monkeypatch, [])
    result = await _run({"company_name": "EDF", "expertise": "cyber GRC", "sector": "énergie"})
    assert "proposal" not in result
    redirect = result["redirect_to_account_search"]
    assert "plan_account_analysis" in redirect
    assert "EDF" in redirect
    assert "même tour" in redirect
    assert "TJM" in redirect  # …et on n'en pose AUCUNE question, comme le reste du geste (#4057)


@pytest.mark.asyncio
async def test_homonyms_do_not_redirect_to_account_analysis(monkeypatch: pytest.MonkeyPatch) -> None:
    # Des homonymes veulent une PRÉCISION, pas une analyse lancée sur un compte deviné.
    _fake_accounts(
        monkeypatch,
        [{"id": RENAULT_SAS_A, "company_name": "Renault SAS"}, {"id": RENAULT_SAS_B, "company_name": "Renault"}],
    )
    result = await _run({"company_name": "Renault", "expertise": "cyber"})
    assert "redirect_to_account_search" not in result


@pytest.mark.asyncio
async def test_an_account_id_still_wins_over_the_name(monkeypatch: pytest.MonkeyPatch) -> None:
    _fake_accounts(monkeypatch, [{"id": RENAULT, "company_name": "Renault SAS"}])
    result = await _run({"account_id": RENAULT, "company_name": "Autre", "expertise": "cyber"})
    assert result["proposal"]["account_id"] == RENAULT


def test_the_schema_offers_company_name_and_no_longer_requires_account_id() -> None:
    tool = next(t for t in chat_tools.CHAT_TOOLS if t["name"] == "propose_people_search")
    assert "company_name" in tool["input_schema"]["properties"]
    assert "account_id" not in tool["input_schema"].get("required", [])
