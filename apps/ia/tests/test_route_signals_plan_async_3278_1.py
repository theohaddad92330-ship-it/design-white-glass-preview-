"""#3278.1 — le plan ASYNCHRONE nomme les mêmes routes que `/chat` : les quatre
signaux lus côté API (veille seule, depuis un talent, événement/communauté,
inbound/contenu) voyagent jusqu'au SalesContext (`declaredRouteSignals`) puis
jusqu'à `route_signals_from_sales_context`. Une clé absente ne dit rien."""

from __future__ import annotations

from app.models.research import ResearchRequest
from app.services.opening_movement import route_signals_from_sales_context, with_route_signals
from app.services.sales_context import build_sales_context

_COLD = {"esnProfile": {"stage": "etablie"}, "account": {"archetype": "pme_eti"}, "relationship": {"state": "froid"}}


def test_the_sales_context_carries_only_true_declared_route_signals():
    ctx = build_sales_context(
        profile_data={},
        account_facts={},
        declared_route_signals={"event_community": True, "watch_only": False, "inconnu": True},
    )
    assert ctx["declaredRouteSignals"] == {"event_community": True}


def test_without_signals_the_sales_context_is_byte_identical():
    assert "declaredRouteSignals" not in build_sales_context(profile_data={}, account_facts={})
    assert "declaredRouteSignals" not in build_sales_context(
        profile_data={}, account_facts={}, declared_route_signals={}
    )


def test_the_four_signals_are_read_back_from_the_sales_context():
    ctx = {
        **_COLD,
        "declaredRouteSignals": {
            "watch_only": True,
            "talent_from_account": True,
            "event_community": True,
            "inbound_content": True,
        },
    }
    assert route_signals_from_sales_context(ctx) == {
        "watch_only": True,
        "talent_from_account": True,
        "event_community": True,
        "inbound_content": True,
    }


def test_the_plan_context_names_the_route_from_the_persisted_signal():
    ctx = {**_COLD, "declaredRouteSignals": {"event_community": True}}
    assert with_route_signals(ctx, [])["routeSignals"]["event_community"] is True


def test_the_request_model_accepts_the_wire_key_and_defaults_to_none():
    assert ResearchRequest.model_fields["declared_route_signals"].default is None
