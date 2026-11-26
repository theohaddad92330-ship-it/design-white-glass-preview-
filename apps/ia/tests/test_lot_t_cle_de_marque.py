"""Lot T point 3 — la clé de marque ignore les mots de forme juridique et les génériques (« SOCIETE »…).

Recette prod 01/11 : SOCIETE GESER BEST (head) regroupée avec SOCIETE GENERALE (member) sur le mot « SOCIETE »."""

from __future__ import annotations

import pytest

from app.services.brand_grouping import group_by_brand


def _c(name: str, siren: str, **extra) -> dict:
    return {"name": name, "siren": siren, **extra}


def test_geser_best_et_societe_generale_ne_forment_aucun_groupe() -> None:
    rows = [_c("SOCIETE GESER BEST", "383934742"), _c("SOCIETE GENERALE", "552120222")]
    group_by_brand(rows)
    assert all("brandGroup" not in r for r in rows)


def test_decathlon_et_decathlon_france_forment_un_groupe() -> None:
    rows = [_c("DECATHLON", "306138900"), _c("DECATHLON FRANCE", "500569405", headcountRange="10 000 salariés")]
    group_by_brand(rows)
    assert rows[1]["brandGroup"]["role"] == "head"
    assert rows[0]["brandGroup"] == {"role": "member", "headSiren": "500569405", "headName": "DECATHLON FRANCE"}


@pytest.mark.parametrize("generic", ["CABINET", "COMPAGNIE", "ETABLISSEMENTS", "GROUPE", "HOLDING"])
def test_un_mot_generique_ne_fait_pas_une_marque(generic: str) -> None:
    rows = [_c(f"{generic} ALPHAVILLE", "1"), _c(f"{generic} BETAGONE", "2")]
    group_by_brand(rows)
    assert all("brandGroup" not in r for r in rows)
