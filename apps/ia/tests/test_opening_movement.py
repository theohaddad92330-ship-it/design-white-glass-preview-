"""Deterministic opening-movement routing (Annexe méthodo p13, TABLE C)."""

from __future__ import annotations

import pytest

from app.services.opening_movement import (
    COMMERCIAL_ROUTES,
    OPENING_MOVEMENTS,
    STRATEGY_SELECTION_CRITERIA,
    commercial_route_brief,
    commercial_route_brief_from_context,
    movement_prompt_block,
    recommend_commercial_route,
    recommend_movement_from_context,
    recommend_opening_movement,
    recommend_route_from_context,
    route_recommendation,
    route_recommendation_from_context,
    strategy_criteria_from_context,
    strategy_selection_criteria,
)


def _mv(esn, arch, rel):
    return recommend_opening_movement(esn, arch, rel)["movement"]


def _rt(esn, arch, rel):
    return recommend_commercial_route(esn, arch, rel)["route"]


class TestMovementRouting:
    def test_rang2_relationship_wins_over_everything(self):
        assert _mv("grande", "public", "rang2") == "rang2"

    def test_public_archetype_routes_to_the_contractual_movement(self):
        assert _mv("petite", "public", "froid") == "public"

    def test_open_need_is_reverse_prospecting(self):
        assert _mv("petite", "banque_assurance", "besoin_ouvert") == "prospection_inversee"

    def test_strong_tie_goes_top_down(self):
        assert _mv("petite", "grand_groupe", "client_actif") == "top_down"
        assert _mv("freelance", "pme_eti", "ancien_client") == "top_down"
        assert _mv("petite", "startup", "refere") == "top_down"

    def test_big_complex_cold_account_is_sandwich(self):
        assert _mv("etablie", "grand_groupe", "froid") == "sandwich"
        assert _mv("grande", "banque_assurance", "connu") == "sandwich"

    def test_small_esn_cold_is_bottom_up(self):
        assert _mv("petite", "pme_eti", "froid") == "bottom_up"
        assert _mv("freelance", "startup", "connu") == "bottom_up"

    def test_default_is_middle_out(self):
        # established ESN, generic archetype, cold → manager-level entry
        assert _mv("etablie", "pme_eti", "froid") == "middle_out"

    def test_priority_public_beats_size_and_relationship_but_not_rang2(self):
        # rang2 (partner in place) must not be overridden by the public route.
        assert _mv("petite", "public", "rang2") == "rang2"
        # but public beats a cold small-ESN bottom-up default.
        assert _mv("petite", "public", "froid") == "public"


class TestContractShape:
    def test_every_movement_carries_a_sequence_and_rationale(self):
        r = recommend_opening_movement("petite", "pme_eti", "froid")
        assert set(r.keys()) == {"movement", "sequence", "rationale"}
        assert r["movement"] in OPENING_MOVEMENTS
        assert r["sequence"] == OPENING_MOVEMENTS["bottom_up"]
        assert r["rationale"]

    def test_ten_movements_defined(self):
        # #2312.17/.18/.19/.20 (épopée #2963) — les quatre stratégies de
        # pénétration de compte de l'issue (PARTENAIRE=rang2, RÉACTIVATION,
        # FILIALE/SITE, RÉFÉRENCEMENT) rejoignent les 7 mouvements p13.
        assert set(OPENING_MOVEMENTS) == {
            "bottom_up",
            "middle_out",
            "top_down",
            "sandwich",
            "rang2",
            "prospection_inversee",
            "public",
            "reactivation",
            "filiale_site",
            "referencement",
        }

    def test_reads_the_sales_context_dict(self):
        ctx = {
            "esnProfile": {"stage": "freelance"},
            "account": {"archetype": "pme_eti"},
            "relationship": {"state": "froid"},
        }
        assert recommend_movement_from_context(ctx)["movement"] == "bottom_up"

    def test_empty_context_is_a_safe_default(self):
        # no signal → middle_out (manager-accessible), never a top-down/board reach
        assert recommend_movement_from_context({})["movement"] == "middle_out"
        assert recommend_movement_from_context(None)["movement"] == "middle_out"


