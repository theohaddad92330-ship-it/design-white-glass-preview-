"""#3247.2/.3 (18/10) — « alternatives à Michelin » : des boulangeries, et du Python brut dans « Pourquoi »."""

from __future__ import annotations

from types import SimpleNamespace
from typing import Any
from unittest.mock import AsyncMock

import pytest

from app.services.chat_tools import execute_chat_tool
from app.services.known_shape_gate import shape_read_from_tool
from tests.test_chat_alternatives_autonomous_subsidiary_3247 import USER, _stub

TOOL = "suggest_account_alternatives"


def _candidate(siren: str, name: str, naf: str) -> dict[str, Any]:
    return {"siren": siren, "name": name, "nafCode": naf, "department": "75",
            "sources": [{"name": "registre", "fetchedAt": "2026-09-28T10:00:00+00:00"}]}


@pytest.mark.asyncio
async def test_michelin_gets_no_candidate_outside_its_sector(monkeypatch: pytest.MonkeyPatch) -> None:
    _stub(monkeypatch, {"855200507": SimpleNamespace(group_affiliation=None, naf_code="2211Z", executives=[])})
    pool = [_candidate("1", "PATISSERIE E.LADUREE", "1071C"), _candidate("2", "BOULANGERIES PAUL", "1071C"),
            _candidate("3", "Fabricant de pneus SA", "2211Z")]

    async def _registry(_req: Any) -> Any:
        return SimpleNamespace(candidates=pool, degraded=[], query={}, recommendedSort="balanced")

    monkeypatch.setattr("app.routers.discover.discover_registry", _registry)
    monkeypatch.setattr("app.services.bellum_api.access_by_siren", AsyncMock(return_value={}))
    monkeypatch.setattr("app.services.bellum_api.community_access_by_siren", AsyncMock(return_value={}))
    result = await execute_chat_tool(
        TOOL, {"company_name": "Michelin", "siren": "855200507", "sectors": ["industry"], "department": "69"}, user_id=USER, profile_data=None
    )
    names = [a["account"]["name"] for a in result["alternatives"]]
    assert names == ["Fabricant de pneus SA"], names


def _texts(node: object) -> list[str]:
    if isinstance(node, str):
        return [node]
    if isinstance(node, dict):
        return [t for v in node.values() for t in _texts(v)]
    if isinstance(node, list):
        return [t for v in node for t in _texts(v)]
    return []


def test_no_python_repr_in_a_rendered_text() -> None:
    output = {
        "source_account_name": "Michelin",
        "alternatives": [{
            "account": {"name": "Pneus SA", "siren": "3"},
            "why_similar": "Même secteur ciblé : industrie",
            "why_easier": "effectif plus réduit",
            "evidence": ["Secteur cible du profil", "surface informatique", "surface informatique"],
            "current_signal": {"type": "legal", "label": "Changement de direction", "date": "2026-10-01"},
        }],
    }
    read = shape_read_from_tool(TOOL, output, language="fr")
    texts = _texts(read["blocks"])
    assert not any("{'" in t or "['" in t for t in texts), texts
    item = read["blocks"]["account_ranking"]["items"][0]
    assert any(t.count("surface informatique") == 1 for t in item["why"])
    assert "Changement de direction" in item["why_now"]


# #4289.3 (recette prod 19/10) — « alternatives à Michelin » (absent du portefeuille) : « aucune alternative… Michelin
# n'étant pas enregistré ». Le modèle ne passe pas toujours `sectors` pour un groupe hors portefeuille : le secteur se
# lit alors au registre public (nom → SIREN → NAF), jamais une erreur « il me faut le secteur ».
@pytest.mark.asyncio
async def test_4289_3_group_outside_portfolio_without_sectors_reads_its_sector_from_the_registry(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _stub(
        monkeypatch,
        {
            "855200507": SimpleNamespace(
                group_affiliation=None,
                naf_code="2211Z",
                executives=[],
                headquarters=SimpleNamespace(department="63"),
                headcount_min=100000,
            )
        },
    )
    pool = [_candidate("3", "Fabricant de pneus SA", "2211Z")]

    async def _registry(req: Any) -> Any:
        return SimpleNamespace(candidates=pool, degraded=[], query={}, recommendedSort="balanced")

    async def _search_company(name: str, **_k: Any) -> Any:
        return SimpleNamespace(siren="855200507", naf_code="2211Z")

    monkeypatch.setattr("app.routers.discover.discover_registry", _registry)
    monkeypatch.setattr("app.services.pappers.search_company", _search_company)
    monkeypatch.setattr("app.services.bellum_api.access_by_siren", AsyncMock(return_value={}))
    monkeypatch.setattr("app.services.bellum_api.community_access_by_siren", AsyncMock(return_value={}))
    result = await execute_chat_tool(TOOL, {"company_name": "Michelin"}, user_id=USER, profile_data=None)
    assert "error" not in result, result
    assert [a["account"]["name"] for a in result["alternatives"]] == ["Fabricant de pneus SA"]
    # Le secteur lu au registre (NAF 22.11Z → industrie) est celui NOMMÉ à l'utilisateur.
    assert "Industrie" in result["alternatives"][0]["why_similar"]
    assert result["alternatives"][0]["why_easier"].startswith("hors du département 63")


@pytest.mark.asyncio
async def test_4289_3_unresolved_group_says_what_is_missing(monkeypatch: pytest.MonkeyPatch) -> None:
    _stub(monkeypatch, {})

    async def _search_company(name: str, **_k: Any) -> Any:
        raise RuntimeError("registre muet")

    monkeypatch.setattr("app.services.pappers.search_company", _search_company)
    result = await execute_chat_tool(TOOL, {"company_name": "Michelin"}, user_id=USER, profile_data=None)
    assert "error" in result
    # L'erreur nomme le groupe et l'action (donner le secteur) — jamais « n'est pas enregistré dans ton portefeuille ».
    assert "Michelin" in result["error"] and "secteur" in result["error"]
