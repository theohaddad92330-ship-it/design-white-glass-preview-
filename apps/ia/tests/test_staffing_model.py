"""#3244/#3186 (reste, recette prod 30/09) — `_staffing_model()` rendait
TOUJOURS `inconnu` en production : ses needles (« régie »/« forfait »/
« centre de service »/« mixte ») cherchaient ce vocabulaire dans
`staffingModel`/`staffing_model` (`positionnement.ts`), qui porte en réalité
l'axe CDI/freelance (cinq libellés, aucun ne contient ces mots) — un axe
DIFFÉRENT et orthogonal, déjà lu correctement par `_employment_model`.

Le vocabulaire régie/forfait/centre de service EXISTE bien dans le
questionnaire, sur `service_types` (multi-sélection, `offre-secteurs.ts`) :
« Régie », « Forfait », « Centre de services », « Assistance technique » en
sont des options littérales. Ce fichier verrouille la correction : la VALEUR
lue change le résultat, jamais une capture morte (même discipline que
``test_strategy_rank_position.py``).
"""

from __future__ import annotations

from app.services.sales_context import _staffing_model


class TestStaffingModelLitServiceTypes:
    def test_rien_declare_reste_inconnu(self) -> None:
        assert _staffing_model({}) == "inconnu"

    def test_regie_seule(self) -> None:
        assert _staffing_model({"service_types": ["Régie"]}) == "regie"

    def test_assistance_technique_compte_comme_regie(self) -> None:
        assert _staffing_model({"service_types": ["Assistance technique"]}) == "regie"

    def test_forfait_seul(self) -> None:
        assert _staffing_model({"service_types": ["Forfait"]}) == "forfait"

    def test_centre_de_services_seul(self) -> None:
        assert _staffing_model({"service_types": ["Centre de services"]}) == "centre_de_service"

    def test_regie_et_forfait_declares_ensemble_sont_mixte(self) -> None:
        # Deux valeurs DIFFÉRENTES déclarées ⇒ mixte, jamais tranché au
        # hasard vers l'une des deux (même discipline que `_rank_position` :
        # rang1 ET rang2 déclarés ⇒ mixte).
        assert _staffing_model({"service_types": ["Régie", "Forfait"]}) == "mixte"

    def test_types_hors_axe_staffing_restent_inconnu(self) -> None:
        # « Conseil »/« Audit »/« Sous-traitance »/« Produit ou formation »
        # ne classent aucun contrat régie/forfait/centre de service.
        assert _staffing_model({"service_types": ["Conseil", "Audit"]}) == "inconnu"

    def test_camelcase_serviceTypes_est_aussi_lu(self) -> None:
        assert _staffing_model({"serviceTypes": ["Forfait"]}) == "forfait"


class TestStaffingModelNeConfondPasAvecLAxeCdiFreelance:
    def test_un_libelle_cdi_freelance_seul_sur_staffingModel_ne_matche_rien(self) -> None:
        # Régression : c'est EXACTEMENT ce que `_staffing_model` lisait à
        # tort avant #3244/#3186 — aucun des cinq libellés CDI/freelance ne
        # contient « régie »/« forfait »/« centre de service ».
        for label in (
            "Uniquement des CDI internes",
            "Principalement CDI + quelques freelances ponctuels",
            "Mix équilibré CDI / Freelances",
            "Principalement freelances / sous-traitants",
            "Uniquement freelances (pas de CDI)",
        ):
            assert _staffing_model({"staffingModel": label}) == "inconnu", label

    def test_staffingModel_seul_sans_service_types_reste_inconnu(self) -> None:
        assert _staffing_model({"staffingModel": "Uniquement des CDI internes"}) == "inconnu"
