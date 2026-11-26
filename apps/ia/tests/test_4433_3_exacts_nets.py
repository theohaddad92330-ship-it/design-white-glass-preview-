"""#4433.3 (recette prod 23/10) — « /discover react : 10 cartes sur 10 proche alors que le bandeau annonce des
exacts ». Les exacts que le conseil écarte (verdict `excluded`, masqués à l'écran) ne sont pas des exacts
AFFICHÉS : le bandeau les retire de `exactCount`, comme il retire déjà les élargis écartés."""

from __future__ import annotations

from app.routers.discover import _widening_net_of_exclusions


def _query(exact: int) -> dict:
    return {
        "widening": {
            "minResults": 10,
            "exactCount": exact,
            "steps": [{"axis": "skill", "tier": 1, "codes": ["javascript"], "added": 10}],
        }
    }


def test_les_exacts_ecartes_ne_comptent_plus_dans_le_bandeau() -> None:
    companies = [{"siren": "1"}, {"siren": "2"}, {"siren": "3", "widenedBy": {"axis": "skill", "tier": 1}}]
    verdicts = [{"verdict": "excluded"}, {"verdict": "excluded"}, {"verdict": "recommended"}]

    out = _widening_net_of_exclusions(_query(2), companies, verdicts)

    assert out["widening"]["exactCount"] == 0
    assert out["widening"]["steps"][0]["added"] == 10


def test_un_exact_retenu_reste_compte() -> None:
    companies = [{"siren": "1"}, {"siren": "2"}]
    verdicts = [{"verdict": "recommended"}, {"verdict": "excluded"}]

    out = _widening_net_of_exclusions(_query(2), companies, verdicts)

    assert out["widening"]["exactCount"] == 1


def test_sans_exclusion_la_requete_est_rendue_telle_quelle() -> None:
    query = _query(2)
    assert _widening_net_of_exclusions(query, [{"siren": "1"}], [{"verdict": "recommended"}]) is query
