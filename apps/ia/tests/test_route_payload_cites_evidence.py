"""#3278.r42 (recette prod R42, Thales) — la route du plan RENDU nommait « filiale ou site » mais sa
« Preuve qui valide » restait la phrase générique du moteur, sans preuve citée, et l'historique de canal
n'y figurait pas : les critères accumulés (`accumulated_route_criteria`) n'entraient que dans le prompt."""

from __future__ import annotations

from datetime import date

from app.services.opening_movement import recommended_route_for_plan

CTX = {
    "esnProfile": {"stage": "etablie"},
    "account": {"archetype": "grand_groupe"},
    "relationship": {"state": "froid"},
}
TODAY = date(2026, 10, 17)


def _route(**kwargs):
    return recommended_route_for_plan(CTX, [], today=TODAY, **kwargs)


def test_accumulated_proofs_and_channel_history_reach_the_rendered_route_with_source_and_date():
    route = _route(
        accumulated_criteria={
            "proofs": "2 références client publiables dans le secteur Aéronautique et défense",
            "channel_history": "email ×3, linkedin ×1 (messages préparés sur ce compte)",
        }
    )
    assert route["proof_cited"] == (
        "2 références client publiables dans le secteur Aéronautique et défense"
        " — source : références client de l'espace, relevé au 2026-10-17"
    )
    assert route["channel_history"] == "email ×3, linkedin ×1 (messages préparés sur ce compte)"
    # la preuve générique du moteur reste : c'est le CRITÈRE à remplir, la preuve citée est ce qu'on a
    assert route["proof"]


def test_the_motivating_signal_is_named_with_source_and_day():
    route = _route(
        account_data={
            "recent_signals": [
                {"signal": "Thales ouvre une base au Japon", "date": "2026-10-12", "source": "Boursorama"}
            ]
        }
    )
    assert route["motivating_signal"] == "Thales ouvre une base au Japon · Boursorama · 2026-10-12"


def test_says_no_nothing_accumulated_nothing_cited_never_zero():
    for noise in (None, {}, {"proofs": "  "}, {"proofs": 3}):
        route = _route(accumulated_criteria=noise)
        assert "proof_cited" not in route
        assert "channel_history" not in route
    assert "motivating_signal" not in _route(account_data={"recent_signals": [{"signal": "x", "date": "2026"}]})


def test_a_french_prose_date_dates_the_signal_to_the_day_but_a_month_alone_does_not():
    route = _route(
        account_data={
            "recent_signals": [
                {"signal": "Contrat ESA", "date": "5 mai 2026", "source": "Site officiel Thales Alenia Space"},
                {"signal": "Plan stratégique", "date": "mars 2026", "source": "Renault"},
                {"signal": "Nomination", "date": "Non datée dans la page scrapée", "source": "VIPress.net"},
            ]
        }
    )
    assert route["motivating_signal"] == "Contrat ESA · Site officiel Thales Alenia Space · 2026-05-05"