class TestReactivationDistincteDuTopDown:
    """#2312.19 — RÉACTIVATION (« réouvrir une relation existante ») était
    fondue dans `top_down` via `_STRONG_TIE` : `dormant` (relation déjà
    existante, mais éteinte) tombait dans `_COLD_ISH`, indistinguable d'une
    relation qui n'a jamais existé (constat audit 25/09/2026)."""

    def test_dormant_devient_reactivation_jamais_top_down_ni_le_defaut(self):
        assert _mv("etablie", "pme_eti", "dormant") == "reactivation"
        assert _mv("grande", "industrie", "dormant") == "reactivation"

    def test_dormant_prime_sur_larchetype_grand_compte(self):
        # Un grand compte froid tombe en sandwich — mais un grand compte
        # DORMANT (relation déjà connue, pas froide) tombe en réactivation.
        assert _mv("grande", "grand_groupe", "dormant") == "reactivation"

    def test_rang2_et_public_priment_toujours_sur_dormant(self):
        assert _mv("petite", "public", "rang2") == "rang2"
        assert _mv("petite", "public", "dormant") == "public"


class TestRationaleNeverLeaksAnIdentifier:
    """#2500 (démo, GÊNANT, mesuré en prod le 17/09/2026) — le plan d'action
    affichait « (grand_groupe) » : `movement_prompt_block` injecte `rationale`
    tel quel dans le prompt système, et le modèle peut la reciter verbatim dans
    le plan lu par le commercial. Aucun identifiant technique (snake_case) ne
    doit jamais apparaître dans une phrase destinée à être lue."""

    def test_no_rationale_contains_a_raw_identifier(self):
        archetypes = ["startup", "pme_eti", "grand_groupe", "banque_assurance", "public", None]
        relationships = ["froid", "connu", "client_actif", "rang2", "besoin_ouvert", None]
        stages = ["freelance", "petite", "etablie", "grande", None]
        for stage in stages:
            for archetype in archetypes:
                for relationship in relationships:
                    r = recommend_opening_movement(stage, archetype, relationship)
                    assert "_" not in r["rationale"], r["rationale"]

    def test_big_complex_sandwich_names_the_archetype_in_french(self):
        # Le cas exact vu en recette : grand groupe froid → mouvement sandwich.
        r = recommend_opening_movement("etablie", "grand_groupe", "froid")
        assert "grand_groupe" not in r["rationale"]
        assert "grand groupe" in r["rationale"]
        r2 = recommend_opening_movement("grande", "banque_assurance", "connu")
        assert "banque_assurance" not in r2["rationale"]
        assert "banque/assurance" in r2["rationale"]


