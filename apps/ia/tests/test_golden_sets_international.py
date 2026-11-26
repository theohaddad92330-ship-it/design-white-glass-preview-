"""#2437.1 — au moins un parcours golden P0 réellement testé en anglais.

`test_golden_sets_france.py` couvre les sept formes de compte du rapport, mais
son contenu (noms d'entités, libellés) est entièrement en français : aucune de
ses assertions ne prouve que la couche de décision se comporte identiquement
quand le CONTENU (noms d'entités, titres de contact, libellés de signal) est en
anglais — le cas P0 nommé en premier par le rapport (« SG, celui des quinze SCI »,
`TestGrandGroupeBancaire`) n'a pas d'équivalent anglais.

Ce fichier duplique CE cas précis (holding + filiales utiles + véhicules
juridiques à masquer + filiale hors périmètre géographique) avec un contenu
entièrement en anglais, sur un groupe FICTIF assumé (`Northbridge Holdings` —
doctrine « jamais de donnée fictive sous un nom réel », #2130.1-7) : mêmes
fonctions déterministes que la version française, mêmes règles, contenu en
anglais.
"""

from app.services.entity_type import annotate_entity_type, partition_by_display
from app.services.scope_filter import filter_recommended_path


class TestInternationalBankingGroupEnglish:
    """Northbridge Holdings (fictif) — l'équivalent anglais du cas SG."""

    ENTITIES = [
        {"name": "Northbridge Holdings (parent company)"},
        {"name": "Northbridge Retail Bank"},
        {"name": "Northbridge Corporate & Investment Solutions"},
        {"name": "SPV NORTHBRIDGE LEASING TWELVE"},
        {"name": "RISING HARBOUR LEASING LTD"},
        {"name": "NORTHBRIDGE HOLDING OF PARTICIPATIONS"},
        {"name": "Northbridge Asia"},
    ]

    def test_useful_entities_surface_legal_vehicles_stay_hidden(self):
        annotated = [
            annotate_entity_type(
                e,
                is_root=e["name"].endswith("(parent company)"),
                in_scope="Asia" not in e["name"],
            )
            for e in self.ENTITIES
        ]
        buckets = partition_by_display(annotated)
        shown = [e["name"] for e in buckets["shown"]]

        assert "Northbridge Retail Bank" in shown
        assert "Northbridge Corporate & Investment Solutions" in shown
        assert "SPV NORTHBRIDGE LEASING TWELVE" not in shown
        assert "RISING HARBOUR LEASING LTD" not in shown
        # Rien n'est perdu : tout ce qui sort de la vue reste consultable.
        assert len(buckets["shown"]) + len(buckets["hidden"]) + len(buckets["partners"]) == len(self.ENTITIES)

    def test_out_of_scope_geography_is_named_and_excluded_not_dropped_silently(self):
        path = [
            {"name": "Amara", "title": "CIO", "entity": "Northbridge Holdings"},
            {"name": "Kenji", "title": "Chief Data Officer", "entity": "Northbridge Asia"},
        ]
        kept, dropped = filter_recommended_path(path, {"geo_perimeter": "france"})
        assert [p["name"] for p in kept] == ["Amara"]
        assert dropped[0]["excludedReason"]
