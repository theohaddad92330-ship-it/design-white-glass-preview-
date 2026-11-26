"""#2900 (#2415.10) — `get_confirmed_revenue`, l'ENCAISSÉ moins ce qui est CONTESTÉ.

`RevenueService.confirmedRevenue` (apps/api) et `POST finance/confirmed-revenue`
(pont copilote) existaient déjà sans appelant côté chat — Laura ne pouvait pas
répondre à « combien j'ai vraiment encaissé, litiges exclus ». Mêmes garanties
que `get_revenue` : un montant absent ne se dit jamais « 0 », un refus de droit
se DIT plutôt que de rendre un montant nul.
"""

from __future__ import annotations

import pytest

from app.services import bellum_api, chat_tools

USER = "11111111-1111-4111-8111-111111111111"


@pytest.fixture(autouse=True)
def _clear_bridge_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("API_INTERNAL_URL", raising=False)
    monkeypatch.delenv("INTERNAL_API_SECRET", raising=False)


async def _run(name: str, payload: dict | None = None) -> dict:
    return await chat_tools.execute_chat_tool(name, payload or {}, user_id=USER, profile_data=None)


def test_the_tool_is_declared_and_appended_at_the_true_end() -> None:
    # celui-ci.
    #
    # Pas `names[-1]` : `get_account_manager_review` (#2319, mesuré 26/09),
    # `propose_need_transition` (épopée #2967, intégration chantier A),
    # `explain_approval_card` (#2857, 26/09) ET `push_profile` (LOT c5
    # clôture 26/09) ont tous rejoint la liste ENCORE APRÈS lui — même
    # situation que documentée dans `test_chat_crm_presence_tool.py`. Les
    # invariants tenus : jamais inséré AVANT `get_crm_presence` (le dernier
    # outil du catalogue au moment où ce lot a écrit), et toujours avant
    # `push_profile`, qui reste le DERNIER du catalogue (voir
    # `test_chat_push_profile_tool.py`).
    names = [str(tool["name"]) for tool in chat_tools.CHAT_TOOLS]
    assert "get_confirmed_revenue" in names
    assert names.index("get_confirmed_revenue") > names.index("get_crm_presence")
    assert names.index("get_confirmed_revenue") < names.index("push_profile")


def test_no_editor_name_leaks_into_the_description() -> None:
    forbidden = ("qonto", "tiime", "pennylane", "sage", "boondmanager", "hubspot", "salesforce")
    description = str(chat_tools.CONFIRMED_REVENUE_TOOL["description"]).lower()
    assert not any(word in description for word in forbidden)


def test_description_documents_finance_forbidden_and_null_is_never_zero() -> None:
    description = str(chat_tools.CONFIRMED_REVENUE_TOOL["description"])
    assert "finance_forbidden" in description
    assert "n'a pas le droit" in description or "n’a pas le droit" in description
    assert "unavailableReason" in description
    assert "excludedDisputed" in description


@pytest.mark.asyncio
async def test_bridge_makes_zero_network_calls_when_unconfigured(monkeypatch: pytest.MonkeyPatch) -> None:
    def _explode(*_args: object, **_kwargs: object) -> None:
        raise AssertionError("aucun appel réseau ne doit partir sans configuration")

    monkeypatch.setattr("httpx.AsyncClient", _explode)
    assert await bellum_api.confirmed_revenue(USER) is None


@pytest.mark.asyncio
async def test_tool_refuses_rather_than_returning_an_empty_answer_when_unconfigured() -> None:
    result = await _run("get_confirmed_revenue")
    assert "error" in result
    assert not any(isinstance(value, (list, int, float)) and value for value in result.values())


@pytest.mark.asyncio
async def test_says_forbidden_instead_of_announcing_zero(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)

    async def forbidden(*_args: object, **_kwargs: object) -> dict[str, object]:
        return {"error": "finance_forbidden"}

    monkeypatch.setattr(bellum_api, "confirmed_revenue", forbidden)
    result = await _run("get_confirmed_revenue")
    assert "droit" in result["error"]
    assert "0" not in result["error"]


@pytest.mark.asyncio
async def test_relays_the_bridge_result_unchanged(monkeypatch: pytest.MonkeyPatch) -> None:
    # Aucune seconde dérivation ici : `excludedDisputed`/`amountCents` viennent
    # tels quels de `RevenueService.confirmedRevenue`, l'unique calcul (GA-26).
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)

    async def confirmed(*_args: object, **_kwargs: object) -> dict[str, object]:
        return {
            "periodMonth": "2026-08-01",
            "amountCents": 480_000,
            "withoutAmount": 0,
            "unavailableReason": None,
            "sourceRows": 3,
            "excludedDisputed": 1,
        }

    monkeypatch.setattr(bellum_api, "confirmed_revenue", confirmed)
    result = await _run("get_confirmed_revenue", {"month": "2026-08"})
    assert result["amountCents"] == 480_000
    assert result["excludedDisputed"] == 1


@pytest.mark.asyncio
async def test_passes_month_through_to_the_bridge(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)
    seen: dict[str, object] = {}

    async def confirmed(user_id: str, *, month: str | None = None) -> dict[str, object]:
        seen["user_id"] = user_id
        seen["month"] = month
        return {"periodMonth": "2026-08-01", "amountCents": None, "unavailableReason": "no_source"}

    monkeypatch.setattr(bellum_api, "confirmed_revenue", confirmed)
    await _run("get_confirmed_revenue", {"month": "2026-08"})
    assert seen == {"user_id": USER, "month": "2026-08"}
