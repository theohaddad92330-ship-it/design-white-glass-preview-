"""Identité registre d'une entité de cartographie — les TROIS états.

Le bloc « zones blanches » ne connaissait que « confirmé » / « non confirmé », si
bien qu'une direction interne (DSIT, CSIRT — qui n'aura JAMAIS de SIREN, par
définition) et une personne morale parfaitement résolvable (Enedis, SIREN
444608442) tombaient dans le même seau d'échec. Ce module tranche :

  - ``confirmed``  — personne morale rattachée à un SIREN du registre ;
  - ``internal``   — direction / département / équipe : pas de personne morale,
                     donc AUCUNE recherche registre (appel réseau gaspillé) ;
  - ``unresolved`` — personne morale plausible que le registre n'a pas tranchée,
                     avec la raison EXACTE (homonymie vs absence).

Règle d'honnêteté (CLAUDE.md) : aucun SIREN deviné. Une entité interne mal
rattachée à un homonyme serait PIRE que non résolue.
"""

from __future__ import annotations

import pytest

from app.services.entity_identity import (
    SIREN_CONFIRMED,
    SIREN_INTERNAL,
    SIREN_UNRESOLVED,
    is_internal_unit,
    registry_query_name,
    resolve_entity_sirens,
)
from app.services.homonym_disambiguation import HomonymResolution, ScoredCandidate


# ── État 3 : entité interne (jamais de personne morale) ─────────────────────
@pytest.mark.parametrize(
    "name",
    [
        "DSIT (Direction des Systèmes d'Information et Télécoms) Groupe EDF",
        "CSIRT EDF (équipe sécurité informatique)",
        "Direction Générale",
        "Direction des Systèmes d'Information",
        "Département Achats IT",
        "Pôle Data & Analytics",
        "Business Unit Énergie",
        "Cellule Cybersécurité",
        "Division Nucléaire",
    ],
)
def test_internal_units_are_recognised(name):
    assert is_internal_unit(name) is True


@pytest.mark.parametrize(
    "name",
    [
        "EDF SA",
        "Enedis",
        "EDF Renouvelables",
        "Dalkia",
        "Framatome",
        "Euro-Information",
        "Société Générale",
    ],
)
def test_legal_entities_are_not_flagged_internal(name):
    """Une personne morale ne doit JAMAIS être classée interne — sinon on cesse
    de chercher son SIREN alors qu'il est trouvable."""
    assert is_internal_unit(name) is False


def test_structural_type_direction_marks_internal():
    # Le label structurel du LLM ("direction" / "BU") est un signal suffisant même
    # quand le nom seul ne le dit pas.
    assert is_internal_unit("Grand Projets", structural_type="direction") is True
    assert is_internal_unit("Grand Projets", structural_type="filiale") is False


# ── Nettoyage du nom avant interrogation du registre ────────────────────────
def test_registry_query_name_strips_llm_decorations():
    assert registry_query_name("EDF SA (maison mère)") == "EDF SA"
    assert registry_query_name("EDF Renouvelables / EDF power solutions") == "EDF Renouvelables"
    assert registry_query_name("  Enedis  ") == "Enedis"


def test_registry_query_name_keeps_name_when_stripping_would_empty_it():
    assert registry_query_name("(maison mère)") == "(maison mère)"


# ── Résolution : les trois états, sans I/O réseau (résolveur injecté) ───────
def _resolution(status: str, siren: str | None = None, candidates: int = 0) -> HomonymResolution:
    return HomonymResolution(
        status=status,
        selectedSiren=siren,
        candidateCount=candidates,
        candidates=[
            ScoredCandidate(siren=str(900000000 + i), name=f"CANDIDAT {i}") for i in range(candidates)
        ],
    )


@pytest.mark.asyncio
async def test_entity_with_registry_siren_stays_confirmed_without_lookup():
    calls: list[str] = []

    async def resolver(name, **_):
        calls.append(name)
        return _resolution("none")

    entities = [{"name": "Enedis", "siren": "444608442"}]
    summary = await resolve_entity_sirens(entities, resolver=resolver)

    assert entities[0]["sirenStatus"] == SIREN_CONFIRMED
    assert calls == []  # déjà rattachée → aucun appel réseau
    assert summary["confirmed"] == 1


@pytest.mark.asyncio
async def test_internal_entity_is_never_looked_up_and_is_not_an_unknown():
    calls: list[str] = []

    async def resolver(name, **_):
        calls.append(name)
        return _resolution("none")

    entities = [{"name": "CSIRT EDF (équipe sécurité informatique)"}]
    summary = await resolve_entity_sirens(entities, resolver=resolver)

    assert entities[0]["sirenStatus"] == SIREN_INTERNAL
    assert "siren" not in entities[0] or not entities[0].get("siren")
    assert "interne" in entities[0]["sirenReason"].lower()
    assert calls == []  # pas de personne morale → pas d'appel registre
    assert summary["internal"] == 1
    assert summary["unresolved"] == 0


