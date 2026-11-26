"""#3903 — l'APPELANT du bilan de relance.

Mesuré le 08/10/2026 : le pont NestJS (`internal/copilot/accounts/engagement-report`)
croise déjà les échanges enregistrés (`ActivitiesService.engagementReport`) sur
une fenêtre — mais aucun outil de chat ne l'exposait au modèle avant ce lot.
Ce fichier vérifie que `get_reengagement_report` RELAIE ce calcul tel quel
(aucun second moteur), que la fenêtre et la couverture des sources restent
nommées plutôt qu'invinventées, et qu'aucun corps de message ne transite.
"""

from __future__ import annotations

import pytest

from app.services import bellum_api
from app.services.chat_tools import CHAT_TOOLS, WRITE_TOOL_NAMES, execute_chat_tool

USER = "22222222-4222-4222-8222-222222222222"


@pytest.fixture(autouse=True)
def _configured(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)


async def _run(tool_input: dict) -> dict:
    return await execute_chat_tool("get_reengagement_report", tool_input, user_id=USER, profile_data=None)


def test_registry_exposes_the_tool() -> None:
    names = {t["name"] for t in CHAT_TOOLS}
    assert "get_reengagement_report" in names


def test_it_is_a_pure_read_never_a_write_tool() -> None:
    assert "get_reengagement_report" not in WRITE_TOOL_NAMES


def test_schema_does_not_require_a_window() -> None:
    tool = next(t for t in CHAT_TOOLS if t["name"] == "get_reengagement_report")
    assert tool["input_schema"]["required"] == []


def test_the_description_names_the_doctrine_limits() -> None:
    tool = next(t for t in CHAT_TOOLS if t["name"] == "get_reengagement_report")
    description = str(tool["description"]).lower()
    assert "le corps des messages n'est jamais lu" in description
    assert "open_deal_status" in description
    # #3903 — DÉCISION LOUIS 09/10 : « nogo déjà retenté » est ABANDONNÉ, plus
    # jamais annoncé comme un manque.
    assert "nogo_retry" not in description
    assert "nogo" not in description
    assert "notobserved" in description.replace("`", "")


def test_the_description_requires_a_direction_column_for_every_row() -> None:
    """#3903 (recette prod 09/10) — un tableau de 4 comptes sans colonne « sens »
    ET le sens dit en prose pour 4 AUTRES comptes dans la même réponse : la
    donnée (`lastDirection`) était déjà là, l'instruction de colonne ne
    l'était pas. Chaque ligne doit nommer sa colonne « Sens », jamais la
    reléguer à du texte pour une partie seulement des comptes.
    """
    tool = next(t for t in CHAT_TOOLS if t["name"] == "get_reengagement_report")
    description = str(tool["description"]).lower()
    assert "colonne « sens »" in description or "colonne « sens »" in description
    assert "jamais en prose pour une partie seulement" in description


def test_the_description_names_the_open_crm_deal_category() -> None:
    """#3903 (lot M01, 09/10/2026) — « deal jamais closé » est croisé grâce à la
    jointure deal CRM → compte (#3918.a) : la catégorie et ses champs sont
    nommés, et `open_deal_status` ne reste dans `notEvaluated` que sans cache
    CRM — le modèle doit alors le DIRE, jamais conclure « aucun deal ouvert ».
    """
    tool = next(t for t in CHAT_TOOLS if t["name"] == "get_reengagement_report")
    description = str(tool["description"])
    assert "`deal_jamais_close`" in description
    assert "`openCrmDeals`" in description
    assert "`openCrmDealNames`" in description
    assert "aucun deal ouvert" in description.lower()


def test_the_table_has_five_columns_and_never_writes_zero_for_an_uncrossed_deal() -> None:
    """#3903 (recette NB 10/10) — 7 en-têtes au lieu de 5, colonne « Affaire ouverte » à 0 sans CRM."""
    tool = next(t for t in CHAT_TOOLS if t["name"] == "get_reengagement_report")
    description = str(tool["description"])
    assert "CINQ COLONNES" in description
    assert "Compte · Catégorie · Dernier échange (date et canal) · Sens · Tentatives" in description
    assert "jamais dans une colonne « Affaire ouverte »" in description
    assert "tu ne l'écris JAMAIS « 0 »" in description


