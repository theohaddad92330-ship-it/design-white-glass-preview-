"""#2425.8 (W43, 24/09) — l'outil `get_forecast_horizons` : Laura explique
l'écart CA / cash avec les MÊMES causes chiffrées que l'écran
(`ForecastHorizonsService`, `gap.causes` : `invoicingDelay` = délai de
facturation, `notYetInvoiced`, `overdue`, `disputed`).

Ce que ces tests tiennent :
- l'outil est au catalogue, EN FIN de liste (préfixe d'outils mis en cache) ;
- rien n'est recalculé ni pondéré ICI : le résultat du pont est relayé TEL
  QUEL ;
- un horizon inconnu n'est jamais transmis au pont — `None` (le défaut du
  pont, `month`) plutôt qu'une valeur inventée ;
- `finance_forbidden` se dit — jamais un écart à zéro qui se lirait « pas
  d'écart » ;
- un pont muet ou éteint se DIT : jamais un prévisionnel vide qui se lirait
  « rien à prévoir ».
"""

from __future__ import annotations

from typing import Any

import pytest

from app.services import bellum_api
from app.services.chat_tools import CHAT_TOOLS, FORECAST_HORIZONS_TOOL, execute_chat_tool

USER = "00000000-0000-4000-8000-000000000001"


@pytest.fixture(autouse=True)
def _configured(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)


async def _run(payload: dict[str, Any] | None = None) -> dict[str, Any]:
    return await execute_chat_tool("get_forecast_horizons", payload or {}, user_id=USER, profile_data=None)


def test_the_tool_is_registered_and_keeps_the_cached_prefix() -> None:
    # Pas "le dernier" : #2313 (24/09) a posé `declare_known_contact` APRÈS
    # lui, EN FIN de liste comme tous les précédents (même convention que
    # `test_chat_tools_day_closure.py`) — seule sa PRÉSENCE est garantie,
    # jamais sa place en queue : c'est ce qui garde le préfixe d'outils mis en
    # cache stable pour les tours qui précèdent get_forecast_horizons.
    names = [tool["name"] for tool in CHAT_TOOLS]
    assert "get_forecast_horizons" in names


def test_description_names_the_invoicing_delay_and_refuses_probabilities() -> None:
    description = str(FORECAST_HORIZONS_TOOL["description"])
    assert "délai de facturation" in description
    assert "invoicingDelay" in description
    assert "finance_forbidden" in description
    enum = FORECAST_HORIZONS_TOOL["input_schema"]["properties"]["horizon"]["enum"]
    assert enum == ["week", "month", "quarter", "semester"]


@pytest.mark.asyncio
async def test_relays_the_gap_causes_as_the_screen_computes_them(monkeypatch: pytest.MonkeyPatch) -> None:
    seen: dict[str, Any] = {}
    forecast = {
        "horizon": "quarter",
        "gap": {
            "causes": [
                {"cause": "invoicingDelay", "amounts": [{"currency": "EUR", "amountCents": 1_500_000}]},
                {"cause": "overdue", "amounts": [{"currency": "EUR", "amountCents": 90_000}]},
            ]
        },
    }

    async def fake(user_id: str, *, horizon: str | None = None) -> dict[str, Any]:
        seen["user_id"] = user_id
        seen["horizon"] = horizon
        return forecast

    monkeypatch.setattr(bellum_api, "forecast_horizons", fake)
    result = await _run({"horizon": "quarter"})
    assert {key: result[key] for key in forecast} == forecast
    assert seen == {"user_id": USER, "horizon": "quarter"}


@pytest.mark.asyncio
async def test_an_unknown_horizon_is_not_forwarded(monkeypatch: pytest.MonkeyPatch) -> None:
    seen: dict[str, Any] = {}

    async def fake(user_id: str, *, horizon: str | None = None) -> dict[str, Any]:
        seen["horizon"] = horizon
        return {"gap": {"causes": []}}

    monkeypatch.setattr(bellum_api, "forecast_horizons", fake)
    await _run({"horizon": "decade"})
    assert seen["horizon"] is None


@pytest.mark.asyncio
async def test_says_forbidden_instead_of_a_zero(monkeypatch: pytest.MonkeyPatch) -> None:
    async def forbidden(user_id: str, *, horizon: str | None = None) -> dict[str, Any]:
        return {"error": "finance_forbidden"}

    monkeypatch.setattr(bellum_api, "forecast_horizons", forbidden)
    result = await _run()
    assert "droit" in result["error"]


@pytest.mark.asyncio
async def test_says_it_did_not_answer_when_the_bridge_is_silent(monkeypatch: pytest.MonkeyPatch) -> None:
    async def silent(user_id: str, *, horizon: str | None = None) -> None:
        return None

    monkeypatch.setattr(bellum_api, "forecast_horizons", silent)
    result = await _run()
    assert "pas répondu" in result["error"]


@pytest.mark.asyncio
async def test_not_configured_says_so_without_a_network_call(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(bellum_api, "is_configured", lambda: False)
    result = await _run()
    assert "error" in result
