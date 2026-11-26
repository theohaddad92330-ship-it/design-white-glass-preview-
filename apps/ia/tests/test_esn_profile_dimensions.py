"""Les dimensions p4 du profil ESN sont REMPLIES, pas codées « inconnu ».

Le trou (audit §1.A) : `businessModel` / `capacity` / `references` / `tools`
étaient constants (`inconnu` / `[]`) — « capturé ≠ consommé ». Le questionnaire
captait pourtant staffing, TJM, références, secteurs. Ils remontent maintenant
dans le SalesContext.

Sûreté : une dimension NON déclarée reste `inconnu`/`[]`. Jamais inventée.
"""

from __future__ import annotations

from app.services.sales_context import build_sales_context


def _esn(sc: dict) -> dict:
    return sc["esnProfile"]


class TestDimensionsRemplies:
    def test_le_staffing_declare_remonte(self) -> None:
        # #3244/#3186 — le CONTRAT (régie/forfait/centre de service) se
        # déclare sur `service_types` (multi-sélection), jamais sur
        # `staffingModel` (l'axe CDI/freelance, orthogonal — voir
        # `_employment_model`).
        sc = build_sales_context({"service_types": ["Régie", "Assistance technique"]}, {})
        assert _esn(sc)["businessModel"]["staffingModel"] == "regie"

    def test_le_tjm_declare_devient_une_bande(self) -> None:
        assert _esn(build_sales_context({"avgTJM": "620"}, {}))["businessModel"]["tjmBand"] == "moyen"
        assert _esn(build_sales_context({"avgTJM": "350 EUR"}, {}))["businessModel"]["tjmBand"] == "bas"
        assert _esn(build_sales_context({"avgTJM": "900"}, {}))["businessModel"]["tjmBand"] == "haut"

    def test_les_references_et_secteurs_remontent(self) -> None:
        sc = build_sales_context(
            {"references": ["Banque X", "Assureur Y"], "sectors": ["Banque", "Assurance"]}, {}
        )
        refs = _esn(sc)["references"]
        assert refs["clients"] == ["Banque X", "Assureur Y"]
        assert refs["sectors"] == ["Banque", "Assurance"]

    def test_les_outils_remontent(self) -> None:
        sc = build_sales_context({"tools": ["HubSpot", "LinkedIn"]}, {})
        assert _esn(sc)["tools"] == ["HubSpot", "LinkedIn"]

    def test_l_intercontrat_declare_devient_une_bande(self) -> None:
        sc = build_sales_context({"available_consultants_band": "beaucoup d'intercontrats"}, {})
        assert _esn(sc)["capacity"]["benchAvailable"] == "haut"

    def test_les_trois_valeurs_du_questionnaire_lot_l15_se_classent(self) -> None:
        """#2035.5 — la colonne et `_bench_band` existaient déjà (migration
        1780000000000) sans question pour les nourrir. Ce test verrouille les
        TROIS libellés exacts du wizard (`ESN_ANSWER_OPTIONS.available_consultants_band`
        côté contrats) contre le classement bas/moyen/haut : un libellé réécrit
        sans toucher ce test romprait le classement en silence.
        """
        assert (
            _esn(build_sales_context({"availableConsultantsBand": "Aucune disponibilité, planning plein"}, {}))[
                "capacity"
            ]["benchAvailable"]
            == "bas"
        )
        assert (
            _esn(
                build_sales_context(
                    {"availableConsultantsBand": "Quelques consultants disponibles en intercontrat"}, {}
                )
            )["capacity"]["benchAvailable"]
            == "moyen"
        )
        assert (
            _esn(build_sales_context({"availableConsultantsBand": "Beaucoup de disponibilité, fort intercontrat"}, {}))[
                "capacity"
            ]["benchAvailable"]
            == "haut"
        )


class TestSurete:
    def test_un_profil_vide_reste_inconnu_partout(self) -> None:
        esn = _esn(build_sales_context({}, {}))
        # #2645.2 étend `businessModel` d'un cinquième axe (le modèle de revenu) :
        # un profil vide reste inconnu PARTOUT, cinquième axe compris.
        assert esn["businessModel"] == {
            "rankPosition": "inconnu",
            "staffingModel": "inconnu",
            "marginBand": "inconnu",
            "tjmBand": "inconnu",
            "revenueModel": "inconnu",
        }
        assert esn["capacity"]["benchAvailable"] == "inconnu"
        assert esn["references"] == {"sectors": [], "clients": [], "cases": []}
        assert esn["tools"] == []

    def test_un_tjm_non_numerique_ne_devine_pas_de_bande(self) -> None:
        assert _esn(build_sales_context({"avgTJM": "à négocier"}, {}))["businessModel"]["tjmBand"] == "inconnu"

    def test_les_valeurs_restent_dans_l_enum_du_contrat(self) -> None:
        sc = build_sales_context(
            {"service_types": ["Forfait"], "avgTJM": "500", "available_consultants_band": "moyen"}, {}
        )
        bm = _esn(sc)["businessModel"]
        assert bm["staffingModel"] in ("regie", "forfait", "centre_de_service", "mixte", "inconnu")
        assert bm["tjmBand"] in ("bas", "moyen", "haut", "inconnu")
        assert _esn(sc)["capacity"]["benchAvailable"] in ("bas", "moyen", "haut", "inconnu")
