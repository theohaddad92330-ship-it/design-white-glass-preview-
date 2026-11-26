"""#3278.1 (#3259.2) — la route « signal entrant », enfin atteignable par un
SIGNAL RÉEL : un signal d'achat DÉCLARÉ sur le compte (saisie ou import d'un
export déjà possédé par le client, #2634.1 — jamais un scraping, jamais une
détection automatique du pipeline, `accounts.declared_signals` côté API).

Même geste que `relation_existante`/`partenaire`
(`test_commercial_route_relation_partner.py`) : le bilan du 04/10 nommait ce
signal comme le seul DÉJÀ COLLECTÉ parmi les cinq routes restantes de #3278.1
(déclaré, jamais une détection) — les quatre autres (reverse prospecting,
événement/communauté, inbound/contenu, veille) restent sans objet source dans
le dépôt."""

from __future__ import annotations

import pytest

from app.services.opening_movement import (
    COMMERCIAL_ROUTES,
    recommend_commercial_route,
    recommend_route_from_context,
    route_recommendation,
    route_signals_from_sales_context,
    with_route_signals,
)

_COLD = {"esnProfile": {"stage": "etablie"}, "account": {"archetype": "pme_eti"}}


def _ctx(state: str, **extra):
    return {**_COLD, "relationship": {"state": state, **extra.pop("relationship", {})}, **extra}


def test_signal_entrant_is_a_named_route():
    assert "signal_entrant" in COMMERCIAL_ROUTES


class TestSignalFromSalesContext:
    def test_a_declared_signal_present_is_the_declared_signal_route_signal(self):
        ctx = _ctx("froid", declaredSignalPresent=True)
        assert route_signals_from_sales_context(ctx) == {"declared_signal": True}

    def test_nothing_declared_says_nothing(self):
        assert route_signals_from_sales_context(_ctx("froid")) == {}
        assert route_signals_from_sales_context(_ctx("froid", declaredSignalPresent=False)) == {}


class TestRouteReached:
    def test_declared_signal_opens_signal_entrant_on_a_cold_ish_account(self):
        for state in ("froid", "connu", "linkedin"):
            r = recommend_commercial_route("etablie", "pme_eti", state, signals={"declared_signal": True})
            assert r["route"] == "signal_entrant", state

    def test_relation_and_partner_beat_the_declared_signal(self):
        both = {"relation_active": True, "declared_signal": True}
        assert recommend_commercial_route("etablie", "pme_eti", "froid", signals=both)["route"] == "relation_existante"
        both = {"partner_declared": True, "declared_signal": True}
        assert recommend_commercial_route("etablie", "pme_eti", "froid", signals=both)["route"] == "partenaire"

    def test_the_declared_signal_beats_the_sponsor(self):
        both = {"declared_signal": True, "sponsor_known": True}
        assert recommend_commercial_route("etablie", "pme_eti", "froid", signals=both)["route"] == "signal_entrant"

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
        assert recommend_commercial_route(*combo, signals={"declared_signal": True})["route"] == expected

    def test_no_signal_is_byte_identical_to_before(self):
        for combo in (
            ("petite", "pme_eti", "froid"),
            ("etablie", "pme_eti", "connu"),
            ("grande", "industrie", "linkedin"),
        ):
            base = recommend_commercial_route(*combo)
            assert base == recommend_commercial_route(*combo, signals={"declared_signal": False})

    def test_the_route_carries_the_eight_attributes_and_no_raw_identifier(self):
        r = route_recommendation("etablie", "pme_eti", "froid", signals={"declared_signal": True})
        assert r["route"] == "signal_entrant"
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
            assert r[key], key
        assert "_" not in r["rationale"]


class TestWiring:
    def test_with_route_signals_carries_the_declared_signal(self):
        ctx = _ctx("connu", declaredSignalPresent=True)
        out = with_route_signals(ctx, [])
        assert out["routeSignals"]["declared_signal"] is True
        assert recommend_route_from_context(out)["route"] == "signal_entrant"

    def test_without_the_signal_the_context_is_returned_unchanged(self):
        ctx = _ctx("froid")
        assert with_route_signals(ctx, []) is ctx

    def test_the_plan_prompt_names_the_route(self):
        from app.services.opening_movement import movement_prompt_block

        ctx = with_route_signals(_ctx("froid", declaredSignalPresent=True), [])
        assert "signal_entrant" in movement_prompt_block(ctx, None).lower() or "signal" in movement_prompt_block(
            ctx, None
        ).lower()
