"""Lot Q point 5 (#4892) — « Decathlon » : une tête + les entités du groupe, jamais une seule ligne.

Doublure du registre : quatre SIREN « DECATHLON … » (France, SE, SAS de services, fondation). On PROPOSE
le regroupement d'affichage, on ne fusionne jamais : les quatre SIREN voyagent, une seule porte la tête."""

import pytest

from tests._q_harness import company, rank_named

ROWS = [
    company("500569405", "DECATHLON FRANCE", "47.64Z", headcountRange="10000 salariés et plus", headcountTranche="53"),
    company("306138900", "DECATHLON SE", "70.10Z", headcountRange="1000 à 1999 salariés", headcountTranche="42"),
    company("428292390", "DECATHLON SERVICES SAS", "82.99Z", headcountRange="200 à 249 salariés", headcountTranche="22"),
    company("799000111", "FONDATION DECATHLON", "94.99Z", headcountRange="6 à 9 salariés", headcountTranche="03"),
]


@pytest.mark.asyncio
async def test_decathlon_rend_une_tete_et_au_moins_deux_membres(monkeypatch: pytest.MonkeyPatch) -> None:
    response = await rank_named(monkeypatch, ROWS, "Decathlon")
    sirens = {c["siren"] for c in response.candidates}
    assert sirens == {r["siren"] for r in ROWS}  # rien n'est perdu ni fusionné
    heads = [c for c in response.candidates if (c.get("brandGroup") or {}).get("role") == "head"]
    assert len(heads) == 1
    assert len(heads[0]["brandGroup"]["members"]) >= 2
    verdicts = {c["name"]: c["qualification"]["verdict"] for c in response.candidates}
    print(verdicts)


@pytest.mark.asyncio
async def test_la_cible_du_profil_ne_retire_pas_les_entites_d_une_marque_cherchee_par_son_nom(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Chercher « Decathlon » par son nom est un choix EXPLICITE : la cible déclarée (assurance…) ne jette pas les
    entités du groupe avant le regroupement — c'est la perte vue en prod (une seule ligne, sans « + N entités »)."""
    response = await rank_named(monkeypatch, ROWS, "Decathlon", profile={"sectors": ["assurance"]})
    assert {c["siren"] for c in response.candidates} == {r["siren"] for r in ROWS}
    assert response.targetSectorFilter is None  # l'écran ne prétend pas appliquer une cible


@pytest.mark.asyncio
async def test_sans_nom_cherche_la_cible_du_profil_filtre_toujours(monkeypatch: pytest.MonkeyPatch) -> None:
    from tests._q_harness import rank

    response = await rank(monkeypatch, ROWS, profile_data={"sectors": ["assurance"]})
    assert response.targetSectorFilter is not None and response.targetSectorFilter.applied
