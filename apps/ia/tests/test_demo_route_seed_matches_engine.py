"""#2959 — la salle de démonstration montre une route PARTENAIRE : ses mots sont
ceux du moteur, relus ici (une copie qui diverge raconterait une autre route que
celle que l'analyse rendrait)."""

from __future__ import annotations

from pathlib import Path

from app.services.opening_movement import recommended_route_for_plan

DATASET = Path(__file__).resolve().parents[3] / "apps/api/src/modules/demo/demo-dataset.ts"


def _ts(text: str) -> str:
    return text.replace("'", "’")


def test_the_demo_partner_route_is_what_the_engine_computes():
    source = DATASET.read_text(encoding="utf-8")
    route = recommended_route_for_plan(
        {
            "esnProfile": {"stage": "etablie"},
            "account": {"archetype": "grand_groupe"},
            "relationship": {"state": "froid"},
            "declaredPartners": ["Kalvyn Access (exemple)"],
        },
        contacts=[],
    )
    assert route is not None and route["route"] == "partenaire"
    for key, value in route.items():
        assert _ts(value) in source or value in source, f"{key}: « {value} » absent de demo-dataset.ts"
