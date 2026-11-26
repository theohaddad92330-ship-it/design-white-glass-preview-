"""Deterministic SalesContext classifiers (Annexe Méthodologie Sales ESN).

Mirrors the zod contract `packages/contracts/src/schemas/sales-context.ts`
(PR #661) — enum values + the certainty invariant (p31).
"""

from __future__ import annotations

from app.services.sales_context import (
    ACCOUNT_ARCHETYPES,
    RELATIONSHIP_STATES,
    _bench_band,
    build_sales_context,
    classify_account_archetype,
    classify_esn_stage,
    classify_relationship_state,
)


def _assert_axis_invariant(deriv: str, conf: int, evidence: list[str]) -> None:
    """The contract's superRefine, checked Python-side so we never emit a dict
    the zod schema would reject."""
    if deriv in ("user_declared", "user_override"):
        assert conf == 100
    elif deriv == "inferred":
        assert 1 <= conf <= 99
        assert len(evidence) >= 1
    else:  # default
        assert conf == 0
        assert evidence == []


class TestEsnStage:
    def test_contract_bands(self):
        # Bornes ÉCRITES dans la table p3 de l'annexe (Freelance 0-5, Petite
        # 5-15, Structuration 15-50, Établie 50-200, Grande 200+). Le socle
        # `app.services.esn_stage` en est la source unique — voir
        # `test_esn_stage.py` pour le verrou anti-divergence.
        assert classify_esn_stage("3") == "freelance"
        assert classify_esn_stage("5") == "freelance"
        assert classify_esn_stage("6") == "petite"
        assert classify_esn_stage("15") == "petite"
        assert classify_esn_stage("16") == "structuration"
        assert classify_esn_stage("50") == "structuration"
        assert classify_esn_stage("51") == "etablie"
        assert classify_esn_stage("200") == "etablie"
        assert classify_esn_stage("201") == "grande"
        assert classify_esn_stage("500+") == "grande"

    def test_takes_upper_bound_of_a_range(self):
        assert classify_esn_stage("10-30") == "structuration"

    def test_unknown_defaults_to_safe_small_stage(self):
        assert classify_esn_stage(None) == "petite"
        assert classify_esn_stage("") == "petite"
        assert classify_esn_stage("beaucoup") == "petite"