class TestCommercialRouteRouting:
    """#2273.9-.21 (épopée #2959) — 13 routes commerciales nommées. Une route est
    COMMENT le compte est entré ; le mouvement (ci-dessus) est la tactique de
    hiérarchie une fois la route choisie."""

    def test_thirteen_signal_free_routes_defined(self):
        assert set(COMMERCIAL_ROUTES) - {
            "consultant_present",
            "ancien_consultant",
            "signal_entrant",
            "veille_seule",
            "depuis_talent",
            # #3278.1 (décision Louis 11/10/2026) — portées par un fait déclaré.
            "evenement_communaute",
            "inbound_contenu",
        } == {
            "relation_existante",
            "reactivation",
            "direct_accessible",
            "filiale_site",
            "bottom_up",
            "middle_out",
            "sponsor",
            "rang_2",
            "partenaire",
            "prospection_inversee",
            "appel_offres",
            "expansion_client",
            "recommandation",
        }
        assert len(COMMERCIAL_ROUTES) == 20

    def test_subcontractor_relationship_routes_rang_2(self):
        assert _rt("grande", "public", "rang2") == "rang_2"

    def test_public_archetype_routes_to_appel_offres(self):
        assert _rt("petite", "public", "froid") == "appel_offres"

    def test_open_need_routes_to_prospection_inversee(self):
        assert _rt("petite", "banque_assurance", "besoin_ouvert") == "prospection_inversee"

    def test_active_client_routes_to_expansion_client(self):
        assert _rt("petite", "grand_groupe", "client_actif") == "expansion_client"

    def test_former_client_routes_to_reactivation(self):
        assert _rt("freelance", "pme_eti", "ancien_client") == "reactivation"

    def test_dormant_relationship_routes_to_reactivation_not_the_cold_default(self):
        """#3431 (30/09/2026, recette RÉFUTÉ) — AVANT ce lot, `dormant` ne
        correspondait à aucune branche de `recommend_commercial_route` (il
        n'est pas dans `_COLD_ISH`, #2312.19, et aucun `if relationship ==
        "dormant"` n'existait ici, à la différence de `recommend_opening_movement`
        qui le traite depuis #2312.19) : il retombait sur le défaut générique
        `direct_accessible`, sans aucun mot pour distinguer une relation qui a
        déjà existé d'un premier contact froid — exactement ce que la recette
        a observé (3 contacts SG proposés sans jamais nommer dormant vs froid)."""
        assert _rt("grande", "industrie", "dormant") == "reactivation"
        assert "dormante" in recommend_commercial_route("grande", "industrie", "dormant")["rationale"]

    def test_referred_account_routes_to_recommandation(self):
        assert _rt("petite", "startup", "refere") == "recommandation"

    def test_big_complex_cold_account_routes_to_filiale_site(self):
        assert _rt("etablie", "grand_groupe", "froid") == "filiale_site"
        assert _rt("grande", "banque_assurance", "connu") == "filiale_site"

    def test_small_esn_cold_routes_to_bottom_up(self):
        assert _rt("petite", "pme_eti", "froid") == "bottom_up"
        assert _rt("freelance", "startup", "connu") == "bottom_up"

    def test_default_routes_to_direct_accessible(self):
        assert _rt("etablie", "pme_eti", "froid") == "direct_accessible"

    def test_default_cold_relationship_is_named_in_the_rationale(self):
        """#3431 — un compte qui tombe dans le défaut ET dont la relation EST
        mesurée froide/connue/LinkedIn (`_COLD_ISH`) voit désormais cette
        température NOMMÉE dans la rationale (« à contextualiser plutôt qu'un
        message générique ») — jamais sur une relation non mesurée (doctrine
        « non mesuré n'est jamais 0 »)."""
        froid = recommend_commercial_route("etablie", "pme_eti", "froid")
        assert froid["route"] == "direct_accessible"
        assert "froide" in froid["rationale"]
        # Non mesurée (aucun signal) : le texte générique reste inchangé,
        # aucune température devinée.
        non_mesure = recommend_commercial_route("etablie", "pme_eti", None)
        assert non_mesure["route"] == "direct_accessible"
        assert non_mesure["rationale"] == "cas par défaut : un décideur accessible porte l'entrée, sans détour connu"

    def test_priority_matches_the_movement_priority_order(self):
        # rang2 (partner in place) must not be overridden by the public route.
        assert _rt("petite", "public", "rang2") == "rang_2"
        assert _rt("petite", "public", "froid") == "appel_offres"

    def test_two_contrasted_profiles_get_different_routes(self):
        """Garde anti-générique locale (#2273.35, sur cette brique) : deux profils
        de compte différents ne reçoivent pas la même route."""
        assert _rt("petite", "pme_eti", "froid") != _rt("etablie", "pme_eti", "froid")

    def test_every_route_carries_a_label_and_rationale(self):
        r = recommend_commercial_route("petite", "pme_eti", "froid")
        assert set(r.keys()) == {"route", "label", "rationale"}
        assert r["route"] in COMMERCIAL_ROUTES
        assert r["label"] == COMMERCIAL_ROUTES["bottom_up"]
        assert r["rationale"]

    def test_reads_the_sales_context_dict(self):
        ctx = {
            "esnProfile": {"stage": "freelance"},
            "account": {"archetype": "pme_eti"},
            "relationship": {"state": "froid"},
        }
        assert recommend_route_from_context(ctx)["route"] == "bottom_up"

    def test_empty_context_is_a_safe_default(self):
        assert recommend_route_from_context({})["route"] == "direct_accessible"
        assert recommend_route_from_context(None)["route"] == "direct_accessible"

    def test_no_rationale_contains_a_raw_identifier(self):
        archetypes = ["startup", "pme_eti", "grand_groupe", "banque_assurance", "public", None]
        relationships = [
            "froid",
            "connu",
            "linkedin",
            "dormant",
            "client_actif",
            "rang2",
            "besoin_ouvert",
            "ancien_client",
            "refere",
            None,
        ]
        stages = ["freelance", "petite", "etablie", "grande", None]
        for stage in stages:
            for archetype in archetypes:
                for relationship in relationships:
                    r = recommend_commercial_route(stage, archetype, relationship)
                    assert "_" not in r["rationale"], r["rationale"]


