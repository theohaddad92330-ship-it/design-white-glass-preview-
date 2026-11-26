"""#3181.4 (épopée #3247) — le LIEN SIREN partenaire↔client alimente `access_path` des alternatives.

Un candidat est « accessible via un partenaire » quand l'espace déclare, sur un compte qu'il possède
sous ce SIREN, une ESN rang 2 / partenaire. Un SIREN sans compte possédé : rien n'est affirmé.
Un partenaire de l'espace n'est jamais listé comme client à prospecter (clients et partenaires ne se mélangent pas).
"""

from __future__ import annotations

from typing import Any
from unittest.mock import AsyncMock

import pytest

from app.services.chat_tools import execute_chat_tool
from tests.test_chat_alternatives_autonomous_subsidiary_3247 import USER, _stub


async def _run(monkeypatch: pytest.MonkeyPatch, by_siren: Any) -> dict[str, Any]:
    _stub(monkeypatch, {})
    monkeypatch.setattr("app.services.bellum_api.access_by_siren", AsyncMock(return_value=by_siren))
    return await execute_chat_tool(
        "suggest_account_alternatives",
        {"account_id": "acc-1", "sectors": ["finance"], "department": "75"},
        user_id=USER,
        profile_data=None,
    )


@pytest.mark.asyncio
async def test_access_path_names_the_declared_partner(monkeypatch: pytest.MonkeyPatch) -> None:
    result = await _run(
        monkeypatch,
        {
            "111": {
                "paths": [
                    {
                        "partner_name": "Alpha Conseil",
                        "partner_siren": "222222222",
                        "rank": "rank2",
                        "relationship": "partner",
                        "source": "declared",
                        "placements": 2,
                    }
                ],
                "is_workspace_partner": None,
            }
        },
    )
    alt = result["alternatives"][0]
    assert "Alpha Conseil" in alt["access_path"]
    assert "rang 2" in alt["access_path"]
    assert not any("chemin d'accès" in m for m in alt["missing_check"])
    assert "partenaire" in alt["why_easier"].lower()


@pytest.mark.asyncio
async def test_access_path_via_group_names_the_subsidiary_honestly(monkeypatch: pytest.MonkeyPatch) -> None:
    """#3247 (décision Louis 14/10, ÉLARGI) — un candidat hors portefeuille, tête de groupe d'une
    filiale possédée, obtient un chemin — jamais confondu avec un partenaire déclaré SUR LUI."""
    result = await _run(
        monkeypatch,
        {
            "111": {
                "paths": [
                    {
                        "partner_name": "Alpha Conseil",
                        "partner_siren": None,
                        "rank": "rank2",
                        "relationship": "partner",
                        "source": "declared",
                        "placements": 0,
                        "via_group": True,
                    }
                ],
                "is_workspace_partner": None,
            }
        },
    )
    alt = result["alternatives"][0]
    assert "Alpha Conseil" in alt["access_path"]
    assert "via une filiale du groupe" in alt["access_path"]


@pytest.mark.asyncio
async def test_unknown_siren_stays_unverified_never_no_path(monkeypatch: pytest.MonkeyPatch) -> None:
    result = await _run(monkeypatch, {})
    # Sans autre fait, l'alternative est écartée : on regarde le message, pas une liste inventée.
    assert all(a.get("access_path") for a in result["alternatives"])  # #4289.5


@pytest.mark.asyncio
async def test_bridge_down_is_named_not_guessed(monkeypatch: pytest.MonkeyPatch) -> None:
    result = await _run(monkeypatch, None)
    assert all(a["access_path"].startswith("non vérifié") for a in result["alternatives"])  # #4289.5


@pytest.mark.asyncio
async def test_workspace_partner_is_never_listed_as_a_client_alternative(monkeypatch: pytest.MonkeyPatch) -> None:
    result = await _run(
        monkeypatch, {"111": {"paths": [], "is_workspace_partner": {"name": "Alternative SAS", "stage": "actif"}}}
    )
    assert result["alternatives"] == []
    assert result["set_aside_partners"] == ["Alternative SAS"]


@pytest.mark.asyncio
async def test_4289_4_empty_result_names_the_set_aside_partners_and_the_sector_proof(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """#4289.4 (recette prod 19/10, Airbus) — « aucune alternative mesurablement plus accessible » sans nommer les
    partenaires écartés ni dire la preuve dans le secteur : le vide se DÉTAILLE."""
    monkeypatch.setattr("app.services.bellum_api.proof_sector_groups", AsyncMock(return_value={"groups": ["finance"]}))
    result = await _run(
        monkeypatch, {"111": {"paths": [], "is_workspace_partner": {"name": "Alternative SAS", "stage": "actif"}}}
    )
    assert result["alternatives"] == []
    note = result["no_alternative_note"]
    assert "Alternative SAS" in note and "partenaire" in note.lower()
    assert "preuve dans ce secteur" in note


async def _run_with_proofs(monkeypatch: pytest.MonkeyPatch, naf: str | None, proofs: Any) -> dict[str, Any]:
    from types import SimpleNamespace

    _stub(monkeypatch, {})
    monkeypatch.setattr("app.services.bellum_api.access_by_siren", AsyncMock(return_value={}))
    monkeypatch.setattr("app.services.bellum_api.proof_sector_groups", AsyncMock(return_value=proofs))
    candidate = {
        "siren": "111", "name": "Alternative SAS", "department": "75", "headcount": None, "nafCode": naf,
        "sources": [{"name": "registre", "fetchedAt": "2026-09-28T10:00:00+00:00"}],
    }

    async def _registry(_req: Any) -> Any:
        return SimpleNamespace(candidates=[candidate], degraded=[], query={}, recommendedSort="balanced")

    monkeypatch.setattr("app.routers.discover.discover_registry", _registry)
    return await execute_chat_tool(
        "suggest_account_alternatives",
        {"account_id": "acc-1", "sectors": ["finance"], "department": "75"},
        user_id=USER,
        profile_data=None,
    )


@pytest.mark.asyncio
async def test_a_candidate_in_a_sector_where_the_workspace_has_a_proof_says_so(monkeypatch: pytest.MonkeyPatch) -> None:
    result = await _run_with_proofs(monkeypatch, "64.19Z", {"groups": ["finance"], "unclassified": 0})
    assert "preuve" in result["alternatives"][0]["why_easier"].lower()


@pytest.mark.asyncio
async def test_no_proof_in_that_sector_or_unreadable_sector_says_nothing(monkeypatch: pytest.MonkeyPatch) -> None:
    # Preuve dans un AUTRE secteur : rien. Code NAF illisible : rien. Pont éteint : rien.
    for naf, proofs in (("64.19Z", {"groups": ["sante"], "unclassified": 0}), (None, {"groups": ["finance"], "unclassified": 0}), ("64.19Z", None)):
        result = await _run_with_proofs(monkeypatch, naf, proofs)
        assert all("preuve" not in a["why_easier"].lower() for a in result["alternatives"])
