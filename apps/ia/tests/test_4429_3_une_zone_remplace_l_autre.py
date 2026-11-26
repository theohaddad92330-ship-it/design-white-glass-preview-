"""#4429.3 (recette prod 23/10) — « Quels comptes à Toulouse cherchent du React ? » après une recherche en
Île-de-France / Grand Est : l'affinage GARDAIT l'ancienne zone à côté de Toulouse. Une zone nommée REMPLACE
la zone précédente (ville / département / région / rayon) ; les autres critères restent."""

from __future__ import annotations

import pytest

from app.services.chat_thread_state import ThreadStateCollector


def _after(previous: dict, fresh: dict, tool: str = "run_account_search") -> dict:
    collector = ThreadStateCollector()
    collector.record(tool, previous, {"accounts": []})
    effective, _ = collector.prepare(tool, {"refine": True, **fresh})
    return effective


def test_toulouse_remplace_ile_de_france_et_garde_la_competence() -> None:
    effective = _after({"region": ["11"], "keywords": "react"}, {"city": "Toulouse"})
    assert effective["city"] == "Toulouse"
    assert "region" not in effective
    assert effective["keywords"] == "react"


@pytest.mark.parametrize(
    ("previous", "fresh", "gone"),
    [
        ({"department": "75"}, {"city": "Toulouse"}, "department"),
        ({"city": "Lyon", "radius_km": 25}, {"region": ["76"]}, "city"),
        ({"city": "Lyon", "radius_km": 25}, {"department": "31"}, "radius_km"),
        ({"region": ["44"]}, {"department": "31"}, "region"),
    ],
)
def test_une_zone_nommee_remplace_toute_zone_precedente(previous, fresh, gone) -> None:
    effective = _after(previous, fresh)
    assert gone not in effective


def test_un_rayon_seul_garde_la_ville() -> None:
    effective = _after({"city": "Toulouse"}, {"radius_km": 25})
    assert effective["city"] == "Toulouse" and effective["radius_km"] == 25


def test_sans_zone_nouvelle_la_zone_precedente_reste() -> None:
    effective = _after({"region": ["11"], "keywords": "java"}, {"keywords": "react"})
    assert effective["region"] == ["11"]


def test_le_drop_explicite_et_le_remplacement_ne_se_battent_pas() -> None:
    effective = _after({"region": ["11"]}, {"city": "Toulouse", "drop": ["region"]})
    assert effective["city"] == "Toulouse" and "region" not in effective