class TestStrategySelectionCriteria:
    """#2312.21 (épopée #2963, décision Louis 28/09) — les DIX critères nommés,
    et lesquels PÈSENT réellement. Cinq audits (24-27/09) ont reconfirmé que la
    seule source autoritaire (TABLE C) n'en croise que trois : ce test verrouille
    que les sept autres restent NOMMÉS NON ÉVALUABLES plutôt qu'un poids deviné,
    et que les trois sourcés reçoivent un poids ÉGAL entre eux."""

    def test_the_thirteen_named_criteria_are_all_present_and_in_order(self):
        criteria = strategy_selection_criteria("petite", "pme_eti", "froid")
        assert [c["key"] for c in criteria] == list(STRATEGY_SELECTION_CRITERIA.keys())
        assert len(criteria) == 15

    def test_the_three_sourced_criteria_are_evaluable_with_equal_weight(self):
        criteria = {c["key"]: c for c in strategy_selection_criteria("petite", "pme_eti", "froid")}
        sourced = ["esn_stage", "account_archetype", "relationship_state"]
        for key in sourced:
            assert criteria[key]["evaluable"] is True
            assert criteria[key]["weight"] == pytest.approx(1 / 3)
        # Poids ÉGAL : aucun des trois ne domine arbitrairement les deux autres.
        assert len({criteria[k]["weight"] for k in sourced}) == 1

    def test_the_twelve_unsourced_criteria_are_named_never_evaluable_never_zero(self):
        criteria = {c["key"]: c for c in strategy_selection_criteria("petite", "pme_eti", "froid")}
        unsourced = set(STRATEGY_SELECTION_CRITERIA) - {"esn_stage", "account_archetype", "relationship_state"}
        assert len(unsourced) == 12
        for key in unsourced:
            assert criteria[key]["evaluable"] is False
            assert criteria[key]["reason"] == "no_source"
            # Jamais un poids ou une valeur devinés sur un critère non évaluable.
            assert "weight" not in criteria[key]
            assert "value" not in criteria[key]

    def test_a_sourced_criterion_missing_on_THIS_account_is_named_differently(self):
        # `esn_stage` absent sur CE compte précis (donnée qui viendra) est une
        # raison distincte des sept critères qui n'ont structurellement aucune
        # règle source (arbitrage qui n'existe nulle part).
        criteria = {c["key"]: c for c in strategy_selection_criteria(None, "pme_eti", "froid")}
        assert criteria["esn_stage"]["evaluable"] is False
        assert criteria["esn_stage"]["reason"] == "not_collected"
        # Le poids se redistribue entre les DEUX critères réellement évalués.
        assert criteria["account_archetype"]["weight"] == pytest.approx(1 / 2)
        assert criteria["relationship_state"]["weight"] == pytest.approx(1 / 2)

    def test_purchasing_is_evaluable_only_on_a_declared_panel_and_names_its_restriction(self):
        # #3278.2 — le seul sous-aspect connu du « processus d'achat » est le
        # panel/référencement DÉCLARÉ : le critère le dit dans son libellé, il
        # ne se présente jamais comme un « Processus d'achat » nu.
        criteria = {
            c["key"]: c
            for c in strategy_selection_criteria("petite", "pme_eti", "froid", purchasing_panel="panel_ferme")
        }
        purchasing = criteria["purchasing"]
        assert purchasing["evaluable"] is True
        assert purchasing["label"] == "processus d'achat — panel/référencement connu"
        assert purchasing["value"] == "panel_ferme"
        # Poids égal entre les QUATRE critères évalués ; le reste ne bouge pas.
        assert purchasing["weight"] == pytest.approx(1 / 4)
        assert criteria["esn_stage"]["weight"] == pytest.approx(1 / 4)
        assert criteria["scope"]["evaluable"] is False

    def test_purchasing_stays_unsourced_without_a_declared_panel(self):
        for panel in (None, "", "  ", "inconnu"):
            criteria = {
                c["key"]: c for c in strategy_selection_criteria("petite", "pme_eti", "froid", purchasing_panel=panel)
            }
            assert criteria["purchasing"]["evaluable"] is False
            assert criteria["purchasing"]["reason"] == "no_source"
            assert "weight" not in criteria["purchasing"]
            assert criteria["esn_stage"]["weight"] == pytest.approx(1 / 3)

    def test_no_criterion_evaluable_yields_no_weight_rather_than_a_guessed_one(self):
        criteria = {c["key"]: c for c in strategy_selection_criteria(None, None, None)}
        for key in ("esn_stage", "account_archetype", "relationship_state"):
            assert criteria[key]["evaluable"] is False
            assert criteria[key]["reason"] == "not_collected"

    def test_reads_the_sales_context_dict_like_its_movement_and_route_siblings(self):
        ctx = {
            "esnProfile": {"stage": "freelance"},
            "account": {"archetype": "pme_eti"},
            "relationship": {"state": "froid"},
        }
        criteria = {c["key"]: c for c in strategy_criteria_from_context(ctx)}
        assert criteria["esn_stage"]["value"] == "freelance"

    def test_movement_prompt_block_names_the_non_evaluable_criteria_to_the_model(self):
        ctx = {
            "esnProfile": {"stage": "freelance"},
            "account": {"archetype": "pme_eti"},
            "relationship": {"state": "froid"},
        }
        block = movement_prompt_block(ctx)
        assert "Critères NON évaluables" in block
        assert STRATEGY_SELECTION_CRITERIA["scope"] in block
        # Les trois sourcés, ÉVALUÉS ici, ne doivent pas apparaître dans la
        # liste des non-évaluables.
        assert STRATEGY_SELECTION_CRITERIA["esn_stage"] not in block.split("Critères NON évaluables")[1]

    def test_movement_prompt_block_stays_empty_without_a_sales_context(self):
        # Comportement inchangé (`if not sales_context: return ""`).
        assert movement_prompt_block(None) == ""
        assert movement_prompt_block({}) == ""


