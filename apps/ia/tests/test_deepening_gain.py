"""#189.7 (épopée #3218, lot E3 28/09 suite) — le gain marginal d'un round.

`marginal_gain` est la PLUS PETITE tranche utile et prouvable de #189.7 que ce
lot livre : la mesure elle-même, jamais le critère d'arrêt (qui suppose #189.1,
non livré — voir `deepening_gain.py` et le commentaire de clôture sur #3218).

Ce que ces tests verrouillent :
  1. deux instantanés identiques ne portent aucun gain ;
  2. une entité RÉELLEMENT nouvelle compte, un simple RE-mention non ;
  3. une décision ou une piste tranchée en plus compte ;
  4. les trois se cumulent, jamais en double ;
  5. `record_round_gain` ne lève JAMAIS, même journal cassé (même garantie que
     `tool_planner.record_plan_execution_log`).
"""

from __future__ import annotations

import logging

from app.services.chat_thread_state import ThreadObject, ThreadPersistentScope, ThreadRuledOut, ThreadState
from app.services.deepening_gain import marginal_gain, record_round_gain


def _obj(kind: str, id_: str, label: str = "x") -> ThreadObject:
    return ThreadObject(kind=kind, id=id_, label=label)


def test_two_identical_snapshots_carry_no_gain():
    state = ThreadState(objects=[_obj("account", "a1")], decisions=["Garde SNCF"])
    assert marginal_gain(state, state.copy()) == 0


def test_a_genuinely_new_entity_counts():
    before = ThreadState(objects=[_obj("account", "a1")])
    after = ThreadState(objects=[_obj("account", "a2"), _obj("account", "a1")])
    assert marginal_gain(before, after) == 1


def test_a_re_mention_of_an_existing_entity_counts_nothing():
    """#1927.7 — `ThreadStateCollector` réordonne un objet déjà connu (le plus
    récent en tête) sans en faire une découverte : la mesure ne doit pas le
    confondre avec un gain."""
    before = ThreadState(objects=[_obj("account", "a1"), _obj("contact", "c1")])
    after = ThreadState(objects=[_obj("contact", "c1"), _obj("account", "a1")])
    assert marginal_gain(before, after) == 0


def test_a_new_decision_and_a_new_ruled_out_path_each_count():
    before = ThreadState()
    after = ThreadState(
        decisions=["Garde Latecoere et Segula"],
        ruled_out=[ThreadRuledOut(option="Lyon", reason="hors périmètre")],
    )
    assert marginal_gain(before, after) == 2


def test_gains_from_the_three_axes_sum_without_double_counting():
    before = ThreadState(objects=[_obj("account", "a1")], decisions=["D1"], ruled_out=[])
    after = ThreadState(
        objects=[_obj("account", "a1"), _obj("account", "a2")],
        decisions=["D1", "D2"],
        ruled_out=[ThreadRuledOut(option="Nantes")],
    )
    assert marginal_gain(before, after) == 3


def test_record_round_gain_never_raises_even_on_a_broken_logger(monkeypatch, caplog):
    def _boom(*_args: object, **_kwargs: object) -> None:
        raise RuntimeError("journal indisponible")

    monkeypatch.setattr(logging.getLogger("app.services.deepening_gain"), "info", _boom)
    record_round_gain(round_index=0, gain=3)  # ne doit jamais lever


# ── Recette prod 07/10 (fix/demo-0810-r2b-laura) — une LECTURE neuve est un apport ──
#
# `marginal_gain` ne voit que les ~8 outils de `cited_objects` : une recherche de
# compte, des signaux, des contacts, une note de fil rendaient TOUJOURS 0, et le
# moteur arrêtait le tour après son premier round (Arquus : nom résolu, signaux
# jamais lus). `fresh_evidence` compte ce que le round a LU de neuf.


def test_a_new_successful_read_with_data_counts_as_evidence():
    from app.services.deepening_gain import fresh_evidence

    results = [("search_workspace_accounts|{}", {"accounts": [{"id": "a1", "name": "Arquus"}]}, False)]
    assert fresh_evidence(results, already_called=frozenset()) == 1


def test_a_note_thread_context_that_names_a_goal_counts():
    from app.services.deepening_gain import fresh_evidence

    results = [("note_thread_context|{}", {"status": "thread_note", "goal": "industriels BFC"}, False)]
    assert fresh_evidence(results, already_called=frozenset()) == 1


def test_an_error_an_empty_result_and_a_repeated_call_bring_nothing():
    from app.services.deepening_gain import fresh_evidence

    results = [
        ("a|1", {"error": "boom"}, True),
        ("b|1", {"accounts": [], "count": 0}, False),
        ("c|1", {"note": "rien"}, False),
        ("d|1", {"accounts": [{"id": "x"}]}, False),  # déjà appelé avec ces arguments
    ]
    assert fresh_evidence(results, already_called=frozenset({"d|1"})) == 0


def test_an_enveloped_search_that_found_nothing_stays_sterile():
    from app.models.tool_result_envelope import db_read_envelope
    from app.services.deepening_gain import fresh_evidence

    empty = {
        "accounts": [],
        "total": 0,
        "truncated": False,
        **db_read_envelope(
            result_type="account_list", items_count=0, total_found=0, truncated=False, source="bellum_workspace",
            scope={"query": "Arquus"},
        ).to_wire(),
    }
    assert fresh_evidence([("s|1", empty, False)], already_called=frozenset()) == 0


def test_the_same_signature_twice_in_one_round_counts_once():
    from app.services.deepening_gain import fresh_evidence

    results = [("a|1", {"rows": [1]}, False), ("a|1", {"rows": [1]}, False)]
    assert fresh_evidence(results, already_called=frozenset()) == 1


def test_3863_2_an_entity_excluded_from_the_scope_is_not_progress():
    """#3863.2 — un objet HORS cible (exclu du périmètre persistant) ne gonfle
    pas l'indicateur ; une entité simplement nouvelle (filiale trouvée) compte."""
    scope = ThreadPersistentScope(
        root_entity=_obj("account", "root"),
        excluded_entities=(_obj("account", "hors-cible"),),
    )
    before = ThreadState(persistent_scope=scope)
    off_target = ThreadState(objects=[_obj("account", "hors-cible")], persistent_scope=scope)
    assert marginal_gain(before, off_target) == 0
    on_target = ThreadState(objects=[_obj("account", "filiale")], persistent_scope=scope)
    assert marginal_gain(before, on_target) == 1
