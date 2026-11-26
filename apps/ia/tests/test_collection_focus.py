"""L'archétype pilote la COLLECTE (DoD p31 n°3, moitié SOURCES).

Le trou : « compte public vs startup → procurement, SOURCES et temporalité
différents ». Les ACTIONS écoutaient l'archétype, mais pas la collecte : BOAMP
et DECP (sources de secteur public français) tournaient inconditionnellement pour
tout compte FR — même une startup, qui n'a aucun marché public.

Sûreté vérifiée ici : on ne retire une source QUE quand le compte ne peut pas en
avoir (siège hors FR, startup avérée). Un archétype inconnu, un compte public, un
grand groupe : tout tourne comme avant. On ne présume JAMAIS l'absence de signal.
"""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from app.services.collection_focus import plan_collection, preliminary_account_archetype
from app.services.sales_context import _FR_COUNTRIES, _NAF_DIVISION_TO_ARCHETYPE


class TestSourcesPubliquesGatees:
    def test_un_siege_hors_france_ne_declenche_pas_les_marches_publics_fr(self) -> None:
        plan = plan_collection(country="US", naf_code=None, sector_text="SaaS")

        assert plan.run_public_tenders is False
        assert "France" in plan.reason or "FR" in plan.reason

    def test_une_startup_averee_ne_declenche_pas_les_marches_publics(self) -> None:
        plan = plan_collection(country="FR", sector_text="startup SaaS en hypercroissance")

        assert plan.archetype == "startup"
        assert plan.run_public_tenders is False

    def test_un_compte_public_garde_ses_appels_d_offres(self) -> None:
        """NAF 84 = administration publique. C'est LE compte pour qui BOAMP/DECP
        comptent — ils ne doivent jamais être gatés."""
        plan = plan_collection(country="FR", naf_code="8411Z")

        assert plan.archetype == "public"
        assert plan.run_public_tenders is True

    def test_un_grand_groupe_prive_garde_les_sources(self) -> None:
        plan = plan_collection(country="FR", sector_text="grand groupe CAC40", employees=8000)

        assert plan.run_public_tenders is True


class TestSurete:
    @pytest.mark.parametrize(
        "kwargs",
        [
            {"country": "FR"},
            {"country": None},
            {"country": "", "naf_code": None, "sector_text": None},
            {"country": "France", "sector_text": "activité inconnue"},
        ],
    )
    def test_un_archetype_indetermine_garde_tout(self, kwargs: dict) -> None:
        """SÛRETÉ : sans signal tranchant, l'archétype est inconnu et RIEN n'est
        retiré — comportement historique, aucun signal perdu."""
        plan = plan_collection(**kwargs)

        assert plan.run_public_tenders is True

    def test_le_gate_depend_bien_de_l_archetype(self) -> None:
        """Le cœur du critère : deux comptes, seul l'archétype change, et le jeu de
        sources diffère. C'est la preuve que la collecte est pilotée par
        l'archétype, pas figée."""
        startup = plan_collection(country="FR", sector_text="startup en hypercroissance")
        public = plan_collection(country="FR", naf_code="8411Z")

        assert startup.run_public_tenders != public.run_public_tenders

    def test_l_archetype_preliminaire_reutilise_le_classifieur_canonique(self) -> None:
        """Même règle que l'archétype final (pas une seconde échelle) : le NAF
        officiel prime, un libellé tranche à défaut."""
        assert preliminary_account_archetype(naf_code="6419Z") == "banque_assurance"
        assert preliminary_account_archetype(sector_text="collectivité territoriale") == "public"
        assert preliminary_account_archetype() == "inconnu"

    def test_le_reason_est_toujours_renseigne(self) -> None:
        for plan in (
            plan_collection(country="US"),
            plan_collection(country="FR", sector_text="startup"),
            plan_collection(country="FR", naf_code="8411Z"),
        ):
            assert plan.reason.strip()


# ── #2288.4 (c66) — le devis de vérification dit ce que CETTE gate fera ──────
#
# Le devis (`GET /analysis/launch-plan`, NestJS) annonce BOAMP/DECP quand le
# pays cible est la France ET que le NAF déjà persisté de l'entité FIXE
# l'archétype (`forecastPublicTenderSources`,
# `packages/contracts/src/schemas/public-tenders-gate.ts`). La racine Railway
# de l'IA est `apps/ia` : rien de `packages/` n'y est importable, les
# constantes voyagent en JSON. Ces tests rougissent dès que la gate Python
# s'écarte de ce que le devis croit d'elle — table, pays, et COMPORTEMENT.

SHARED_GATE = (
    Path(__file__).resolve().parents[3]
    / "packages"
    / "contracts"
    / "src"
    / "schemas"
    / "public-tenders-gate.constants.json"
)


def _shared_gate() -> dict:
    assert SHARED_GATE.exists(), f"constantes partagées introuvables : {SHARED_GATE}"
    return json.loads(SHARED_GATE.read_text(encoding="utf-8"))


class TestLaGateEstCelleQueLeDevisAnnonce:
    def test_le_json_partage_lit_un_corpus_non_vide(self) -> None:
        shared = _shared_gate()
        assert len(shared["nafDivisionToArchetype"]) >= 40
        assert shared["nafDivisionToArchetype"]["84"] == "public"

    def test_la_table_naf_est_celle_du_classifieur(self) -> None:
        assert dict(_NAF_DIVISION_TO_ARCHETYPE) == _shared_gate()["nafDivisionToArchetype"]

    def test_les_pays_france_sont_ceux_de_la_gate(self) -> None:
        assert list(_FR_COUNTRIES) == _shared_gate()["frenchCountries"]

    def test_chaque_division_fixe_l_archetype_et_la_decision_annoncee(self) -> None:
        # Le COMPORTEMENT, pas seulement la table : pour chaque division que le
        # devis croit décisive, la vraie `plan_collection` rend l'archétype
        # attendu et garde (ou écarte) les marchés publics comme annoncé — même
        # avec un libellé et un effectif qui, seuls, pencheraient ailleurs.
        shared = _shared_gate()
        excluded = set(shared["archetypesWithoutPublicTenders"])
        for division, archetype in shared["nafDivisionToArchetype"].items():
            plan = plan_collection(country=None, naf_code=f"{division}.10Z", sector_text="startup", employees=3)
            assert plan.archetype == archetype, division
            assert plan.run_public_tenders is (archetype not in excluded), division

    def test_les_archetypes_ecartes_sont_ceux_que_la_gate_ecarte(self) -> None:
        shared = _shared_gate()
        assert shared["archetypesWithoutPublicTenders"] == ["international", "startup"]
        assert plan_collection(country="CH").run_public_tenders is False
        assert plan_collection(country="FR", sector_text="startup").run_public_tenders is False
        # …et elle sait dire OUI : un archétype inconnu garde tout.
        assert plan_collection(country="FR").run_public_tenders is True