class TestAccountArchetype:
    def test_regulated_sectors_win(self):
        assert classify_account_archetype("Banque de détail")[0] == "banque_assurance"
        assert classify_account_archetype("Assurance & Mutuelles")[0] == "banque_assurance"
        assert classify_account_archetype("intermédiation monétaire (fintech)")[0] == "banque_assurance"
        assert classify_account_archetype("Administration publique / collectivité")[0] == "public"

    def test_asset_heavy_sectors_are_industrie(self):
        assert classify_account_archetype("Industrie manufacturière")[0] == "industrie"
        assert classify_account_archetype("Énergie & Utilities")[0] == "industrie"
        assert classify_account_archetype("Transport ferroviaire & logistique")[0] == "industrie"

    def test_retail_telecom_media_luxe(self):
        assert classify_account_archetype("Retail & Grande distribution")[0] == "luxe_retail_media"
        assert classify_account_archetype("Opérateur télécom")[0] == "luxe_retail_media"
        assert classify_account_archetype("Groupe audiovisuel et streaming")[0] == "luxe_retail_media"
        assert classify_account_archetype("Maison de luxe / joaillerie")[0] == "luxe_retail_media"

    def test_structure_and_geo_when_sector_generic(self):
        assert classify_account_archetype("Éditeur SaaS, scale-up en hypercroissance")[0] == "startup"
        assert classify_account_archetype("Grand groupe du CAC40")[0] == "grand_groupe"
        assert classify_account_archetype("software company", country="US")[0] == "international"
        assert classify_account_archetype("éditeur de logiciels", country="FR")[0] != "international"

    def test_size_fallback(self):
        assert classify_account_archetype("conseil", employees="8000")[0] == "grand_groupe"
        assert classify_account_archetype("conseil", subsidiary_count=6)[0] == "grand_groupe"
        assert classify_account_archetype("conseil", employees="300")[0] == "pme_eti"

    def test_2625_reuses_decouvrir_insee_size_class(self):
        """#2625.1 — Découvrir calcule déjà la catégorie INSEE (PME/ETI/GE, qui
        croise effectif/CA/bilan) ; l'analyse ne la réemployait pas et ne
        déclarait « grand_groupe » que via le seuil brut effectif>=5000. Une
        entreprise « GE » à moins de 5000 salariés (CA/bilan lourds) n'était
        donc jamais déclarée trop grosse, sans aucune explication visible."""
        # Sous 5000 salariés, le seul effectif ne suffit pas...
        assert classify_account_archetype("conseil", employees="3000")[0] == "pme_eti"
        # ...mais la catégorie INSEE « GE » de Découvrir tranche quand même.
        arch, deriv, conf, ev = classify_account_archetype("conseil", employees="3000", size_class="GE")
        assert arch == "grand_groupe"
        assert deriv == "inferred"
        assert conf > 0
        assert ev  # jamais une classification muette

    def test_2625_insee_eti_or_pme_class_confirms_pme_eti(self):
        arch, _deriv, _conf, ev = classify_account_archetype("conseil", employees=None, size_class="ETI")
        assert arch == "pme_eti"
        assert ev

    def test_2625_naf_and_explicit_wording_still_win_over_size_class(self):
        # Un signal plus fort (NAF officiel / libellé explicite) ne doit
        # JAMAIS être écrasé par la catégorie INSEE.
        assert classify_account_archetype("Banque de détail", size_class="PME")[0] == "banque_assurance"

    def test_unknown_is_default_provenance(self):
        arch, deriv, conf, ev = classify_account_archetype(None)
        assert (arch, deriv, conf, ev) == ("inconnu", "default", 0, [])

    def test_every_result_satisfies_the_contract_invariant(self):
        for sector in ["Banque", "Industrie", "Retail", "startup SaaS", None, "conseil"]:
            _, deriv, conf, ev = classify_account_archetype(sector, employees="250")
            _assert_axis_invariant(deriv, conf, ev)


class TestRelationshipState:
    def test_incumbent_is_declared_rang2(self):
        assert classify_relationship_state(preset="incumbent")[:2] == ("rang2", "user_declared")

    def test_declared_known_account_is_certain(self):
        st, dv, cf, ev, _ = classify_relationship_state(known_status="active")
        assert (st, dv, cf) == ("client_actif", "user_declared", 100)
        assert classify_relationship_state(known_status="former")[0] == "ancien_client"
        assert classify_relationship_state(known_status="engaged-prospect")[0] == "besoin_ouvert"

    def test_tender_signal_is_open_need(self):
        assert classify_relationship_state(preset="signal", signal_type="tender")[:2] == (
            "besoin_ouvert",
            "user_declared",
        )

    def test_kanban_is_inferred(self):
        st, dv, cf, ev, _ = classify_relationship_state(commercial_status="opportunity")
        assert (st, dv) == ("besoin_ouvert", "inferred")
        assert 1 <= cf <= 99 and len(ev) >= 1
        assert classify_relationship_state(commercial_status="customer")[0] == "client_actif"
        assert classify_relationship_state(commercial_status="watching")[0] == "connu"
        assert classify_relationship_state(commercial_status="archived")[0] == "dormant"

    def test_inbox_is_cold_default_unless_crm(self):
        assert classify_relationship_state(commercial_status="inbox") == ("froid", "default", 0, [], None)
        st, dv, cf, ev, _ = classify_relationship_state(commercial_status="inbox", has_crm_presence=True)
        assert (st, dv) == ("connu", "inferred")

    def test_default_is_cold(self):
        assert classify_relationship_state() == ("froid", "default", 0, [], None)

    def test_every_result_satisfies_the_contract_invariant(self):
        for kwargs in [
            {"preset": "incumbent"},
            {"known_status": "active"},
            {"commercial_status": "opportunity"},
            {"commercial_status": "inbox"},
            {"has_crm_presence": True},
            {},
        ]:
            st, dv, cf, ev, _ = classify_relationship_state(**kwargs)
            _assert_axis_invariant(dv, cf, ev)


