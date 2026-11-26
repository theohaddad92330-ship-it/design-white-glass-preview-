"""#2273.9-.21 (épopée #2959) — les routes `sponsor` et `middle_out`, enfin
atteignables par un SIGNAL RÉEL du dossier (les contacts nommés), plus un
paramètre deviné.

Les bilans du 26/09 au 30/09 écartaient ces routes : « `SalesContext` ne porte
aucun signal sponsor ». Décision de Louis (30/09) : une donnée absente à la
source se BRANCHE. Le signal existe déjà dans le dossier — le rôle décisionnel
de chaque contact (`role = sponsor`, `contact_priority_score._ROLE_POWER`) et
son niveau hiérarchique (`hierarchyLevel`), avec un canal joignable. Sans
contact qui porte le signal : aucune route neuve, comportement byte-identique.
"""

from __future__ import annotations

import pytest

from app.services.opening_movement import (
    COMMERCIAL_ROUTES,
    movement_prompt_block,
    recommend_commercial_route,
    route_recommendation,
    route_signals_from_contacts,
)

_SPONSOR = {"fullName": "Anne Sponsor", "role": "sponsor", "hierarchyLevel": "direction", "email": "a@x.fr"}
_MANAGER = {
    "fullName": "Marc Manager",
    "role": "champion",
    "hierarchyLevel": "management",
    "linkedinUrl": "https://l/m",
}
_MANAGER_UNREACHABLE = {"fullName": "Mia Muette", "role": "champion", "hierarchyLevel": "management"}


class TestSignalsFromContacts:
    def test_a_named_sponsor_is_the_sponsor_signal(self):
        assert route_signals_from_contacts([_SPONSOR])["sponsor_known"] is True

    def test_a_reachable_manager_is_the_middle_out_signal(self):
        signals = route_signals_from_contacts([_MANAGER])
        assert signals["manager_reachable"] is True
        assert signals["sponsor_known"] is False

    def test_says_no_when_nobody_carries_the_signal(self):
        assert route_signals_from_contacts([]) == {"sponsor_known": False, "manager_reachable": False}
        assert route_signals_from_contacts(None) == {"sponsor_known": False, "manager_reachable": False}

    def test_a_manager_with_no_reachable_channel_is_not_reachable(self):
        assert route_signals_from_contacts([_MANAGER_UNREACHABLE])["manager_reachable"] is False

    def test_an_unnamed_row_never_counts(self):
        assert route_signals_from_contacts([{"role": "sponsor", "email": "x@y.fr"}])["sponsor_known"] is False

    def test_reads_snake_case_rows_too(self):
        row = {"full_name": "Anne", "decision_role": "sponsor"}
        assert route_signals_from_contacts([row])["sponsor_known"] is True


class TestRoutesReachedBySignals:
    def test_a_known_sponsor_opens_the_sponsor_route_on_a_cold_account(self):
        r = recommend_commercial_route("etablie", "pme_eti", "froid", signals={"sponsor_known": True})
        assert r["route"] == "sponsor"
        assert r["label"] == COMMERCIAL_ROUTES["sponsor"]

    def test_a_reachable_manager_opens_middle_out_when_nothing_more_specific_matched(self):
        r = recommend_commercial_route("etablie", "pme_eti", "froid", signals={"manager_reachable": True})
        assert r["route"] == "middle_out"

    def test_the_sponsor_beats_the_manager(self):
        both = {"sponsor_known": True, "manager_reachable": True}
        assert recommend_commercial_route("etablie", "pme_eti", "froid", signals=both)["route"] == "sponsor"

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
    def test_a_more_specific_relationship_is_never_overridden_by_a_signal(self, combo, expected):
        both = {"sponsor_known": True, "manager_reachable": True}
        assert recommend_commercial_route(*combo, signals=both)["route"] == expected

    def test_signals_come_after_the_size_based_routes_they_refine(self):
        # Un grand compte froid sans autre signal reste « filiale_site » ; AVEC un
        # sponsor connu, c'est lui la porte — jamais une route devinée.
        assert recommend_commercial_route("etablie", "grand_groupe", "froid")["route"] == "filiale_site"
        with_sponsor = recommend_commercial_route("etablie", "grand_groupe", "froid", signals={"sponsor_known": True})
        assert with_sponsor["route"] == "sponsor"

    def test_no_signal_is_byte_identical_to_before(self):
        for combo in (
            ("petite", "pme_eti", "froid"),
            ("etablie", "pme_eti", "froid"),
            ("grande", "industrie", "dormant"),
        ):
            assert recommend_commercial_route(*combo) == recommend_commercial_route(*combo, signals={})
            assert recommend_commercial_route(*combo) == recommend_commercial_route(
                *combo, signals={"sponsor_known": False, "manager_reachable": False}
            )

    def test_the_new_routes_carry_their_eight_attributes(self):
        for signals, route in (({"sponsor_known": True}, "sponsor"), ({"manager_reachable": True}, "middle_out")):
            r = route_recommendation("etablie", "pme_eti", "froid", signals=signals)
            assert r["route"] == route
            for key in ("first_door", "info_to_obtain", "proof", "next_contact", "passage_condition", "fallback_plan"):
                assert r[key], (route, key)
            assert r["discouraged_route"]

    def test_no_rationale_contains_a_raw_identifier(self):
        for signals in ({"sponsor_known": True}, {"manager_reachable": True}):
            assert "_" not in recommend_commercial_route("petite", "pme_eti", "froid", signals=signals)["rationale"]


def test_the_plan_prompt_carries_the_signal_route_end_to_end():
    """L'APPELANT : le bloc de prompt du plan (`movement_prompt_block`, appelé par
    `phase4_plan.py`) lit `routeSignals` du SalesContext — sans lui, la route
    calculée par signal n'atteindrait jamais le modèle."""
    ctx = {
        "esnProfile": {"stage": "etablie"},
        "account": {"archetype": "pme_eti"},
        "relationship": {"state": "froid"},
    }
    plain = movement_prompt_block(ctx)
    with_signal = movement_prompt_block({**ctx, "routeSignals": {"sponsor_known": True}})
    assert "Route : direct_accessible" in plain
    assert "Route : sponsor" in with_signal
    assert plain != with_signal
