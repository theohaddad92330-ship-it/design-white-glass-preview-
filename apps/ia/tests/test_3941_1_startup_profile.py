"""#3941.1 — recette prod R4b (73cd6104b3) : « startup levée de fonds » faisait

répondre Laura « Précise ta demande ». Cause : ni `run_account_search` ni
`find_accounts` n'avaient de moyen de poser le préréglage « Startup » déjà
construit côté écran Découvrir (`discover-query.ts::applyStartupSegment` —
moins de 8 ans, SAS/SASU, PME). Ce fichier prouve que `company_profile:
"startup"` pose les TROIS mêmes critères, au MÊME registre (GA-26) — jamais un
quatrième champ caché.

Aucun critère de levée de fonds n'est ajouté : aucune source ne permet de
CHERCHER par levée (seulement de l'annoncer sur un résultat déjà trouvé,
`funding_feed.py`) — voir le commentaire laissé sur l'issue plutôt qu'un code
qui prétendrait le faire.
"""

from __future__ import annotations

from datetime import date
from typing import Any

import pytest

from app.services.chat_tools import _years_ago_iso, execute_chat_tool

RUN_TOOL = "run_account_search"
FIND_TOOL = "find_accounts"


def _candidate(siren: str, name: str) -> dict[str, Any]:
    return {
        "siren": siren,
        "name": name,
        "city": "Paris",
        "department": "75",
        "nafLabel": "Activité",
        "score": 60,
        "scoreMax": 100,
        "sources": [{"name": "registre", "fetchedAt": "2026-10-14T10:00:00+00:00"}],
    }


class _Response:
    def __init__(self, candidates: list[dict[str, Any]]) -> None:
        self.candidates = candidates
        self.degraded: list[dict[str, Any]] = []
        self.query: dict[str, Any] = {}
        self.recommendedSort = "balanced"


def _stub(monkeypatch: pytest.MonkeyPatch, response: Any) -> list[Any]:
    seen: list[Any] = []

    async def _fake(req: Any) -> Any:
        seen.append(req)
        return response

    monkeypatch.setattr("app.routers.discover.discover_registry", _fake)

    async def _no_portfolio(items: Any, user_id: str) -> None:
        return None

    import app.services.chat_tools as chat_tools

    monkeypatch.setattr(chat_tools, "_attach_owned_account_ids", _no_portfolio)
    return seen


class TestYearsAgoIso:
    def test_huit_ans_avant_le_14_octobre_2026(self) -> None:
        assert _years_ago_iso(8, today=date(2026, 10, 14)) == "2018-10-14"

    def test_29_fevrier_retombe_sur_le_28_une_annee_non_bissextile(self) -> None:
        assert _years_ago_iso(1, today=date(2024, 2, 29)) == "2023-02-28"


@pytest.mark.asyncio
class TestRunAccountSearch:
    async def test_company_profile_startup_pose_les_trois_criteres_du_rail(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        seen = _stub(monkeypatch, _Response([_candidate("111111111", "JEUNE POUSSE")]))
        out = await execute_chat_tool(RUN_TOOL, {"company_profile": "startup"}, user_id="u-1", profile_data={})
        assert "error" not in out
        filters = seen[0].filters
        assert filters.legalCategory == "5710"
        assert filters.companyCategory == ["PME"]
        assert filters.createdAfter is not None and filters.createdAfter[:4].isdigit()

    async def test_seul_sans_secteur_ni_zone_ne_refuse_pas_la_recherche(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        """Avant ce lot, `company_profile` n'existait dans aucune des trois portes
        (schéma, calcul du critère exploitable, filtres transmis) : une demande
        startup seule tombait dans le même refus qu'une recherche vide."""
        _stub(monkeypatch, _Response([]))
        out = await execute_chat_tool(RUN_TOOL, {"company_profile": "startup"}, user_id="u-1", profile_data={})
        assert "error" not in out

    async def test_un_mot_hors_vocabulaire_n_est_jamais_devine(self, monkeypatch: pytest.MonkeyPatch) -> None:
        seen = _stub(monkeypatch, _Response([_candidate("222222222", "SOCIETE ANCIENNE")]))
        out = await execute_chat_tool(
            RUN_TOOL, {"sectors": ["finance"], "company_profile": "licorne"}, user_id="u-1", profile_data={}
        )
        assert "error" not in out
        assert seen[0].filters.legalCategory is None

    async def test_cumulable_avec_un_secteur_et_une_region(self, monkeypatch: pytest.MonkeyPatch) -> None:
        seen = _stub(monkeypatch, _Response([_candidate("333333333", "FINTECH JEUNE")]))
        out = await execute_chat_tool(
            RUN_TOOL,
            {"sectors": ["finance"], "region": ["11"], "company_profile": "startup"},
            user_id="u-1",
            profile_data={},
        )
        assert "error" not in out
        filters = seen[0].filters
        assert filters.regions == ["11"]
        assert filters.legalCategory == "5710"


@pytest.mark.asyncio
class TestFindAccounts:
    async def test_company_profile_startup_voyage_jusqu_a_la_proposition(self) -> None:
        out = await execute_chat_tool(FIND_TOOL, {"company_profile": "startup"}, user_id="u-1", profile_data={})
        assert "error" not in out, out
        assert out["proposal"]["company_profile"] == "startup"
        assert out["proposal"]["cost_credits"] == 0

    async def test_seul_sans_secteur_ne_refuse_pas_la_proposition(self) -> None:
        out = await execute_chat_tool(FIND_TOOL, {"company_profile": "startup"}, user_id="u-1", profile_data={})
        assert "error" not in out

    async def test_un_mot_hors_vocabulaire_n_est_pas_transmis(self) -> None:
        out = await execute_chat_tool(
            FIND_TOOL, {"sectors": ["finance"], "company_profile": "licorne"}, user_id="u-1", profile_data={}
        )
        assert "company_profile" not in out["proposal"]