class TestBuildSalesContext:
    def test_shape_matches_the_contract(self):
        ctx = build_sales_context(
            {"size": "10-30", "salesTeamSize": "Je suis seul (fondateur / indépendant)"},
            {"sector": "Banque de détail", "employees": "60000"},
            commercial_status="inbox",
        )
        assert ctx["salesContextVersion"] == 1
        assert set(ctx.keys()) == {"salesContextVersion", "esnProfile", "account", "relationship"}
        assert set(ctx["esnProfile"].keys()) == {
            "stage",
            "businessModel",
            "capacity",
            "gtm",
            "references",
            "tools",
        }
        assert ctx["esnProfile"]["stage"] == "structuration"
        assert ctx["esnProfile"]["gtm"]["model"] == "founder_led"
        assert ctx["esnProfile"]["gtm"]["salesTeamSize"] == 1
        assert ctx["account"]["archetype"] == "banque_assurance"
        assert ctx["relationship"]["state"] == "froid"
        # every produced value is a legal wire value + invariant-valid
        assert ctx["account"]["archetype"] in ACCOUNT_ARCHETYPES
        assert ctx["relationship"]["state"] in RELATIONSHIP_STATES
        _assert_axis_invariant(ctx["account"]["derivation"], ctx["account"]["confidence"], ctx["account"]["evidence"])
        _assert_axis_invariant(
            ctx["relationship"]["derivation"], ctx["relationship"]["confidence"], ctx["relationship"]["evidence"]
        )

    def test_same_account_different_esn_stage_and_relationship(self):
        # DoD spine: same account facts, different ESN stage → different stage key;
        # same account, cold vs active client → different relationship key.
        small = build_sales_context({"size": "3"}, {"sector": "Banque"}, commercial_status="inbox")
        large = build_sales_context({"size": "800"}, {"sector": "Banque"}, known_status="active")
        assert small["esnProfile"]["stage"] == "freelance"
        assert large["esnProfile"]["stage"] == "grande"
        assert small["relationship"]["state"] == "froid"
        assert large["relationship"]["state"] == "client_actif"
        # archetype is a property of the ACCOUNT, stable across ESN profiles
        assert small["account"]["archetype"] == large["account"]["archetype"] == "banque_assurance"

    def test_empty_inputs_are_safe_defaults(self):
        ctx = build_sales_context({}, {})
        assert ctx["esnProfile"]["stage"] == "petite"
        assert ctx["account"] == {"archetype": "inconnu", "derivation": "default", "confidence": 0, "evidence": []}
        assert ctx["relationship"]["state"] == "froid"


class TestEsnProfileRankPosition:
    """#2645.1 — « clients finaux via un partenaire, rang 2 » : le choix
    `service_types` existait déjà (`offre-prestations.ts`), déclaré depuis le
    questionnaire — mais `businessModel.rankPosition` restait câblé en dur à
    `"inconnu"` (`# rang1/rang2 : pas encore capté au questionnaire`), sans
    aucun builder qui le dérive. Le champ NE conditionne l'angle d'ouverture
    (docstring `esnBusinessModelSchema`, `sales-context.ts`) que s'il est
    RENSEIGNÉ — ce lot le relie à la seule réponse que l'issue nomme."""

    def test_sous_traitance_rang_2_seule_devient_rang2(self):
        ctx = build_sales_context({"service_types": ["Sous-traitance rang 2"]}, {})
        assert ctx["esnProfile"]["businessModel"]["rankPosition"] == "rang2"

    def test_rang_2_combine_a_une_offre_directe_devient_mixte(self):
        ctx = build_sales_context({"service_types": ["Régie", "Sous-traitance rang 2"]}, {})
        assert ctx["esnProfile"]["businessModel"]["rankPosition"] == "mixte"

    def test_aucune_sous_traitance_rang_2_reste_inconnu(self):
        # « Sous-traitance » SEULE (sans « rang 2 ») n'est pas la demande de
        # l'issue : on ne devine pas un rang1 par défaut pour autant.
        ctx = build_sales_context({"service_types": ["Régie", "Sous-traitance"]}, {})
        assert ctx["esnProfile"]["businessModel"]["rankPosition"] == "inconnu"

    def test_service_types_absent_reste_inconnu(self):
        ctx = build_sales_context({}, {})
        assert ctx["esnProfile"]["businessModel"]["rankPosition"] == "inconnu"


