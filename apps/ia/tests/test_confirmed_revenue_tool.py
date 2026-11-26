"""#2900 (#2415.10) — le CA CONFIRMÉ exposé au copilote.

`RevenueService.confirmedRevenue` (`apps/api/.../revenue.service.ts`) existait
déjà, testé, mais aucun appelant ne le rendait joignable depuis le chat :
``git grep -n "get_confirmed_revenue"`` rendait 0 résultat côté `chat_tools.py`
avant ce lot. Même discipline que `get_revenue` : un montant absent ne se dit
jamais « 0 », un refus de droit se DIT plutôt que de rendre un montant nul, et
`excludedDisputed` — ce qui est écarté du calcul — voyage TEL QUEL, jamais
recalculé une seconde fois côté service IA.
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
    return await chat_tools.execute_chat_tool(
        name, payload or {}, user_id=USER, profile_data=None
    )


def test_the_tool_is_declared_and_appended_last() -> None:
    # #2910 (`CRM_PRESENCE_TOOL`) fermait la liste avant ce lot : insérer au
    # milieu invaliderait le préfixe d'outils mis en cache pour tous les
    # tours suivants. `push_profile` (LOT c5 clôture 26/09) a depuis rejoint
    # la liste ENCORE APRÈS lui (voir `test_chat_push_profile_tool.py`) :
    # c'est l'ordre relatif entre les deux qui compte, plus le seul `[-1]`.
    names = [str(tool["name"]) for tool in chat_tools.CHAT_TOOLS]
    assert names.index("get_crm_presence") < names.index("get_confirmed_revenue") < names.index("push_profile")


@pytest.mark.asyncio
async def test_bridge_makes_zero_network_calls_when_unconfigured(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def _explode(*_args: object, **_kwargs: object) -> None:
        raise AssertionError("aucun appel réseau ne doit partir sans configuration")

    monkeypatch.setattr("httpx.AsyncClient", _explode)
    assert await bellum_api.confirmed_revenue(USER) is None


@pytest.mark.asyncio
async def test_read_tool_refuses_rather_than_returning_an_empty_answer() -> None:
    result = await _run("get_confirmed_revenue")
    assert "error" in result
    assert not any(
        isinstance(value, (list, int, float)) and value for value in result.values()
    )


@pytest.mark.asyncio
async def test_says_forbidden_instead_of_announcing_zero(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """« Pas le droit » et « zéro euro » demandent deux gestes opposés — même garantie que `get_revenue`."""
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)

    async def forbidden(*_args: object, **_kwargs: object) -> dict[str, object]:
        return {"error": "finance_forbidden"}

    monkeypatch.setattr(bellum_api, "confirmed_revenue", forbidden)
    result = await _run("get_confirmed_revenue")
    assert "droit" in result["error"]
    assert "0" not in result["error"]


@pytest.mark.asyncio
async def test_excluded_disputed_travels_unchanged_never_recomputed(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)

    async def confirmed(*_args: object, **_kwargs: object) -> dict[str, object]:
        return {
            "periodMonth": "2026-08-01",
            "amountCents": 500_000,
            "withoutAmount": 0,
            "unavailableReason": None,
            "sourceRows": 4,
            "excludedDisputed": 2,
        }

    monkeypatch.setattr(bellum_api, "confirmed_revenue", confirmed)
    result = await _run("get_confirmed_revenue", {"month": "2026-08"})
    assert result["excludedDisputed"] == 2
    assert result["amountCents"] == 500_000


@pytest.mark.asyncio
async def test_amount_unavailable_is_never_announced_as_zero(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)

    async def confirmed(*_args: object, **_kwargs: object) -> dict[str, object]:
        return {
            "periodMonth": "2026-08-01",
            "amountCents": None,
            "withoutAmount": 0,
            "unavailableReason": "no_source",
            "sourceRows": 0,
            "excludedDisputed": None,
        }

    monkeypatch.setattr(bellum_api, "confirmed_revenue", confirmed)
    result = await _run("get_confirmed_revenue")
    assert result["amountCents"] is None
    assert result["unavailableReason"] == "no_source"


def test_description_never_names_a_fifth_revenue_figure() -> None:
    # PDF 5 §10 — les QUATRE chiffres d'affaires restent exactement quatre ;
    # cet outil est une dérivation séparée, pas un cinquième chiffre.
    description = str(chat_tools.CONFIRMED_REVENUE_TOOL["description"]).lower()
    assert (
        "cinquième" in description
        or "n'est pas" in description
        or "n’est pas" in description
    )
