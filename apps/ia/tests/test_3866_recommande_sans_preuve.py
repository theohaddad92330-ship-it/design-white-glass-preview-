"""#3866 (recette prod 10/10, conv 3a9866ff) — 8 candidats, 3 cartes « Recommandé » sur
des critères démographiques seuls ; 0 « À qualifier ».

Cause : `qualification.verdict == "recommended"` (Découvrir) veut dire « organisation à
laquelle on PEUT vendre » — pas « adéquation prouvée à la demande ». `run_account_search`
le rendait traduit « Recommandé » ; le modèle le recopiait en badge. Un candidat sans
preuve d'adéquation (ni signal daté, ni angle `why_now`) sort désormais « À qualifier »,
avec la raison NOMMÉE. Un candidat avec preuve garde « Recommandé » ; « À vérifier » et
les autres verdicts ne sont jamais touchés.
"""

from __future__ import annotations

from typing import Any

import pytest

from app.services.chat_tools import execute_chat_tool

USER = "99999999-9999-4999-8999-999999999999"


def _candidate(**overrides: Any) -> dict[str, Any]:
    base: dict[str, Any] = {
        "siren": "552032534",
        "name": "FREE SAS",
        "city": "Paris",
        "department": "75",
        "headcount": 1200,
        "nafLabel": "Télécommunications filaires",
        "qualification": {"verdict": "recommended"},
        "sources": [{"name": "registre", "fetchedAt": "2026-09-16T15:26:00+00:00"}],
    }
    base.update(overrides)
    return base


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


async def _run() -> dict[str, Any]:
    return await execute_chat_tool("run_account_search", {"department": "75"}, user_id=USER, profile_data=None)


@pytest.mark.asyncio
async def test_demographic_only_candidate_is_not_recommended(monkeypatch: pytest.MonkeyPatch) -> None:
    _stub(monkeypatch, [_candidate()])
    item = (await _run())["items"][0]
    assert item["verdict"] == "À qualifier"
    assert any("adéquation" in reason for reason in item["verdict_reasons"])


@pytest.mark.asyncio
async def test_candidate_with_a_named_angle_stays_recommended(monkeypatch: pytest.MonkeyPatch) -> None:
    _stub(monkeypatch, [_candidate(angle="Projet de migration data annoncé en septembre")])
    assert (await _run())["items"][0]["verdict"] == "Recommandé"


@pytest.mark.asyncio
async def test_candidate_with_a_dated_signal_stays_recommended(monkeypatch: pytest.MonkeyPatch) -> None:
    _stub(
        monkeypatch,
        [
            _candidate(
                signalsSearched=True,
                signals=[{"type": "hiring", "label": "Recrute un data engineer", "date": "2026-10-01"}],
            )
        ],
    )
    assert (await _run())["items"][0]["verdict"] == "Recommandé"


@pytest.mark.asyncio
async def test_other_verdicts_are_untouched(monkeypatch: pytest.MonkeyPatch) -> None:
    _stub(monkeypatch, [_candidate(qualification={"verdict": "to_verify"})])
    assert (await _run())["items"][0]["verdict"] == "À vérifier"
