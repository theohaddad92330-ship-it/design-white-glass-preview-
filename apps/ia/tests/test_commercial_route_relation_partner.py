"""#2273.9-.21 (épopée #2959) — les routes `relation_existante` et `partenaire`,
enfin atteignables par un SIGNAL RÉEL du dossier.

Les bilans du 30/09 nommaient les sources à brancher : (a) un historique
d'interaction — la date de dernière interaction DÉCLARÉE sur le compte
(`salesContext.relationship.lastInteractionAt`, KnownAccountContext) ; (b) les
partenaires déclarés en place sur le compte (`account_partners`, relationship =
partner), portés par `salesContext.declaredPartners`. Sans signal : aucune route
neuve, comportement byte-identique (les états `connu`/`linkedin` restent
« cold-ish », des tests les épinglent)."""

from __future__ import annotations

import pytest

from app.services.opening_movement import (
    recommend_commercial_route,
    recommend_route_from_context,
    route_recommendation,
    route_signals_from_sales_context,
    with_route_signals,
)

_COLD = {"esnProfile": {"stage": "etablie"}, "account": {"archetype": "pme_eti"}}


def _ctx(state: str, **extra):
    return {**_COLD, "relationship": {"state": state, **extra.pop("relationship", {})}, **extra}


class TestSignalsFromSalesContext:
    def test_a_declared_last_interaction_is_the_active_relation_signal(self):
        ctx = _ctx("connu", relationship={"lastInteractionAt": "2026-08-12"})
        assert route_signals_from_sales_context(ctx) == {"relation_active": True}

    def test_a_declared_partner_is_the_partner_signal(self):
        ctx = _ctx("froid", declaredPartners=["Alten"])
        assert route_signals_from_sales_context(ctx) == {"partner_declared": True}

    def test_nothing_declared_says_nothing(self):
        assert route_signals_from_sales_context(_ctx("froid")) == {}
        assert route_signals_from_sales_context(None) == {}
        assert route_signals_from_sales_context(_ctx("froid", declaredPartners=["  ", None])) == {}
        assert route_signals_from_sales_context(_ctx("froid", relationship={"lastInteractionAt": "  "})) == {}


class TestRoutesReached:
    def test_active_relation_opens_relation_existante_on_a_cold_ish_account(self):
        for state in ("froid", "connu", "linkedin"):
            r = recommend_commercial_route("etablie", "pme_eti", state, signals={"relation_active": True})
            assert r["route"] == "relation_existante", state

    def test_declared_partner_opens_partenaire(self):
        r = recommend_commercial_route("etablie", "pme_eti", "froid", signals={"partner_declared": True})
        assert r["route"] == "partenaire"

    def test_the_relation_beats_the_partner_which_beats_the_sponsor(self):
        both = {"relation_active": True, "partner_declared": True, "sponsor_known": True}
        assert recommend_commercial_route("etablie", "pme_eti", "froid", signals=both)["route"] == "relation_existante"
        no_rel = {"partner_declared": True, "sponsor_known": True}
        assert recommend_commercial_route("etablie", "pme_eti", "froid", signals=no_rel)["route"] == "partenaire"

    @pytest.mark.parametrize(
        ("combo", "expected"),
        [
            (("grande", "public", "rang2"), "rang_2"),
            (("petite", "public", "froid"), "appel_offres"),
            (("petite", "banque_assurance", "besoin_ouvert"), "prospection_inversee"),
            (("petite", "grand_groupe", "client_actif"), "expansion_client"),
            (("freelance", "pme_eti", "ancien_client"), "reactivation"),
            (("petite", "startup", "refere"), "recommandation"),
            (("petite", "startup", "dormant"), "reactivation"),
        ],
    )
    def test_a_more_specific_route_is_never_overridden(self, combo, expected):
        both = {"relation_active": True, "partner_declared": True}
        assert recommend_commercial_route(*combo, signals=both)["route"] == expected

    def test_no_signal_is_byte_identical_to_before(self):
        for combo in (
            ("petite", "pme_eti", "froid"),
            ("etablie", "pme_eti", "connu"),
            ("grande", "industrie", "linkedin"),
        ):
            base = recommend_commercial_route(*combo)
            assert base == recommend_commercial_route(
                *combo, signals={"relation_active": False, "partner_declared": False}
            )

    def test_both_routes_carry_the_eight_attributes_and_no_raw_identifier(self):
        for signals, route in (
            ({"relation_active": True}, "relation_existante"),
            ({"partner_declared": True}, "partenaire"),
        ):
            r = route_recommendation("etablie", "pme_eti", "froid", signals=signals)
            assert r["route"] == route
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
                assert r[key], (route, key)
            assert "_" not in r["rationale"]


