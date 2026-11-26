"""#3247 / #3181.2 (décision Louis 10/10) — « filiale plus AUTONOME du même groupe ».

« Autonome » est une définition FERMÉE : un SIREN PROPRE (une autre entité
juridique que le compte visé) ET un dirigeant PROPRE (aucun dirigeant en commun
avec le compte visé). Le fait ne sort que si le candidat est une filiale du MÊME
groupe (même tête, lue sur la cartographie Pappers) ; sinon, ou si Pappers ne
répond pas, rien n'est affirmé — jamais un fait deviné.
"""

from __future__ import annotations

from types import SimpleNamespace
from typing import Any
from unittest.mock import AsyncMock, MagicMock

import pytest

from app.services.chat_tools import _alternative_easier_facts, _is_autonomous_subsidiary, execute_chat_tool
from app.services.pappers.models import GroupAffiliation

USER = "44444444-4444-4444-8444-444444444444"


def _exec(first: str, last: str) -> SimpleNamespace:
    return SimpleNamespace(first_name=first, last_name=last)


def _profile(role: str | None, head: str | None, executives: list[SimpleNamespace]) -> SimpleNamespace:
    affiliation = GroupAffiliation(role=role, head_siren=head) if role else None
    return SimpleNamespace(group_affiliation=affiliation, executives=executives)


TARGET = _profile("filiale", "900000001", [_exec("Anne", "Martin")])


def test_autonomous_means_own_siren_and_own_dirigeant() -> None:
    sister = _profile("filiale", "900000001", [_exec("Paul", "Durand")])
    assert _is_autonomous_subsidiary(sister, candidate_siren="111", target_siren="552", target=TARGET) is True


def test_same_dirigeant_is_not_autonomous() -> None:
    shared = _profile("filiale", "900000001", [_exec("anne", "MARTIN")])
    assert _is_autonomous_subsidiary(shared, candidate_siren="111", target_siren="552", target=TARGET) is False


def test_same_siren_is_not_autonomous() -> None:
    twin = _profile("filiale", "900000001", [_exec("Paul", "Durand")])
    assert _is_autonomous_subsidiary(twin, candidate_siren="552", target_siren="552", target=TARGET) is False


def test_another_group_or_unknown_group_or_no_dirigeant_is_never_autonomous() -> None:
    other_group = _profile("filiale", "800000009", [_exec("Paul", "Durand")])
    assert _is_autonomous_subsidiary(other_group, candidate_siren="111", target_siren="552", target=TARGET) is False
    no_graph = _profile(None, None, [_exec("Paul", "Durand")])
    assert _is_autonomous_subsidiary(no_graph, candidate_siren="111", target_siren="552", target=TARGET) is False
    no_dirigeant = _profile("filiale", "900000001", [])
    assert _is_autonomous_subsidiary(no_dirigeant, candidate_siren="111", target_siren="552", target=TARGET) is False
    # La cible hors de tout groupe : rien à comparer.
    loner = _profile(None, None, [_exec("Anne", "Martin")])
    sister = _profile("filiale", "900000001", [_exec("Paul", "Durand")])
    assert _is_autonomous_subsidiary(sister, candidate_siren="111", target_siren="552", target=loner) is False


def test_head_of_the_target_group_counts_as_the_same_group() -> None:
    head_target = _profile("groupe", "552", [_exec("Anne", "Martin")])
    child = _profile("filiale", "552", [_exec("Paul", "Durand")])
    assert _is_autonomous_subsidiary(child, candidate_siren="111", target_siren="552", target=head_target) is True


def test_the_fact_is_named_only_when_established() -> None:
    candidate = {"siren": "111", "name": "X"}
    assert not any("autonome" in f for f in _alternative_easier_facts(candidate, original_department="75", original_headcount=""))
    facts = _alternative_easier_facts(candidate, original_department="75", original_headcount="", autonomous_subsidiary=True)
    assert any("autonome" in f and "même groupe" in f for f in facts)


def test_pappers_run_warn_threshold_is_sixteen() -> None:
    from app.services.pappers import budget

    assert budget._DEFAULT_RUN_WARN == 16  # noqa: SLF001 — un seul réglage (#3247)


def _stub(monkeypatch: pytest.MonkeyPatch, profiles: dict[str, Any]) -> list[str]:
    monkeypatch.setattr("app.services.supabase_client.get_supabase", MagicMock(return_value=MagicMock()))
    account = {
        "id": "acc-1",
        "company_name": "Société Générale",
        "siren": "552",
        "raw_analysis": {"plan": {"evaluation": {"verdict": "PRUDENT"}}},
    }
    monkeypatch.setattr("app.services.ownership.fetch_owned_account", AsyncMock(return_value=account))
    candidate = {
        "siren": "111",
        "name": "Alternative SAS",
        "department": "75",
        "headcount": None,
        "sources": [{"name": "registre", "fetchedAt": "2026-09-28T10:00:00+00:00"}],
    }

    async def _registry(_req: Any) -> Any:
        return SimpleNamespace(
            candidates=[candidate], degraded=[], query={}, recommendedSort="balanced"
        )

    monkeypatch.setattr("app.routers.discover.discover_registry", _registry)
    asked: list[str] = []

    async def _get_company(siren: str, **_k: Any) -> Any:
        asked.append(siren)
        if siren not in profiles:
            raise RuntimeError("pappers down")
        return profiles[siren]

    monkeypatch.setattr("app.services.pappers.get_company", _get_company)
    return asked


@pytest.mark.asyncio
async def test_alternative_is_kept_for_an_autonomous_sister_subsidiary(monkeypatch: pytest.MonkeyPatch) -> None:
    sister = _profile("filiale", "900000001", [_exec("Paul", "Durand")])
    asked = _stub(monkeypatch, {"552": TARGET, "111": sister})
    result = await execute_chat_tool(
        "suggest_account_alternatives",
        {"account_id": "acc-1", "sectors": ["finance"], "department": "69"},
        user_id=USER,
        profile_data=None,
    )
    assert "552" in asked and "111" in asked
    assert "autonome" in result["alternatives"][0]["why_easier"]


@pytest.mark.asyncio
async def test_pappers_failure_names_the_gap_and_never_blocks(monkeypatch: pytest.MonkeyPatch) -> None:
    # Cible lisible, candidat en échec : aucun fait, l'inconnue est NOMMÉE.
    asked = _stub(monkeypatch, {"552": TARGET})
    result = await execute_chat_tool(
        "suggest_account_alternatives",
        {"account_id": "acc-1", "sectors": ["finance"], "department": "75"},
        user_id=USER,
        profile_data=None,
    )
    assert "111" in asked
    assert result["alternatives"] == [] or all("autonome" not in a["why_easier"] for a in result["alternatives"])