class TestRouteRecommendationEightAttributes:
    """#2273.22-.29 (épopée #2959) — la recommandation de route à 8 attributs :
    route/première porte/info à obtenir/preuve/contact suivant/condition de
    passage/plan de repli/route déconseillée. Enrichit `recommend_commercial_route`
    plutôt qu'un second calcul (une seule source pour la route elle-même)."""

    def test_carries_all_eight_attributes(self):
        r = route_recommendation("petite", "pme_eti", "froid")
        assert set(r.keys()) == {
            "route",
            "label",
            "rationale",
            "first_door",
            "info_to_obtain",
            "proof",
            "next_contact",
            "passage_condition",
            "fallback_plan",
            "discouraged_route",
            "first_channel",
            "secondary_channel",
            "channel_rationale",
        }

    def test_every_reachable_route_has_its_seven_extra_attributes(self):
        # Les 9 routes RÉELLEMENT atteignables (#2959, bilan du 26/09) — une
        # combinaison par route, chacune non vide.
        combos = [
            ("grande", "public", "rang2"),  # rang_2
            ("petite", "public", "froid"),  # appel_offres
            ("petite", "banque_assurance", "besoin_ouvert"),  # prospection_inversee
            ("petite", "grand_groupe", "client_actif"),  # expansion_client
            ("freelance", "pme_eti", "ancien_client"),  # reactivation
            ("petite", "startup", "refere"),  # recommandation
            ("etablie", "grand_groupe", "froid"),  # filiale_site
            ("petite", "pme_eti", "froid"),  # bottom_up
            ("etablie", "pme_eti", "froid"),  # direct_accessible
        ]
        seen_routes = set()
        for stage, archetype, relationship in combos:
            r = route_recommendation(stage, archetype, relationship)
            seen_routes.add(r["route"])
            for key in (
                "first_door",
                "info_to_obtain",
                "proof",
                "next_contact",
                "passage_condition",
                "fallback_plan",
                "discouraged_route",
                "first_channel",
                "channel_rationale",
            ):
                assert r[key], f"{r['route']}.{key} est vide"
            # secondary_channel est le seul optionnel (#3259 : "information
            # recherchée → appel court" n'a pas de canal coordonné).
            assert r["secondary_channel"] or r["route"] == "prospection_inversee"
        assert seen_routes == set(COMMERCIAL_ROUTES) - {
            "relation_existante",
            "sponsor",
            "partenaire",
            "middle_out",
            "consultant_present",
            "ancien_consultant",
            "signal_entrant",
            # #3278.1 (lot M11) — atteintes par SIGNAL seulement.
            "veille_seule",
            "depuis_talent",
            # #3278.1 (décision Louis 11/10/2026) — atteintes par fait déclaré seulement.
            "evenement_communaute",
            "inbound_contenu",
        }

    def test_discouraged_route_is_never_the_recommended_route_itself(self):
        for stage, archetype, relationship in [
            ("etablie", "pme_eti", "froid"),
            ("petite", "pme_eti", "froid"),
            ("petite", "startup", "refere"),
        ]:
            r = route_recommendation(stage, archetype, relationship)
            assert r["discouraged_route"] != r["route"]

    def test_reads_the_sales_context_dict(self):
        ctx = {
            "esnProfile": {"stage": "freelance"},
            "account": {"archetype": "pme_eti"},
            "relationship": {"state": "froid"},
        }
        assert route_recommendation_from_context(ctx)["route"] == "bottom_up"
        assert route_recommendation_from_context(ctx)["first_door"]

    def test_movement_prompt_block_carries_the_eight_attributes(self):
        ctx = {
            "esnProfile": {"stage": "petite"},
            "account": {"archetype": "pme_eti"},
            "relationship": {"state": "froid"},
        }
        block = movement_prompt_block(ctx)
        assert "Première porte" in block
        assert "Route déconseillée" in block

    def test_movement_prompt_block_stays_empty_without_a_sales_context(self):
        assert movement_prompt_block(None) == ""
        assert movement_prompt_block({}) == ""