class TestBenchBandUnknownAnswers:
    """#2035.9 — une inconnue de disponibilité RESTE inconnue, jamais une bande
    devinée. Les quatre libellés d'incertitude (#2027.1,
    `UNKNOWN_ANSWER_LABELS` dans `onboarding-unknown-answers.ts`) sont persistés
    verbatim dans `available_consultants_band` (`effectif-reel.ts:49`,
    `allowUnknown: true`) : ce test verrouille qu'aucun des quatre ne matche un
    mot-clé de bande de `_bench_band`, donc qu'aucun ne devient jamais « bas »
    (le zéro implicite que la doctrine interdit)."""

    def test_the_four_uncertainty_labels_stay_inconnu(self):
        for label in (
            "Je ne sais pas encore",
            "Non applicable",
            "À vérifier avec mon équipe",
            "Je préfère répondre plus tard",
        ):
            assert _bench_band({"available_consultants_band": label}) == "inconnu"

    def test_absent_answer_stays_inconnu(self):
        assert _bench_band({}) == "inconnu"

    def test_a_real_answer_is_still_classified(self):
        # Non régression : le mécanisme des quatre libellés ne doit pas rendre
        # une vraie réponse mesurée « inconnue » par accident.
        assert _bench_band({"available_consultants_band": "Beaucoup de disponibilité, fort intercontrat"}) == "haut"


def test_enum_tuples_match_the_ts_wire_values():
    # Cross-language lock with packages/contracts/src/schemas/sales-context.ts (PR #661).
    assert ACCOUNT_ARCHETYPES == (
        "startup",
        "pme_eti",
        "grand_groupe",
        "banque_assurance",
        "public",
        "luxe_retail_media",
        "industrie",
        "international",
        "inconnu",
    )
    assert RELATIONSHIP_STATES == (
        "froid",
        "connu",
        "linkedin",
        "dormant",
        "refere",
        "ancien_client",
        "rang2",
        "client_actif",
        "besoin_ouvert",
        "partenaire_actif",  # #2371.4
    )


class TestEsnRevenueModel:
    """#2645.2 — le modèle de revenu, DÉRIVÉ de `revenue_recurrence` (déclaré
    au questionnaire, `sante-activite.ts`), jamais deviné.

    Le piège est dans le libellé : « Un mix de récurrent et de one-shot »
    contient les deux mots. Le mix se reconnaît donc AVANT le one-shot, et le
    one-shot avant le récurrent — un ordre inversé classerait tout mix en
    ponctuel et resserrerait la cadence de quelqu'un qui n'a rien demandé."""

    def _model(self, profile: dict) -> str:
        return build_sales_context(profile, {})["esnProfile"]["businessModel"]["revenueModel"]

    def test_essentiellement_recurrent(self):
        declared = "Essentiellement du contrat récurrent (régie longue, forfait reconduit)"
        assert self._model({"revenueRecurrence": declared}) == "recurrent"

    def test_essentiellement_one_shot(self):
        declared = "Essentiellement du one-shot (mission ponctuelle, projet unique)"
        assert self._model({"revenueRecurrence": declared}) == "ponctuel"

    def test_mix_est_mixte_pas_ponctuel(self):
        assert self._model({"revenueRecurrence": "Un mix de récurrent et de one-shot"}) == "mixte"

    def test_non_declare_reste_inconnu(self):
        assert self._model({}) == "inconnu"

    def test_libelle_hors_catalogue_ne_conclut_rien(self):
        assert self._model({"revenueRecurrence": "Je préfère ne pas dire"}) == "inconnu"

    def test_snake_case_aussi_lu(self):
        declared = "Essentiellement du one-shot (mission ponctuelle, projet unique)"
        assert self._model({"revenue_recurrence": declared}) == "ponctuel"
