"""#3278.1 (lot M11 09/10) — deux des quatre routes restantes, atteignables par
un SIGNAL RÉEL lu côté API, jamais nommées sans lui :

- ``veille_seule`` : le compte est au niveau d'effort « veille » (``accounts.
  sprint = 'watch'``, une décision posée avec sa condition de réveil) ;
- ``depuis_talent`` (reverse prospecting) : un talent du VIVIER de l'espace a
  déjà travaillé chez ce client (``consultant_experiences``, client nommé et
  non masqué, égalité stricte du nom normalisé — jamais un rapprochement flou).

Les deux autres (événement/communauté, inbound/contenu) ont leurs objets sources
depuis la décision de Louis du 11/10/2026 : voir ``test_event_inbound_routes.py``."""

from __future__ import annotations

import pytest

from app.services.opening_movement import (
    COMMERCIAL_ROUTES,
    recommend_commercial_route,
    route_recommendation,
)


def test_the_two_routes_are_named():
    assert "veille_seule" in COMMERCIAL_ROUTES
    assert "depuis_talent" in COMMERCIAL_ROUTES


class TestWatchOnly:
    @pytest.mark.parametrize(
        "combo",
        [
            ("etablie", "pme_eti", "froid"),
            ("grande", "public", "rang2"),
            ("petite", "grand_groupe", "client_actif"),
            ("etablie", "startup", "besoin_ouvert"),
        ],
    )
    def test_a_declared_watch_level_beats_every_deduced_route(self, combo):
        r = recommend_commercial_route(*combo, signals={"watch_only": True, "declared_signal": True})
        assert r["route"] == "veille_seule"

    def test_without_the_signal_it_is_never_named(self):
        for combo in (("etablie", "pme_eti", "froid"), ("petite", "industrie", "connu"), (None, None, None)):
            assert recommend_commercial_route(*combo)["route"] != "veille_seule"
            assert recommend_commercial_route(*combo, signals={"watch_only": False})["route"] != "veille_seule"


class TestFromTalent:
    def test_a_talent_who_worked_there_opens_the_route_on_a_cold_account(self):
        for state in ("froid", "connu", "linkedin"):
            r = recommend_commercial_route("etablie", "pme_eti", state, signals={"talent_from_account": True})
            assert r["route"] == "depuis_talent", state

    def test_signed_missions_relation_partner_and_declared_signal_beat_it(self):
        for stronger, expected in (
            ("consultant_present", "consultant_present"),
            ("former_consultant", "ancien_consultant"),
            ("relation_active", "relation_existante"),
            ("partner_declared", "partenaire"),
            ("declared_signal", "signal_entrant"),
        ):
            signals = {"talent_from_account": True, stronger: True}
            assert recommend_commercial_route("etablie", "pme_eti", "froid", signals=signals)["route"] == expected

    def test_it_beats_the_sponsor_and_the_size_routes(self):
        signals = {"talent_from_account": True, "sponsor_known": True}
        assert (
            recommend_commercial_route("petite", "grand_groupe", "froid", signals=signals)["route"] == "depuis_talent"
        )

    def test_a_warm_relationship_is_never_overridden(self):
        r = recommend_commercial_route("petite", "grand_groupe", "client_actif", signals={"talent_from_account": True})
        assert r["route"] == "expansion_client"

    def test_without_the_signal_it_is_never_named(self):
        assert recommend_commercial_route("etablie", "pme_eti", "froid")["route"] != "depuis_talent"


@pytest.mark.parametrize("signal,route", [("watch_only", "veille_seule"), ("talent_from_account", "depuis_talent")])
def test_each_route_carries_its_method_attributes_without_raw_identifier(signal, route):
    r = route_recommendation("etablie", "pme_eti", "froid", signals={signal: True})
    assert r["route"] == route
    for key in ("first_door", "info_to_obtain", "proof", "next_contact", "passage_condition", "fallback_plan"):
        assert r[key], key
    assert r["discouraged_route"] in COMMERCIAL_ROUTES and r["discouraged_route"] != route
    assert "_" not in r["rationale"]
