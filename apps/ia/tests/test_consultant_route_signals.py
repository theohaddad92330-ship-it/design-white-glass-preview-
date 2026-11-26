"""#3278.1 (#3259.2) — deux routes de plus, « consultant déjà présent » et
« ancien consultant », atteignables par un SIGNAL RÉEL : les missions du compte
(``missions``, lues côté API par ``RelationAxisReaderService``) et non un
paramètre deviné. Sans mission : aucune route neuve, byte-identique."""

from __future__ import annotations

import pytest

from app.services.opening_movement import (
    COMMERCIAL_ROUTES,
    movement_prompt_block,
    recommend_commercial_route,
    route_recommendation,
    route_signals_from_sales_context,
    with_route_signals,
)


def test_the_two_routes_are_named():
    assert "consultant_present" in COMMERCIAL_ROUTES
    assert "ancien_consultant" in COMMERCIAL_ROUTES
    # #3278.1 (lot M11) — + veille_seule, depuis_talent ; (11/10) + evenement_communaute, inbound_contenu.
    assert len(COMMERCIAL_ROUTES) == 20


class TestSignalFromSalesContext:
    def test_a_running_mission_is_the_present_signal(self):
        assert route_signals_from_sales_context({"consultantHistory": "present"}) == {"consultant_present": True}

    def test_a_finished_mission_is_the_former_signal(self):
        assert route_signals_from_sales_context({"consultantHistory": "former"}) == {"former_consultant": True}

    @pytest.mark.parametrize("value", [None, "", "peut-être", 3])
    def test_anything_else_is_no_signal(self, value):
        got = route_signals_from_sales_context({"consultantHistory": value})
        assert got == {}

    def test_absent_key_is_an_empty_dict(self):
        assert route_signals_from_sales_context({}) == {}


class TestRoutes:
    def test_present_consultant_opens_its_route_on_a_cold_account(self):
        r = recommend_commercial_route("etablie", "pme_eti", "froid", {"consultant_present": True})
        assert r["route"] == "consultant_present"
        assert r["label"] == COMMERCIAL_ROUTES["consultant_present"]
        assert "_" not in r["rationale"]

    def test_former_consultant_opens_its_route_on_a_cold_account(self):
        r = recommend_commercial_route("etablie", "pme_eti", "connu", {"former_consultant": True})
        assert r["route"] == "ancien_consultant"

    def test_present_beats_former(self):
        both = {"consultant_present": True, "former_consultant": True}
        assert recommend_commercial_route("etablie", "pme_eti", "froid", both)["route"] == "consultant_present"

    @pytest.mark.parametrize(
        ("combo", "expected"),
        [
            (("grande", "public", "rang2"), "rang_2"),
            (("petite", "public", "froid"), "appel_offres"),
            (("petite", "banque_assurance", "besoin_ouvert"), "prospection_inversee"),
            (("petite", "grand_groupe", "client_actif"), "expansion_client"),
            (("freelance", "pme_eti", "ancien_client"), "reactivation"),
            (("petite", "startup", "refere"), "recommandation"),
        ],
    )
    def test_a_more_specific_relationship_is_never_overridden(self, combo, expected):
        both = {"consultant_present": True, "former_consultant": True}
        assert recommend_commercial_route(*combo, both)["route"] == expected

    def test_no_signal_is_byte_identical(self):
        combo = ("etablie", "pme_eti", "froid")
        assert recommend_commercial_route(*combo) == recommend_commercial_route(
            *combo, {"consultant_present": False, "former_consultant": False}
        )

    @pytest.mark.parametrize("signal", ["consultant_present", "former_consultant"])
    def test_the_new_routes_carry_their_attributes(self, signal):
        r = route_recommendation("etablie", "pme_eti", "froid", signals={signal: True})
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
            assert r[key], (r["route"], key)


class TestEndToEnd:
    def test_with_route_signals_merges_instead_of_overwriting(self):
        ctx = {
            "consultantHistory": "present",
            "declaredPartners": ["Capgemini"],
            "esnProfile": {"stage": "etablie"},
            "account": {"archetype": "pme_eti"},
            "relationship": {"state": "froid"},
        }
        out = with_route_signals(ctx, [])
        assert out["routeSignals"]["consultant_present"] is True
        assert out["routeSignals"]["partner_declared"] is True

    def test_the_plan_prompt_names_the_route(self):
        ctx = {
            "consultantHistory": "former",
            "esnProfile": {"stage": "etablie"},
            "account": {"archetype": "pme_eti"},
            "relationship": {"state": "froid"},
        }
        block = movement_prompt_block(with_route_signals(ctx, []))
        assert "Route : ancien_consultant" in block
