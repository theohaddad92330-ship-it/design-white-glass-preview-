"""#2273 (LAU-FINAL-015) — les 5 filtres de qualification (épopée #2959).

Doctrine #2273.8 : une info inconnue sur un filtre produit une VÉRIFICATION,
jamais un rejet silencieux — ce module n'a que deux statuts possibles,
``valide`` et ``a_verifier`` (jamais ``rejete``), et chaque filtre porte sa
raison, jamais une valeur devinée.
"""

from __future__ import annotations

from app.services.compilers.sales_qualification_filters import (
    QUALIFICATION_FILTERS,
    evaluate_qualification_filters,
)


def _breakdown(**axes: int) -> list[dict[str, object]]:
    return [{"axis": axis, "points": points} for axis, points in axes.items()]


class TestFiltresNommes:
    def test_les_cinq_filtres_sont_exposes(self) -> None:
        assert [key for key, _ in QUALIFICATION_FILTERS] == [
            "expertise_utile",
            "voie_acces",
            "voie_achat",
            "prix_zone_modele",
            "timing",
        ]

    def test_aucun_statut_rejete_jamais(self) -> None:
        result = evaluate_qualification_filters(None)
        assert {f["status"] for f in result["filters"]} <= {"valide", "a_verifier"}


class TestExpertiseUtileEtTimingEtVoieAcces:
    def test_axe_fort_valide_le_filtre(self) -> None:
        breakdown = _breakdown(fit_offre=5, accessibilite=4, timing=3)
        result = evaluate_qualification_filters(
            breakdown, purchasing_by_buyer=[{"name": "Filiale X", "contractsAwarded": 1}]
        )
        by_key = {f["key"]: f for f in result["filters"]}
        assert by_key["expertise_utile"]["status"] == "valide"
        assert by_key["voie_acces"]["status"] == "valide"
        assert by_key["timing"]["status"] == "valide"
        # `voie_achat` valide (marché fourni) ; `prix_zone_modele` reste
        # TOUJOURS à vérifier (#2273.6 — aucune source ne le collecte).
        assert result["unknowns"] == ["prix_zone_modele"]

    def test_axe_faible_verifie_jamais_rejete(self) -> None:
        breakdown = _breakdown(fit_offre=1, accessibilite=0, timing=2)
        result = evaluate_qualification_filters(breakdown)
        by_key = {f["key"]: f for f in result["filters"]}
        assert by_key["expertise_utile"]["status"] == "a_verifier"
        assert by_key["voie_acces"]["status"] == "a_verifier"
        assert by_key["timing"]["status"] == "a_verifier"
        assert set(result["unknowns"]) >= {"expertise_utile", "voie_acces", "timing"}

    def test_axe_absent_du_breakdown_se_verifie(self) -> None:
        result = evaluate_qualification_filters([])
        by_key = {f["key"]: f for f in result["filters"]}
        assert by_key["expertise_utile"]["status"] == "a_verifier"
        assert "axe" in by_key["expertise_utile"]["reason"]


class TestVoieAchat:
    def test_marche_deja_attribue_valide_le_filtre(self) -> None:
        result = evaluate_qualification_filters(
            None, purchasing_by_buyer=[{"name": "Filiale X", "contractsAwarded": 2}]
        )
        by_key = {f["key"]: f for f in result["filters"]}
        assert by_key["voie_achat"]["status"] == "valide"

    def test_aucun_marche_connu_se_verifie_jamais_rejete(self) -> None:
        result = evaluate_qualification_filters(None, purchasing_by_buyer=None)
        by_key = {f["key"]: f for f in result["filters"]}
        assert by_key["voie_achat"]["status"] == "a_verifier"


class TestPrixZoneModele:
    def test_toujours_a_verifier_jamais_invente(self) -> None:
        # Aucune donnée de compatibilité prix/zone/modèle n'est collectée
        # ailleurs dans le pipeline : ce filtre ne peut JAMAIS être "valide"
        # tant que cette source n'existe pas — deviner serait une donnée
        # fictive (doctrine CLAUDE.md).
        breakdown = _breakdown(fit_offre=5, accessibilite=5, timing=5)
        result = evaluate_qualification_filters(breakdown, purchasing_by_buyer=[{"name": "X"}])
        by_key = {f["key"]: f for f in result["filters"]}
        assert by_key["prix_zone_modele"]["status"] == "a_verifier"
