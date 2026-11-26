"""#4519.19 (lot récolte 24/10) — une EXPERTISE du référentiel se cherche par ses MÉTIERS, jamais par son libellé.

Constat prod 24/10 : la tuile « Data & Intelligence Artificielle » envoyait ce libellé tel quel à France Travail et
Adzuna (aucune offre ne s'intitule ainsi), puis le filtrait mot à mot : 3 comptes hors sujet. La traduction vit dans le
référentiel (``packages/contracts/src/schemas/criteria-referential.ts`` → miroir ``criteria_referential.json``, GA-26).
"""

from __future__ import annotations

import pytest

from app.services.criteria_referential import expertise_trade_terms
from app.services.discover_skill_offers import harvest_terms


@pytest.mark.parametrize(
    "label",
    ["Data & Intelligence Artificielle", "data & ia", "Data et IA", "DATA & IA", "Data / IA"],
)
def test_data_et_ia_se_traduit_en_metiers_de_la_data(label: str) -> None:
    terms = expertise_trade_terms(label)
    assert terms is not None
    folded = [t.lower() for t in terms]
    for metier in ("data engineer", "data scientist", "data analyst", "machine learning"):
        assert metier in folded
    assert all("&" not in t and "intelligence artificielle" != t.lower() for t in terms)


@pytest.mark.parametrize(
    ("label", "metier"),
    [
        ("Cloud & Infrastructure (AWS, Azure, GCP, Hosting)", "ingénieur cloud"),
        ("Cybersécurité & Conformité", "cybersécurité"),
        ("DevOps, SRE & Automatisation", "ingénieur devops"),
        ("SAP & ERP (S/4HANA, Oracle, Sage)", "consultant sap"),
    ],
)
def test_les_autres_expertises_du_catalogue_ont_leurs_metiers(label: str, metier: str) -> None:
    assert metier in (expertise_trade_terms(label) or [])


@pytest.mark.parametrize("value", ["Vue", "Java", "SAP", "data engineer", "Finance & Contrôle de gestion", ""])
def test_une_competence_ou_une_expertise_inconnue_n_est_pas_traduite(value: str) -> None:
    # La garde dit NON : une compétence reste elle-même, une expertise sans métier déclaré n'est pas devinée.
    assert expertise_trade_terms(value) is None


def test_la_recolte_cherche_les_metiers_a_la_place_du_libelle() -> None:
    terms = harvest_terms(["Data & Intelligence Artificielle"])
    assert "Data & Intelligence Artificielle" not in terms
    assert "data engineer" in [t.lower() for t in terms]


def test_une_competence_ordinaire_passe_inchangee() -> None:
    assert harvest_terms(["Vue", "Java"]) == ["Vue", "Java"]


def test_expertise_et_competence_melangees_sans_doublon() -> None:
    terms = harvest_terms(["Data & IA", "data engineer"])
    assert [t.lower() for t in terms].count("data engineer") == 1


def test_la_moisson_n_envoie_jamais_le_libelle_aux_sources(monkeypatch) -> None:
    import asyncio
    from unittest.mock import AsyncMock

    from app.services import discover_skill_offers as skill

    asked: list[str] = []

    async def _record(term, *_a, **_k):
        asked.append(term)
        return []

    monkeypatch.setattr(skill, "france_travail_offers", _record)
    monkeypatch.setattr(skill, "adzuna_offers", _record)
    monkeypatch.setattr(skill, "cached_offers", _record)
    monkeypatch.setattr(skill, "_harvest_cache_get", AsyncMock(return_value=None))
    monkeypatch.setattr(skill, "_harvest_cache_put", AsyncMock(return_value=None))
    asyncio.run(skill.harvest_skill_offers(["Data & Intelligence Artificielle"], ["75"], {}, deadline=None))
    assert asked, "la moisson n'a rien demandé"
    assert not any("intelligence artificielle" in t.lower() or "&" in t for t in asked)
    assert {"data engineer", "data scientist"} <= {t.lower() for t in asked}
