"""#3919 — l'APPELANT des signaux de compte.

Mesuré le 08/10/2026 : le pont NestJS (`internal/copilot/accounts/signals`)
relit déjà `AccountsService.listAccountSignals` (`recent_signals` +
`signal_history`, la MÊME Veille que le portefeuille) — mais aucun outil de
chat ne l'exposait au modèle avant ce lot. Ce fichier vérifie que
`get_account_signals` RELAIE ce calcul tel quel (aucun second moteur), qu'un
`link` n'est jamais inventé, qu'un compte sans signal actif se distingue d'un
compte introuvable, et que le mode portefeuille (sans `account_id`) reste
possible.
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
    return await execute_chat_tool("get_account_signals", tool_input, user_id=USER, profile_data=None)


def test_registry_exposes_the_tool() -> None:
    names = {t["name"] for t in CHAT_TOOLS}
    assert "get_account_signals" in names


def test_it_is_a_pure_read_never_a_write_tool() -> None:
    assert "get_account_signals" not in WRITE_TOOL_NAMES


def test_schema_does_not_require_an_account_id() -> None:
    tool = next(t for t in CHAT_TOOLS if t["name"] == "get_account_signals")
    assert tool["input_schema"]["required"] == []


def test_the_description_names_the_link_guard_and_the_sibling_tools() -> None:
    tool = next(t for t in CHAT_TOOLS if t["name"] == "get_account_signals")
    description = str(tool["description"]).lower()
    assert "jamais inventer un lien" in description
    # #3922.6 — Laura CITE la preuve quand elle existe : le lien n'est plus « toujours null ».
    assert "toujours `null`" not in description
    assert "sans lien vérifiable" in description
    assert "`link`" in description
    assert "get_job_changes" in description
    assert "search_rfps" in description
    assert "jamais de probabilité" in description


@pytest.mark.asyncio
async def test_relays_the_signals_exactly_no_second_calculation(monkeypatch: pytest.MonkeyPatch) -> None:
    payload = {
        "accountId": "a-1",
        "accounts": [
            {
                "accountId": "a-1",
                "companyName": "SNCF",
                "signals": [
                    {
                        "label": "Levée de fonds Série B",
                        "type": "funding",
                        "date": "2026-09-01",
                        "source": "Les Échos",
                        "link": None,
                        "impact": "Peut financer un projet de modernisation",
                        "salesImplication": "Budget dégagé pour la DSI",
                        "importance": "high",
                        "actionLabel": None,
                        "firstDetectedAt": "2026-09-02T00:00:00.000Z",
                        "lastSeenAt": "2026-09-20T00:00:00.000Z",
                    }
                ],
            }
        ],
    }

    async def _account_signals(*_a: object, **_k: object) -> dict:
        return payload

    monkeypatch.setattr(bellum_api, "account_signals", _account_signals)
    result = await _run({"account_id": "a-1"})
    for key, value in payload.items():
        assert result[key] == value
    assert result["status"] == "success"
    assert result["accounts"][0]["signals"][0]["link"] is None


@pytest.mark.asyncio
async def test_a_found_account_without_active_signal_is_distinct_from_not_found(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def _account_signals(*_a: object, **_k: object) -> dict:
        return {"accountId": "a-1", "accounts": []}

    monkeypatch.setattr(bellum_api, "account_signals", _account_signals)
    result = await _run({"account_id": "a-1"})
    assert "error" not in result
    assert result["accounts"] == []
    assert result["status"] == "empty"


@pytest.mark.asyncio
async def test_a_foreign_or_missing_account_never_yields_a_signal_list(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _account_signals(*_a: object, **_k: object) -> dict:
        return {"error": "account_not_found"}

    monkeypatch.setattr(bellum_api, "account_signals", _account_signals)
    result = await _run({"account_id": "a-x"})
    assert "error" in result
    assert "accounts" not in result


@pytest.mark.asyncio
async def test_portfolio_mode_without_account_id_calls_the_bridge_with_none(monkeypatch: pytest.MonkeyPatch) -> None:
    seen: list[tuple[object, ...]] = []

    async def _account_signals(*a: object, **_k: object) -> dict:
        seen.append(a)
        return {"accountId": None, "accounts": []}

    monkeypatch.setattr(bellum_api, "account_signals", _account_signals)
    result = await _run({})
    assert seen and seen[0][1] is None
    assert result["accountId"] is None


@pytest.mark.asyncio
async def test_says_it_lacks_access_rather_than_failing_when_unconfigured(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(bellum_api, "is_configured", lambda: False)
    result = await _run({"account_id": "a-1"})
    assert "error" in result


@pytest.mark.asyncio
async def test_no_response_from_the_bridge_is_named_rather_than_silent(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _account_signals(*_a: object, **_k: object) -> None:
        return None

    monkeypatch.setattr(bellum_api, "account_signals", _account_signals)
    result = await _run({"account_id": "a-1"})
    assert "error" in result


# ── P05.c (#3246, lot 09/10) — les signaux qui précèdent une affaire, ailleurs ──


def test_the_description_presents_shared_precedence_as_a_count_never_a_cause() -> None:
    description = next(t for t in CHAT_TOOLS if t["name"] == "get_account_signals")["description"]
    assert "`sharedPrecedence`" in description
    assert "C'est un COMPTE, jamais une causalité ni une chance de signer" in description
    assert "ne le dis pas « jamais suivi »" in description


@pytest.mark.asyncio
async def test_relays_shared_precedence_as_is(monkeypatch: pytest.MonkeyPatch) -> None:
    """Entrée : « ce signal budget, ça débouche sur une affaire ailleurs ? » →
    `get_account_signals` → `sharedPrecedence` relayé TEL QUEL, sans second calcul."""
    shared = {
        "basis": "shared_anonymous_base",
        "windowDays": 90,
        "status": "shared",
        "lines": [
            {"signalType": "budget", "sector": "all", "signals": 11, "followedByDeal": 4, "contributingWorkspaces": 4}
        ],
    }

    async def _account_signals(*_a: object, **_k: object) -> dict:
        return {"accountId": "a-1", "sharedPrecedence": shared, "accounts": [{"accountId": "a-1", "signals": []}]}

    monkeypatch.setattr(bellum_api, "account_signals", _account_signals)
    result = await _run({"account_id": "a-1"})
    assert result["sharedPrecedence"] == shared


# ── #4286.15.c (Louis 22/10/2026) — `market_pattern`, les tendances entre espaces ──


def test_the_description_presents_market_patterns_as_what_bellum_knows() -> None:
    description = next(t for t in CHAT_TOOLS if t["name"] == "get_account_signals")["description"]
    assert "`marketPatterns`" in description
    assert "« observé dans 4 espaces »" in description
    assert "aucun taux, aucune probabilité, aucun prix ni TJM" in description
    assert "ne dis pas « personne ne recrute »" in description


@pytest.mark.asyncio
async def test_relays_market_patterns_as_is(monkeypatch: pytest.MonkeyPatch) -> None:
    """Entrée : « qu'est-ce qui recrute autour de ce compte ? » → `get_account_signals` →
    `marketPatterns` relayé TEL QUEL, sans second calcul."""
    patterns = {
        "basis": "shared_anonymous_base",
        "windowDays": 180,
        "status": "shared",
        "lines": [
            {
                "topic": "data",
                "sectorKey": "naf_64",
                "sizeBand": "eti",
                "regionKey": "ile_de_france",
                "observations": 4,
                "contributingWorkspaces": 3,
                "observedIn": "observé dans 3 espaces",
            }
        ],
    }

    async def _account_signals(*_a: object, **_k: object) -> dict:
        return {"accountId": "a-1", "marketPatterns": patterns, "accounts": []}

    monkeypatch.setattr(bellum_api, "account_signals", _account_signals)
    result = await _run({"account_id": "a-1"})
    assert result["marketPatterns"] == patterns


# ── #3970 (lot P07) — « qui a été recruté chez X ? » ────────────────────────


def test_the_description_names_recent_hires_and_their_named_reason() -> None:
    tool = next(t for t in CHAT_TOOLS if t["name"] == "get_account_signals")
    description = str(tool["description"])
    assert "`recentHires`" in description
    assert "jamais un pourcentage" in description
    assert "ne présente jamais comme récent une arrivée non datée" in description
    assert "jamais « personne n'a été recruté »" in description


@pytest.mark.asyncio
async def test_recent_hires_are_relayed_and_make_the_answer_non_empty(monkeypatch: pytest.MonkeyPatch) -> None:
    hires = {
        "windowDays": 183,
        "examinedContacts": 2,
        "hires": [{"name": "Claire Martin", "role": "DSI", "startedOn": "2026-08-01"}],
    }

    async def _account_signals(*_a: object, **_k: object) -> dict:
        return {"accountId": "a-1", "accounts": [], "recentHires": hires}

    monkeypatch.setattr(bellum_api, "account_signals", _account_signals)
    result = await _run({"account_id": "a-1"})
    assert result["recentHires"] == hires
    assert result["status"] == "success"


@pytest.mark.asyncio
async def test_no_signal_and_no_hire_stays_empty(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _account_signals(*_a: object, **_k: object) -> dict:
        return {"accountId": "a-1", "accounts": [], "recentHires": {"windowDays": 183, "examinedContacts": 0, "hires": []}}

    monkeypatch.setattr(bellum_api, "account_signals", _account_signals)
    result = await _run({"account_id": "a-1"})
    assert result["status"] == "empty"