@pytest.mark.asyncio
async def test_plausible_candidate_is_resolved_to_its_siren():
    async def resolver(name, **_):
        assert name == "Enedis"  # nom nettoyé
        return _resolution("selected", siren="444608442", candidates=3)

    entities = [{"name": "Enedis"}]
    summary = await resolve_entity_sirens(entities, resolver=resolver)

    assert entities[0]["siren"] == "444608442"
    assert entities[0]["sirenStatus"] == SIREN_CONFIRMED
    assert entities[0]["sirenSource"] == "recherche-entreprises"
    assert summary["confirmed"] == 1


@pytest.mark.asyncio
async def test_no_candidate_stays_unresolved_with_an_exact_reason():
    async def resolver(name, **_):
        return _resolution("none", candidates=0)

    entities = [{"name": "Entité Introuvable"}]
    await resolve_entity_sirens(entities, resolver=resolver)

    assert entities[0]["sirenStatus"] == SIREN_UNRESOLVED
    assert not entities[0].get("siren")
    assert "aucune entité" in entities[0]["sirenReason"].lower()


@pytest.mark.asyncio
async def test_ambiguous_field_is_not_resolved_and_says_so():
    """Homonymie non tranchée : on NE rattache PAS (un mauvais SIREN serait pire
    qu'aucun), et la raison le dit — pas « non confirmée » à tout faire."""

    async def resolver(name, **_):
        return _resolution("ambiguous", candidates=4)

    entities = [{"name": "Groupe Martin"}]
    await resolve_entity_sirens(entities, resolver=resolver)

    assert entities[0]["sirenStatus"] == SIREN_UNRESOLVED
    assert not entities[0].get("siren")
    assert "homonymie" in entities[0]["sirenReason"].lower()
    assert "4" in entities[0]["sirenReason"]


@pytest.mark.asyncio
async def test_resolver_failure_degrades_to_unresolved_never_raises():
    async def resolver(name, **_):
        raise RuntimeError("registry down")

    entities = [{"name": "Enedis"}]
    summary = await resolve_entity_sirens(entities, resolver=resolver)

    assert entities[0]["sirenStatus"] == SIREN_UNRESOLVED
    assert summary["unresolved"] == 1


@pytest.mark.asyncio
async def test_lookup_budget_is_capped_and_remainder_is_labelled():
    calls: list[str] = []

    async def resolver(name, **_):
        calls.append(name)
        return _resolution("none")

    entities = [{"name": f"Filiale Numéro {i}"} for i in range(10)]
    await resolve_entity_sirens(entities, resolver=resolver, max_lookups=3)

    assert len(calls) == 3
    skipped = [e for e in entities if "limite" in (e.get("sirenReason") or "")]
    assert len(skipped) == 7
    assert all(e["sirenStatus"] == SIREN_UNRESOLVED for e in skipped)


# ── La maison mère : le compte lui-même, déjà résolu en amont ───────────────
@pytest.mark.asyncio
async def test_head_of_group_reuses_the_accounts_already_resolved_siren():
    """« EDF SA (maison mère) » EST le compte. Son SIREN a déjà été résolu par le
    Company Resolver : le rechercher à nouveau est un appel pour rien, et le
    laisser « non confirmé » vide les zones blanches sans raison."""
    calls: list[str] = []

    async def resolver(name, **_):
        calls.append(name)
        return _resolution("ambiguous", candidates=8)

    entities = [{"name": "EDF SA (maison mère)"}]
    summary = await resolve_entity_sirens(
        entities, resolver=resolver, company="EDF", company_siren="552081317"
    )

    assert entities[0]["siren"] == "552081317"
    assert entities[0]["sirenStatus"] == SIREN_CONFIRMED
    assert calls == []  # déjà connu → aucun appel registre
    assert summary["confirmed"] == 1


@pytest.mark.asyncio
async def test_account_siren_is_not_pasted_onto_a_different_entity():
    """Garde anti-invention : le SIREN du compte ne doit JAMAIS déborder sur une
    filiale qui porte un autre nom."""
    async def resolver(name, **_):
        return _resolution("none")

    entities = [{"name": "Enedis"}]
    await resolve_entity_sirens(entities, resolver=resolver, company="EDF", company_siren="552081317")

    assert not entities[0].get("siren")
    assert entities[0]["sirenStatus"] == SIREN_UNRESOLVED


@pytest.mark.asyncio
async def test_no_entities_is_a_noop():
    assert await resolve_entity_sirens(None) == {
        "confirmed": 0,
        "internal": 0,
        "unresolved": 0,
        "lookups": 0,
    }
