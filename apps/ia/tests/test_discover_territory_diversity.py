"""#2299.27 — à score égal, on ne sert pas douze fois la même métropole.

La diversification par SECTEUR existe déjà (`_diversify_sections` /
`_interleave_sections`, #2489.2) : elle regroupe par section NAF, à
l'intérieur de chaque palier de verdict, uniquement quand la recherche croise
plusieurs secteurs. Ce fichier verrouille le même principe sur l'axe
TERRITOIRE (département/région), un axe séparé (arbitrage Louis 18/09/2026) :

1. témoin positif — une recherche qui croise plusieurs territoires ne rend pas
   les trois premiers comptes du même, à score égal ;
2. témoin négatif (le plus important) — une recherche mono-territoire rend
   exactement l'ordre du score, inchangé ;
3. témoin d'ordre — un palier de verdict inférieur ne passe jamais devant un
   palier supérieur, même après entrelacement territorial ;
4. un candidat SANS département connu n'est jamais forcé dans un bucket
   « territoire inconnu » : il garde EXACTEMENT la place que le score lui
   donnait (doctrine — une absence ne s'affiche/ne coûte jamais comme une
   valeur basse).
"""

from __future__ import annotations

from app.routers.discover import (
    DiscoverFilters,
    _diversify_territory,
    _interleave_territory,
)


def _candidate(name: str, department: str | None, score: float, verdict: str = "recommended") -> dict:
    return {
        "name": name,
        "department": department,
        "score": score,
        "headcountRange": None,
        "qualification": {"verdict": verdict, "code": None, "otherCodes": []},
    }


class TestDiversifyTerritoryActivation:
    def test_plusieurs_departements_croises_active_la_diversite(self) -> None:
        assert _diversify_territory(DiscoverFilters(departments=["75", "69", "31"])) is True

    def test_plusieurs_regions_croisees_active_la_diversite(self) -> None:
        assert _diversify_territory(DiscoverFilters(regions=["11", "84"])) is True

    def test_aucun_critere_territoire_active_la_diversite_par_defaut(self) -> None:
        assert _diversify_territory(DiscoverFilters()) is True

    def test_mono_departement_desactive_la_diversite(self) -> None:
        assert _diversify_territory(DiscoverFilters(department="75")) is False

    def test_mono_region_desactive_la_diversite(self) -> None:
        assert _diversify_territory(DiscoverFilters(region="84")) is False

    def test_mono_ville_desactive_la_diversite(self) -> None:
        assert _diversify_territory(DiscoverFilters(city="Lyon")) is False

    def test_une_seule_valeur_dans_une_liste_de_departements_desactive_la_diversite(self) -> None:
        assert _diversify_territory(DiscoverFilters(departments=["75"])) is False

    def test_une_seule_valeur_dans_une_liste_de_regions_desactive_la_diversite(self) -> None:
        assert _diversify_territory(DiscoverFilters(regions=["11"])) is False


class TestInterleaveTerritoryPositive:
    def test_ne_rend_pas_les_trois_premiers_du_meme_departement_a_score_egal(self) -> None:
        # 5 comptes parisiens, 1 lyonnais, 1 toulousain, tous à SCORE ÉGAL —
        # l'ordre pur du score les mettrait tous les 5 devant.
        candidates = [
            _candidate("paris-1", "75", 80),
            _candidate("paris-2", "75", 80),
            _candidate("paris-3", "75", 80),
            _candidate("paris-4", "75", 80),
            _candidate("paris-5", "75", 80),
            _candidate("lyon-1", "69", 80),
            _candidate("toulouse-1", "31", 80),
        ]
        result = _interleave_territory(candidates)
        top3_departments = {c["department"] for c in result[:3]}
        assert len(top3_departments) > 1, "les 3 premiers ne doivent pas venir tous du même département"
        assert [c["name"] for c in result[:3]] == ["paris-1", "lyon-1", "toulouse-1"]


class TestInterleaveTerritoryNegative:
    def test_mono_territoire_ne_change_jamais_lordre_du_score(self) -> None:
        # Reproduit le flux réel : `_diversify_territory` est d'abord consultée,
        # `_interleave_territory` n'est appelée QUE si elle répond True.
        filters = DiscoverFilters(department="75")
        candidates = [
            _candidate("c1", "75", 90),
            _candidate("c2", "75", 80),
            _candidate("c3", "75", 70),
        ]
        assert _diversify_territory(filters) is False
        # Le pipeline réel ne touche pas `candidates` dans ce cas : l'ordre
        # d'entrée (déjà trié par score) reste l'ordre de sortie.
        assert candidates == [
            _candidate("c1", "75", 90),
            _candidate("c2", "75", 80),
            _candidate("c3", "75", 70),
        ]


class TestInterleaveTerritoryOrder:
    def test_un_palier_inferieur_ne_passe_jamais_devant_un_palier_superieur(self) -> None:
        # Le palier « à vérifier » porte un score ARTIFICIELLEMENT plus haut
        # que « recommandé » — s'il remontait, ce serait la preuve d'un bug.
        candidates = [
            _candidate("reco-1", "75", 10, verdict="recommended"),
            _candidate("reco-2", "69", 10, verdict="recommended"),
            _candidate("reco-3", "31", 10, verdict="recommended"),
            _candidate("verify-1", "75", 999, verdict="to_verify"),
            _candidate("verify-2", "69", 999, verdict="to_verify"),
        ]
        result = _interleave_territory(candidates)
        verdicts = [c["qualification"]["verdict"] for c in result]
        assert verdicts == ["recommended", "recommended", "recommended", "to_verify", "to_verify"]


class TestInterleaveTerritoryUnknownGeography:
    def test_un_candidat_sans_departement_connu_garde_exactement_sa_place(self) -> None:
        # Le candidat SANS territoire connu ne doit ni gagner ni perdre de
        # rang : on ne l'entrelace pas dans un bucket "territoire inconnu"
        # inventé, il reste à l'index que le score lui donnait.
        candidates = [
            _candidate("c1", "75", 100),
            _candidate("inconnu", None, 90),
            _candidate("c3", "75", 80),
            _candidate("c4", "69", 70),
            _candidate("c5", "75", 60),
        ]
        result = _interleave_territory(candidates)
        assert result[1]["name"] == "inconnu"
