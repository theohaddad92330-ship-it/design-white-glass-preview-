"""#3278.b (recette R39, EDF) — un plan re-planifié nomme la ROUTE et le SIGNAL suivi (daté).
Le signal suivi est le plus récent signal DATÉ AU JOUR du compte ; sans lui, aucune clé (jamais inventé)."""

from __future__ import annotations

from datetime import date

from app.services.opening_movement import attach_plan_followed_signal, followed_signal_for_plan

TODAY = date(2026, 10, 16)


def test_the_most_recent_day_dated_signal_is_followed():
    account = {
        "recentSignals": [
            {"signal": "Appel d'offres cloud", "date": "2026-09-02", "source": "BOAMP"},
            {"signal": "Nouvelle DSI nommée", "date": "2026-10-05T08:00:00Z", "source": "Les Échos"},
        ]
    }
    assert followed_signal_for_plan(account, today=TODAY) == {
        "signal": "Nouvelle DSI nommée",
        "date": "2026-10-05",
        "source": "Les Échos",
    }


def test_says_no_undated_year_only_future_or_empty_signals_are_never_followed():
    account = {
        "recent_signals": [
            {"signal": "Sans date"},
            {"signal": "Année seule", "date": "2026"},
            {"signal": "Mois seul", "date": "2026-09"},
            {"signal": "Dans le futur", "date": "2026-12-01"},
            {"signal": "", "date": "2026-10-01"},
        ]
    }
    assert followed_signal_for_plan(account, today=TODAY) is None
    assert followed_signal_for_plan({}, today=TODAY) is None


def test_attach_writes_followed_signal_and_leaves_the_plan_alone_without_one():
    merged = {"strategy": "x"}
    attach_plan_followed_signal(merged, {"recentSignals": [{"signal": "S", "date": "2026-10-01"}]}, today=TODAY)
    assert merged["followedSignal"] == {"signal": "S", "date": "2026-10-01"}
    bare = {"strategy": "x"}
    attach_plan_followed_signal(bare, {"recentSignals": [{"signal": "S"}]}, today=TODAY)
    assert bare == {"strategy": "x"}
