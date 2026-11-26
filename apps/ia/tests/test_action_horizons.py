"""Deterministic horizon bucketing for the plan's next-actions (méthodo p27).

Locks the 7j/30j/60j/90j grouping so the plan hierarchises the 3-5 actions by
WHEN they belong instead of deversing them flat (« horizons mauvais buckets »).
"""

from __future__ import annotations

from app.services.action_recommender import (
    ACTION_CATALOG,
    HORIZONS,
    group_actions_by_horizon,
    horizon_for,
    recommend_next_actions,
)


def test_horizon_for_known_actions_matches_the_catalogue():
    assert horizon_for("corriger_identite") == "7j"
    assert horizon_for("demander_intro") == "30j"
    assert horizon_for("push_profil") == "60j"
    assert horizon_for("foisonner_bu") == "90j"


def test_unknown_action_defaults_to_now():
    assert horizon_for("does_not_exist") == "7j"


def test_grouping_preserves_rank_order_within_a_bucket():
    actions = [
        {"id": "enrichir_p1"},  # 7j
        {"id": "envoyer_m1"},  # 7j
        {"id": "demander_intro"},  # 30j
        {"id": "push_profil"},  # 60j
        {"id": "foisonner_bu"},  # 90j
    ]
    buckets = group_actions_by_horizon(actions)
    assert list(buckets.keys()) == list(HORIZONS)
    assert [a["id"] for a in buckets["7j"]] == ["enrichir_p1", "envoyer_m1"]
    assert [a["id"] for a in buckets["30j"]] == ["demander_intro"]
    assert [a["id"] for a in buckets["60j"]] == ["push_profil"]
    assert [a["id"] for a in buckets["90j"]] == ["foisonner_bu"]


def test_every_action_lands_in_exactly_one_bucket():
    actions = [{"id": "enrichir_p1"}, {"id": "unknown_x"}, {"id": "renouvellement"}]
    buckets = group_actions_by_horizon(actions)
    total = sum(len(v) for v in buckets.values())
    assert total == len(actions)


def test_empty_input_yields_empty_buckets():
    buckets = group_actions_by_horizon([])
    assert buckets == {h: [] for h in HORIZONS}


def test_2317_4_aujourdhui_is_its_own_named_horizon():
    """#2317.4 (épopée #2923) — « Aujourd'hui » est un horizon distinct des
    quatre existants, jamais fusionné avec « 7j »."""
    assert "aujourd'hui" in HORIZONS
    assert HORIZONS.index("aujourd'hui") < HORIZONS.index("7j")


def test_2317_5_aujourdhui_is_not_filled_artificially():
    """#2317.5 — ne pas remplir chaque horizon artificiellement : sans action
    du catalogue rangée dessus, le bucket « aujourd'hui » reste VIDE, jamais
    complété par une action déplacée d'un autre horizon pour faire nombre."""
    for verdict in ("GO", "PRUDENT", "STOP", "EXPLORER", None):
        for rel in ("froid", "client_actif", "rang2", "besoin_ouvert", "refere", None):
            actions = recommend_next_actions(verdict=verdict, relationship_state=rel)
            assert group_actions_by_horizon(actions)["aujourd'hui"] == []


class TestEmittedActionsCarryTheirHorizon:
    """The bucketing above used to be pure computation nobody called: the
    emitted actions carried no ``horizon`` key, so no screen could group them
    (audit 2026-07-22 §G, « calculé sans consommateur »). Every action the
    selector emits now states WHEN it belongs."""

    def test_every_recommended_action_carries_its_horizon(self):
        for verdict in ("GO", "PRUDENT", "STOP", "EXPLORER", None):
            for rel in ("froid", "client_actif", "rang2", "besoin_ouvert", "refere", None):
                for action in recommend_next_actions(verdict=verdict, relationship_state=rel):
                    assert action["horizon"] in HORIZONS
                    assert action["horizon"] == horizon_for(action["id"])

    def test_emitted_actions_group_without_a_second_lookup(self):
        actions = recommend_next_actions(verdict="GO", relationship_state="client_actif")
        assert group_actions_by_horizon(actions) == {
            h: [a for a in actions if a["horizon"] == h] for h in HORIZONS
        }

    def test_the_horizon_key_is_additive(self):
        """The four historical keys keep their exact values — only a fifth key
        appears, so an older consumer reads the same action."""
        actions = recommend_next_actions(verdict="GO", relationship_state="froid")
        for action in actions:
            assert set(action) == {"id", "chantier", "label", "why", "horizon"}
            assert action["chantier"] == ACTION_CATALOG[action["id"]][0]
            assert action["label"] == ACTION_CATALOG[action["id"]][1]