class TestAntiGenericGuardAtSystemLevel:
    """#2273.35 — NO-GO : jamais de recommandation générique invariante selon
    le compte. La garde LOCALE existait déjà (`test_two_contrasted_profiles_
    get_different_routes`, sur la route seule) ; celle-ci porte sur le SYSTÈME
    complet — offre/accès/capacité/modèle contrastés doivent produire une
    recommandation à 8 attributs qui diffère, pas seulement un nom de route."""

    def test_two_contrasted_vendor_profiles_get_different_full_recommendations(self):
        # Petite ESN, compte froid, pas d'accès connu → bottom_up.
        small_cold = route_recommendation("petite", "pme_eti", "froid")
        # Grand groupe déjà client actif → expansion_client.
        big_active = route_recommendation("grande", "grand_groupe", "client_actif")

        assert small_cold["route"] != big_active["route"]
        assert small_cold["first_door"] != big_active["first_door"]
        assert small_cold["next_contact"] != big_active["next_contact"]
        assert small_cold["fallback_plan"] != big_active["fallback_plan"]

    def test_the_movement_prompt_block_itself_differs_between_two_profiles(self):
        # Le texte final envoyé au modèle, pas seulement les champs internes.
        ctx_a = {
            "esnProfile": {"stage": "petite"},
            "account": {"archetype": "pme_eti"},
            "relationship": {"state": "froid"},
        }
        ctx_b = {
            "esnProfile": {"stage": "grande"},
            "account": {"archetype": "grand_groupe"},
            "relationship": {"state": "client_actif"},
        }
        assert movement_prompt_block(ctx_a) != movement_prompt_block(ctx_b)


