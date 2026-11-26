"""Vocabulaire du groupe enrichi (Théo p.12/17) — chaque terme doit porter
sens + impact commercial + provenance (sourceRefs / truthStatus) pour que le front
affiche « d'où ça vient ». ADDITIF au tag déterministe (test_account_vocabulary.py)."""

from __future__ import annotations

from app.services.account_vocabulary import build_vocabulary, enrich_vocabulary
from app.services.truth_status import TRUTH_STATUSES


def _by_term(vocab: dict) -> dict:
    return {t["term"]: t for t in vocab["terms"]}


def test_deterministic_term_carries_sens_impact_and_provenance():
    """Un terme déterministe porte sens (meaning) + impact commercial (commercialWhy)
    + un statut de vérité (provenance), et expose la clé sourceRefs."""
    term = build_vocabulary({"programNames": ["POSIT'V"]})["terms"][0]
    assert term["meaning"].strip()  # sens
    assert term["commercialWhy"].strip()  # impact commercial (pourquoi commercial)
    assert term["truthStatus"] in TRUTH_STATUSES  # provenance = statut de vérité
    assert "sourceRefs" in term  # canal provenance concret présent


def test_deterministic_passes_through_entity_source_refs():
    """Quand une entité de recherche porte déjà ses sourceRefs, ils sont propagés
    au terme (pass-through honnête — aucune donnée inventée)."""
    research = {
        "entitiesExhaustive": [
            {"name": "Axians", "relevance": "operating", "sourceRefs": ["https://pappers.fr/axians"]},
        ],
    }
    by = _by_term(build_vocabulary(research))
    assert by["Axians"]["sourceRefs"] == ["https://pappers.fr/axians"]


def test_deterministic_source_refs_default_empty_never_invented():
    """Sans source amont, sourceRefs reste vide (jamais inventé)."""
    term = build_vocabulary({"programNames": ["Leonard"]})["terms"][0]
    assert term["sourceRefs"] == []


async def test_enrich_new_term_gets_impact_and_provenance():
    """Un terme AJOUTÉ par le LLM porte sens + impact commercial + une provenance :
    truthStatus par défaut = hypothese (déduction IA à valider) et sourceRefs propagés."""
    base = build_vocabulary({"entitiesExhaustive": [{"name": "Axians", "relevance": "operating"}]})

    async def _call(system, user, **k):
        return (
            {
                "terms": [
                    {
                        "term": "ERP Codex",
                        "kind": "tool_erp",
                        "meaning": "ERP maison du groupe",
                        "commercialWhy": "migration en cours = mission d'intégration",
                        "sourceRefs": ["https://exemple.fr/codex"],
                    },
                ]
            },
            None,
        )

    out = await enrich_vocabulary(base, "extraits sources", "VINCI", call=_call)
    codex = _by_term(out)["ERP Codex"]
    assert codex["meaning"].strip()  # sens
    assert codex["commercialWhy"].strip()  # impact commercial
    assert codex["truthStatus"] == "hypothese"  # défaut : déduction IA à valider
    assert codex["sourceRefs"] == ["https://exemple.fr/codex"]  # source propagée


async def test_enrich_respects_llm_truth_status_and_fills_existing_source():
    """Le LLM peut fournir un truthStatus canonique explicite ET des sourceRefs
    pour un terme déterministe qui n'en avait pas encore (ADDITIF)."""
    base = build_vocabulary({"entitiesExhaustive": [{"name": "Axians", "relevance": "operating"}]})

    async def _call(system, user, **k):
        return (
            {
                "terms": [
                    {"term": "Axians", "commercialWhy": "BU IT = porte d'entrée", "sourceRefs": ["axians.com"]},
                    {"term": "POSIT'V", "kind": "program", "meaning": "programme", "truthStatus": "signal"},
                ]
            },
            None,
        )

    out = await enrich_vocabulary(base, "s", "VINCI", call=_call)
    by = _by_term(out)
    assert by["Axians"]["sourceRefs"] == ["axians.com"]  # source ajoutée sur un terme existant
    assert by["POSIT'V"]["truthStatus"] == "signal"  # statut LLM explicite respecté
