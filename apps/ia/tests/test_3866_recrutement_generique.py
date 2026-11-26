"""#3866 (décision Louis 10/10 soir) — un signal de recrutement GÉNÉRIQUE (offre hors du
domaine de l'offre cherchée) ne prouve PAS l'adéquation : la carte sort « À qualifier »,
raison nommée. Seul un signal qui touche le domaine de l'offre compte comme preuve.
"""

from __future__ import annotations

from typing import Any

import pytest

from app.services.chat_tools import execute_chat_tool

USER = "99999999-9999-4999-8999-999999999999"


def _candidate(label: str, signal_type: str = "hiring") -> dict[str, Any]:
    return {
        "siren": "552032534",
        "name": "FREE SAS",
        "city": "Paris",
        "department": "75",
        "headcount": 1200,
        "nafLabel": "Télécommunications filaires",
        "qualification": {"verdict": "recommended"},
        "sources": [{"name": "registre", "fetchedAt": "2026-09-16T15:26:00+00:00"}],
        "signalsSearched": True,
        "signals": [{"type": signal_type, "label": label, "date": "2026-10-01"}],
    }


class _Response:
    def __init__(self, candidates: list[dict[str, Any]]) -> None:
        self.candidates = candidates
        self.degraded: list[Any] = []
        self.query: dict[str, Any] = {}
        self.recommendedSort = "balanced"


def _stub(monkeypatch: pytest.MonkeyPatch, candidates: list[dict[str, Any]]) -> None:
    async def _fake(req: Any) -> Any:
        return _Response(candidates)

    monkeypatch.setattr("app.routers.discover.discover_registry", _fake)


async def _run(**extra: Any) -> dict[str, Any]:
    return await execute_chat_tool("run_account_search", {"department": "75", **extra}, user_id=USER, profile_data=None)


@pytest.mark.asyncio
async def test_generic_hiring_signal_does_not_prove_data_bi_fit(monkeypatch: pytest.MonkeyPatch) -> None:
    _stub(monkeypatch, [_candidate("Recrute un commercial grand compte")])
    item = (await _run(offer="Data/BI"))["items"][0]
    assert item["verdict"] == "À qualifier"
    assert any("recrutement hors Data/BI : ne prouve pas l'adéquation" in r for r in item["verdict_reasons"])


@pytest.mark.asyncio
async def test_data_hiring_signal_proves_data_bi_fit(monkeypatch: pytest.MonkeyPatch) -> None:
    _stub(monkeypatch, [_candidate("Recrute un data engineer")])
    item = (await _run(offer="Data/BI"))["items"][0]
    assert item["verdict"] == "Recommandé"


@pytest.mark.asyncio
async def test_without_offer_the_hiring_signal_still_counts(monkeypatch: pytest.MonkeyPatch) -> None:
    _stub(monkeypatch, [_candidate("Recrute un commercial grand compte")])
    assert (await _run())["items"][0]["verdict"] == "Recommandé"


@pytest.mark.asyncio
async def test_tender_signal_is_not_a_generic_hiring_signal(monkeypatch: pytest.MonkeyPatch) -> None:
    _stub(monkeypatch, [_candidate("Appel d'offres infogérance", signal_type="tender")])
    assert (await _run(offer="Data/BI"))["items"][0]["verdict"] == "Recommandé"


# DEC-4036 Q14 (Louis 19/10) — l'adéquation exige une COMPÉTENCE NOMMÉE dans l'offre. Une racine
# courte (« bi », « etl », « sql », « dba ») se lisait en PRÉFIXE : « bien-être », « bilingue »,
# « biologiste » prouvaient une adéquation Data/BI sur une offre générique.
@pytest.mark.asyncio
@pytest.mark.parametrize(
    "label",
    [
        "Recrute un commercial bilingue, bien-être au travail",
        "Recrute un biologiste en CDI",
        "Recrute des sqlistes ? non : un chef de chantier",
    ],
)
async def test_q14_generic_offer_with_short_stem_prefix_does_not_prove_fit(
    monkeypatch: pytest.MonkeyPatch, label: str
) -> None:
    _stub(monkeypatch, [_candidate(label)])
    assert (await _run(offer="Data/BI"))["items"][0]["verdict"] == "À qualifier"


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "label", ["Recrute un consultant BI", "Recrute un développeur ETL / SQL", "Recrute un DBA Oracle"]
)
async def test_q14_named_short_skill_still_proves_fit(monkeypatch: pytest.MonkeyPatch, label: str) -> None:
    _stub(monkeypatch, [_candidate(label)])
    assert (await _run(offer="Data/BI"))["items"][0]["verdict"] == "Recommandé"