@pytest.mark.asyncio
async def test_relays_the_report_exactly_no_second_calculation(monkeypatch: pytest.MonkeyPatch) -> None:
    payload = {
        "since": "2026-07-01T00:00:00.000Z",
        "accounts": [
            {
                "accountId": "a-1",
                "companyName": "SNCF",
                "lastOccurredAt": "2026-09-01T00:00:00.000Z",
                "lastDirection": "outbound",
                "lastKind": "email",
                "attempts": 3,
                "category": "a_relancer",
            }
        ],
        "sourcesCoverage": {"observed": ["email"], "notObserved": ["call", "meeting", "linkedin"]},
        "notEvaluated": ["open_deal_status"],
    }

    async def _engagement_report(*_a: object, **_k: object) -> dict:
        return payload

    monkeypatch.setattr(bellum_api, "engagement_report", _engagement_report)
    result = await _run({"since_date": "2026-07-01"})
    for key, value in payload.items():
        assert result[key] == value
    assert result["status"] == "success"


@pytest.mark.asyncio
async def test_rejects_a_malformed_since_date_rather_than_guessing(monkeypatch: pytest.MonkeyPatch) -> None:
    called = False

    async def _engagement_report(*_a: object, **_k: object) -> dict:
        nonlocal called
        called = True
        return {"accounts": []}

    monkeypatch.setattr(bellum_api, "engagement_report", _engagement_report)
    result = await _run({"since_date": "1er juillet"})
    assert "error" in result
    assert called is False


@pytest.mark.asyncio
async def test_passes_since_date_and_window_days_through_to_the_bridge(monkeypatch: pytest.MonkeyPatch) -> None:
    seen: list[tuple[object, ...]] = []

    async def _engagement_report(*a: object, **_k: object) -> dict:
        seen.append(a)
        return {"accounts": []}

    monkeypatch.setattr(bellum_api, "engagement_report", _engagement_report)
    await _run({"window_days": 30})
    assert seen and seen[0][1:] == (None, 30)


@pytest.mark.asyncio
async def test_caps_an_unbounded_account_list_and_says_so(monkeypatch: pytest.MonkeyPatch) -> None:
    rows = [{"accountId": f"a-{i}", "companyName": f"Compte {i}"} for i in range(30)]

    async def _engagement_report(*_a: object, **_k: object) -> dict:
        return {"accounts": rows}

    monkeypatch.setattr(bellum_api, "engagement_report", _engagement_report)
    result = await _run({})
    assert len(result["accounts"]) == 20
    assert result["truncated"] is True


@pytest.mark.asyncio
async def test_does_not_flag_a_short_list(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _engagement_report(*_a: object, **_k: object) -> dict:
        return {"accounts": [{"accountId": "a-1", "companyName": "Compte 1"}]}

    monkeypatch.setattr(bellum_api, "engagement_report", _engagement_report)
    result = await _run({})
    assert result["truncated"] is False


@pytest.mark.asyncio
async def test_no_account_to_reengage_in_the_window_is_empty_not_an_error(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _engagement_report(*_a: object, **_k: object) -> dict:
        return {"accounts": [], "sourcesCoverage": {"observed": [], "notObserved": ["email", "call", "meeting", "linkedin"]}}

    monkeypatch.setattr(bellum_api, "engagement_report", _engagement_report)
    result = await _run({})
    assert "error" not in result
    assert result["accounts"] == []
    assert result["status"] == "empty"


@pytest.mark.asyncio
async def test_says_it_lacks_access_rather_than_failing_when_unconfigured(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(bellum_api, "is_configured", lambda: False)
    result = await _run({})
    assert "error" in result


@pytest.mark.asyncio
async def test_no_response_from_the_bridge_is_named_rather_than_silent(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _engagement_report(*_a: object, **_k: object) -> None:
        return None

    monkeypatch.setattr(bellum_api, "engagement_report", _engagement_report)
    result = await _run({})
    assert "error" in result
