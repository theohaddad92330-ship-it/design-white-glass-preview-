"""#3278.1 (décision Louis 11/10/2026) — les deux dernières routes, « événement ou
communauté » et « inbound / contenu », avec leurs OBJETS SOURCES : deux faits DÉCLARÉS
sur la fiche du compte (« Compléter la fiche »), relayés par le pont ``accounts/access``.
Jamais nommées sans eux (route devinée sinon)."""

from __future__ import annotations

import pytest

from app.services.opening_movement import (
    COMMERCIAL_ROUTES,
    recommend_commercial_route,
    route_recommendation,
)

COLD = ("etablie", "pme_eti", "froid")


def test_both_routes_are_named():
    assert "evenement_communaute" in COMMERCIAL_ROUTES
    assert "inbound_contenu" in COMMERCIAL_ROUTES


@pytest.mark.parametrize(
    "signal,route",
    [("event_community", "evenement_communaute"), ("inbound_content", "inbound_contenu")],
)
class TestEachRoute:
    def test_the_declared_fact_opens_the_route_on_a_cold_account(self, signal, route):
        for state in ("froid", "connu", "linkedin"):
            r = recommend_commercial_route("etablie", "pme_eti", state, signals={signal: True})
            assert r["route"] == route, state

    def test_without_the_fact_it_is_never_named(self, signal, route):
        assert recommend_commercial_route(*COLD)["route"] != route
        assert recommend_commercial_route(*COLD, signals={signal: False})["route"] != route

    def test_signed_missions_relation_partner_and_declared_signal_beat_it(self, signal, route):
        for stronger, expected in (
            ("consultant_present", "consultant_present"),
            ("former_consultant", "ancien_consultant"),
            ("relation_active", "relation_existante"),
            ("partner_declared", "partenaire"),
            ("declared_signal", "signal_entrant"),
        ):
            r = recommend_commercial_route(*COLD, signals={signal: True, stronger: True})
            assert r["route"] == expected

    def test_a_warm_relationship_is_never_overridden(self, signal, route):
        r = recommend_commercial_route("petite", "grand_groupe", "client_actif", signals={signal: True})
        assert r["route"] == "expansion_client"

    def test_a_watch_decision_beats_it(self, signal, route):
        r = recommend_commercial_route(*COLD, signals={signal: True, "watch_only": True})
        assert r["route"] == "veille_seule"

    def test_it_carries_its_method_attributes_without_raw_identifier(self, signal, route):
        r = route_recommendation(*COLD, signals={signal: True})
        assert r["route"] == route
        for key in ("first_door", "info_to_obtain", "proof", "next_contact", "passage_condition", "fallback_plan"):
            assert r[key], key
        assert r["discouraged_route"] in COMMERCIAL_ROUTES and r["discouraged_route"] != route
        assert "_" not in r["rationale"]
        assert r["first_channel"]


def test_inbound_beats_event_when_both_are_declared():
    r = recommend_commercial_route(*COLD, signals={"event_community": True, "inbound_content": True})
    assert r["route"] == "inbound_contenu"