class TestChannelSelection:
    """#3259 (BEL-SC-230) — section CANAL : le canal n'est jamais choisi parce
    qu'il est disponible techniquement, il découle de la route (relation chaude
    / contact froid mais public / information recherchée / partenaire).
    Au plus DEUX canaux par route (règle « pas huit simultanément »)."""

    _WARM_ROUTES = ("reactivation", "recommandation", "expansion_client")
    _COLD_PUBLIC_ROUTES = ("bottom_up", "filiale_site", "direct_accessible")

    def test_warm_routes_lead_with_a_direct_channel_not_a_cold_default(self):
        for route in self._WARM_ROUTES:
            r = route_recommendation(*_context_reaching(route))
            assert r["first_channel"] in {"appel", "introduction"}

    def test_cold_public_routes_lead_with_linkedin_or_targeted_email(self):
        for route in self._COLD_PUBLIC_ROUTES:
            r = route_recommendation(*_context_reaching(route))
            assert r["first_channel"] == "LinkedIn"
            assert r["secondary_channel"] == "email ciblé"

    def test_partner_route_never_leads_with_an_unmediated_channel(self):
        r = route_recommendation("grande", "public", "rang2")
        assert r["route"] == "rang_2"
        assert r["first_channel"] not in {"LinkedIn", "email ciblé", "email personnel"}

    def test_no_route_ever_carries_more_than_two_channels(self):
        # Structurel : le contrat n'a que deux champs canal, jamais un troisième.
        for stage, archetype, relationship in [
            ("grande", "public", "rang2"),
            ("petite", "public", "froid"),
            ("petite", "banque_assurance", "besoin_ouvert"),
            ("petite", "grand_groupe", "client_actif"),
            ("freelance", "pme_eti", "ancien_client"),
            ("petite", "startup", "refere"),
            ("etablie", "grand_groupe", "froid"),
            ("petite", "pme_eti", "froid"),
            ("etablie", "pme_eti", "froid"),
        ]:
            r = route_recommendation(stage, archetype, relationship)
            channel_fields = [r["first_channel"]] + ([r["secondary_channel"]] if r["secondary_channel"] else [])
            assert len(channel_fields) <= 2

    def test_channel_rationale_never_leaks_a_raw_identifier(self):
        for stage, archetype, relationship in [
            ("grande", "public", "rang2"),
            ("petite", "public", "froid"),
            ("etablie", "grand_groupe", "froid"),
        ]:
            r = route_recommendation(stage, archetype, relationship)
            assert "_" not in r["channel_rationale"], r["channel_rationale"]