class TestWiring:
    def test_with_route_signals_carries_the_sales_context_signals(self):
        ctx = _ctx("connu", relationship={"lastInteractionAt": "2026-08-12"}, declaredPartners=["Alten"])
        out = with_route_signals(ctx, [])
        assert out["routeSignals"]["relation_active"] is True
        assert out["routeSignals"]["partner_declared"] is True
        assert recommend_route_from_context(out)["route"] == "relation_existante"

    def test_without_any_signal_the_context_is_returned_unchanged(self):
        ctx = _ctx("froid")
        assert with_route_signals(ctx, []) is ctx

    def test_the_plan_prompt_names_the_route(self):
        from app.services.opening_movement import movement_prompt_block

        ctx = with_route_signals(_ctx("froid", declaredPartners=["Alten"]), [])
        assert "partenaire" in movement_prompt_block(ctx, None).lower()


class TestBuildSalesContextCarriesPartners:
    def test_declared_partners_ride_the_sales_context_and_open_the_route(self):
        from app.services.sales_context import build_sales_context

        sc = build_sales_context({}, {}, declared_partners=["Alten", " ", "Sopra"])
        assert sc["declaredPartners"] == ["Alten", "Sopra"]
        assert recommend_route_from_context(with_route_signals(sc, []))["route"] == "partenaire"

    def test_without_partner_the_key_is_absent_and_the_context_byte_identical(self):
        from app.services.sales_context import build_sales_context

        assert "declaredPartners" not in build_sales_context({}, {})
        assert build_sales_context({}, {}, declared_partners=[]) == build_sales_context({}, {})

    def test_a_declared_last_interaction_reaches_the_route_through_build_sales_context(self):
        from app.services.sales_context import build_sales_context

        sc = build_sales_context({}, {}, has_crm_presence=True, last_interaction="2026-08-12")
        assert sc["relationship"]["state"] == "connu"
        assert recommend_route_from_context(with_route_signals(sc, []))["route"] == "relation_existante"


class TestRouteReachesThePlanPayload:
    """#2959 (recette prod 02/10) — « aucune Route visible » : la route calculée
    n'était injectée que dans le PROMPT du plan, jamais dans le plan rendu. Elle
    voyage maintenant avec lui (`recommendedRoute`, comme `recommendedMovement`),
    que la fiche affiche."""

    def test_a_declared_partner_puts_the_partner_route_with_its_eight_attributes_in_the_payload(self):
        from app.services.opening_movement import recommended_route_for_plan

        route = recommended_route_for_plan(_ctx("froid", declaredPartners=["Alten"]), contacts=[])
        assert route is not None
        assert route["route"] == "partenaire"
        for key in (
            "label",
            "rationale",
            "first_door",
            "info_to_obtain",
            "proof",
            "next_contact",
            "passage_condition",
            "fallback_plan",
            "discouraged_route",
        ):
            assert route[key], key

    def test_without_a_sales_context_nothing_is_invented(self):
        from app.services.opening_movement import recommended_route_for_plan

        assert recommended_route_for_plan(None, contacts=[]) is None
        assert recommended_route_for_plan({}, contacts=[]) is None
