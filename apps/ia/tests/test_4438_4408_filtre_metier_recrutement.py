"""#4438.1 / #4408.1 (recette prod 23/10) — « des comptes data qui recrutent », « qui recrutent des développeurs » :
le MÉTIER devient un filtre d'offres réel. Avant : le métier ne faisait que réordonner une liste du registre
(``order_for_call``), le signal « recrutement » était rendu ``signals_not_applied`` et Laura avouait que le
filtre n'avait pas été appliqué. Les comptes sont désormais choisis PAR les offres (moteur de Découvrir)."""

from __future__ import annotations

from typing import Any

import pytest

from app.services import workspace_scope
from app.services.chat_tools import execute_chat_tool
from app.services.hiring_trade_terms import HIRING_TRADE_MAX_TERMS, trade_offer_terms


class _Response:
    def __init__(self, candidates: list[dict[str, Any]] | None = None) -> None:
        self.candidates = candidates or []
        self.degraded: list[dict[str, Any]] = []
        self.query: dict[str, Any] = {}
        self.recommendedSort = "balanced"


def _stub(monkeypatch: pytest.MonkeyPatch, candidates: list[dict[str, Any]] | None = None) -> list[Any]:
    seen: list[Any] = []

    async def _fake(req: Any) -> Any:
        seen.append(req)
        return _Response(candidates if len(seen) == 1 else [])

    async def _resolve(user_id: str, sb: Any | None = None) -> str | None:
        return "ws-1"

    async def _no_links(items: Any) -> None:
        return None

    monkeypatch.setattr("app.routers.discover.discover_registry", _fake)
    monkeypatch.setattr(workspace_scope, "resolve_workspace_id", _resolve)
    monkeypatch.setattr("app.services.chat_tools.attach_group_links", _no_links)
    return seen


def _searched_terms(seen: list[Any]) -> list[str]:
    return [t for req in seen for t in (req.filters.technologiesObserved or [])]


def test_le_metier_data_se_lit_en_intitules_d_offres() -> None:
    label, terms = trade_offer_terms(["data"])
    assert label == "data"
    assert {"data engineer", "data analyst", "data scientist"} <= set(terms)
    assert len(terms) <= HIRING_TRADE_MAX_TERMS
    assert trade_offer_terms(["développeurs"])[1][0] == "développeur"
    # Un mot qui n'est pas un métier connu ne devient jamais un filtre deviné.
    assert trade_offer_terms(["SFR"]) == (None, [])


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "tool_input",
    [
        {"region": "32", "signals": ["hiring"], "trades": ["data"]},
        {"signals": ["hiring"], "keywords": "data"},
        {"signals": ["hiring"], "technologies": ["data"], "region": "32"},
    ],
)
async def test_comptes_data_qui_recrutent_filtrent_par_les_offres(
    monkeypatch: pytest.MonkeyPatch, tool_input: dict[str, Any]
) -> None:
    seen = _stub(monkeypatch)
    out = await execute_chat_tool("run_account_search", tool_input, user_id="u-1", profile_data=None)
    terms = _searched_terms(seen)
    assert {"data engineer", "data analyst", "data scientist"} <= set(terms)
    # Les termes du métier ne s'élargissent pas au web : la famille EST déjà le métier.
    assert all(req.strictCriteria for req in seen)
    assert "signals_not_applied" not in out
    assert out["hiring_trade_filter"]["trade"] == "data"


@pytest.mark.asyncio
async def test_petites_structures_qui_recrutent_des_developpeurs_en_idf(monkeypatch: pytest.MonkeyPatch) -> None:
    seen = _stub(monkeypatch)
    out = await execute_chat_tool(
        "run_account_search",
        {
            "region": "11",
            "headcount": "50-249",
            "purchasing_process": "light",
            "signals": ["hiring"],
            "keywords": "développeurs",
            "limit": 10,
        },
        user_id="u-1",
        profile_data=None,
    )
    assert "développeur" in _searched_terms(seen)
    assert all(req.filters.headcountMin == 50 for req in seen)
    assert "signals_not_applied" not in out


@pytest.mark.asyncio
async def test_un_compte_rattache_a_un_groupe_est_mis_a_part_avec_sa_barriere(monkeypatch: pytest.MonkeyPatch) -> None:
    """#4408.2 — « 5 comptes semblent rattachés à un groupe » sans être mis à part : une petite structure sans gros
    process achat n'est pas la filiale d'un groupe. Mise à part, barrière NOMMÉE, hors du compte des 10."""
    # #4421.3 — un compte listé pour un recrutement porte SON offre datée (sinon il sort de la liste principale).
    offre = {"latestOffer": {"title": "Développeur H/F", "date": "2026-10-20"}}
    rows = [
        {
            "siren": "111111111",
            "name": "FILIALE SAS",
            "headcount": 120,
            "corporateOfficers": ["GROUPE ALPHA SA"],
            "skillEvidence": offre,
        },
        {"siren": "222222222", "name": "AUTONOME SAS", "headcount": 80, "skillEvidence": offre},
    ]
    _stub(monkeypatch, rows)
    out = await execute_chat_tool(
        "run_account_search",
        {
            "region": "11",
            "headcount": "50-249",
            "purchasing_process": "light",
            "signals": ["hiring"],
            "keywords": "développeurs",
            "limit": 10,
        },
        user_id="u-1",
        profile_data=None,
    )
    assert [item["name"] for item in out["items"]] == ["AUTONOME SAS"]
    apart = out["group_attached_excluded"]
    assert apart[0]["name"] == "FILIALE SAS"
    assert "GROUPE ALPHA SA" in apart[0]["reason"]
    assert "subsidiary_warning" not in out