class TestCommercialRouteBrief:
    """#3259 (BEL-SC-230) — la forme SORTIE exacte de la spec : dix champs.
    Reshape de `route_recommendation` (source unique de la route), jamais un
    second calcul. `fallback_route` et `stop_condition` restent `None` quand le
    texte de méthode ne nomme explicitement ni route de repli ni déclencheur
    d'arrêt — jamais devinés (doctrine « un contrat d'API non vérifiable ne se
    devine pas »)."""

    def test_carries_exactly_the_ten_named_fields(self):
        brief = commercial_route_brief("petite", "pme_eti", "froid")
        assert set(brief.keys()) == {
            "recommended_route",
            "reason",
            "prerequisites",
            "first_person_or_role",
            "first_channel",
            "secondary_channel",
            "first_objective",
            "fallback_route",
            "stop_condition",
            "evidence_needed",
        }

    def test_fields_are_reshaped_from_the_single_route_source(self):
        base = route_recommendation("petite", "pme_eti", "froid")
        brief = commercial_route_brief("petite", "pme_eti", "froid")
        assert brief["recommended_route"] == base["route"]
        assert brief["reason"] == base["rationale"]
        assert brief["prerequisites"] == [base["passage_condition"]]
        assert brief["first_person_or_role"] == base["first_door"]
        assert brief["first_channel"] == base["first_channel"]
        assert brief["secondary_channel"] == base["secondary_channel"]
        assert brief["first_objective"] == base["info_to_obtain"]
        assert brief["evidence_needed"] == base["proof"]

    def test_fallback_route_is_named_only_where_the_method_text_names_one(self):
        # reactivation et recommandation nomment explicitement direct_accessible
        # comme repli ; les sept autres routes atteignables n'en nomment aucun.
        reactivation = commercial_route_brief("freelance", "pme_eti", "ancien_client")
        assert reactivation["recommended_route"] == "reactivation"
        assert reactivation["fallback_route"] == "direct_accessible"

        recommandation = commercial_route_brief("petite", "startup", "refere")
        assert recommandation["recommended_route"] == "recommandation"
        assert recommandation["fallback_route"] == "direct_accessible"

        bottom_up = commercial_route_brief("petite", "pme_eti", "froid")
        assert bottom_up["recommended_route"] == "bottom_up"
        assert bottom_up["fallback_route"] is None

    def test_stop_condition_is_named_only_where_sourced(self):
        reactivation = commercial_route_brief("freelance", "pme_eti", "ancien_client")
        assert reactivation["stop_condition"] == "le sponsor historique reste introuvable"

        expansion = commercial_route_brief("petite", "grand_groupe", "client_actif")
        assert expansion["stop_condition"] is None

    def test_reads_the_sales_context_dict(self):
        ctx = {
            "esnProfile": {"stage": "freelance"},
            "account": {"archetype": "pme_eti"},
            "relationship": {"state": "froid"},
        }
        assert commercial_route_brief_from_context(ctx)["recommended_route"] == "bottom_up"

    def test_empty_context_is_a_safe_default(self):
        assert commercial_route_brief_from_context({})["recommended_route"] == "direct_accessible"
        assert commercial_route_brief_from_context(None)["recommended_route"] == "direct_accessible"


class TestNoGoImmediateEmailOnMediatedRoute:
    """#3259 NO-GO : « Laura génère immédiatement un email alors que la
    meilleure route est une introduction ou un partenaire. » Le bloc de prompt
    nomme explicitement l'interdit dès qu'un SalesContext est disponible."""

    def test_movement_prompt_block_carries_the_channel_and_the_no_go(self):
        ctx = {
            "esnProfile": {"stage": "petite"},
            "account": {"archetype": "startup"},
            "relationship": {"state": "refere"},
        }
        block = movement_prompt_block(ctx)
        assert "CANAL RECOMMANDÉ" in block
        assert "introduction" in block
        assert "NO-GO" in block
        assert "email" in block.lower()

    def test_stays_empty_without_a_sales_context(self):
        assert movement_prompt_block(None) == ""
        assert movement_prompt_block({}) == ""

    def test_channel_block_differs_between_a_mediated_and_a_cold_route(self):
        mediated = movement_prompt_block(
            {
                "esnProfile": {"stage": "petite"},
                "account": {"archetype": "startup"},
                "relationship": {"state": "refere"},
            }
        )
        cold = movement_prompt_block(
            {"esnProfile": {"stage": "petite"}, "account": {"archetype": "pme_eti"}, "relationship": {"state": "froid"}}
        )
        assert mediated != cold


def _context_reaching(route: str) -> tuple[str | None, str | None, str | None]:
    """Un triplet (esn_stage, archetype, relationship) qui atteint `route` par
    `recommend_commercial_route` — même mapping que les combos de
    `TestRouteRecommendationEightAttributes.test_every_reachable_route_has_its_seven_extra_attributes`."""
    combos = {
        "rang_2": ("grande", "public", "rang2"),
        "appel_offres": ("petite", "public", "froid"),
        "prospection_inversee": ("petite", "banque_assurance", "besoin_ouvert"),
        "expansion_client": ("petite", "grand_groupe", "client_actif"),
        "reactivation": ("freelance", "pme_eti", "ancien_client"),
        "recommandation": ("petite", "startup", "refere"),
        "filiale_site": ("etablie", "grand_groupe", "froid"),
        "bottom_up": ("petite", "pme_eti", "froid"),
        "direct_accessible": ("etablie", "pme_eti", "froid"),
    }
    return combos[route]
