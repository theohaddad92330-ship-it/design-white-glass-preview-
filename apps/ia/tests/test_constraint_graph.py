"""#3201.1 / #3201.2 / #3201.5 / #3201.8 (épopée #3224) — LE GRAPHE DE
CONTRAINTES PORTÉ PAR LE FIL, ET LA DÉTECTION MÉCANIQUE DES CONFLITS.

Le modèle NOMME les contraintes posées (`note_thread_context.constraints`,
vocabulaire fermé de 17 types), le collecteur les stocke, `detect_conflicts` est
une fonction pure sur ce qui est stocké, et le bloc d'état du fil dit le conflit
AVANT que Laura choisisse sa question d'arbitrage. Chaque scénario du ticket
rejoue le tour entier : exécuteur → collecteur → bloc d'état → fil relu.
"""

from __future__ import annotations

import asyncio
from typing import Any

import pytest

from app.prompts.thread_state import format_thread_state_block
from app.services.chat_thread_state import ThreadState, ThreadStateCollector, thread_state_from_wire
from app.services.chat_tools import NOTE_THREAD_CONTEXT_TOOL, execute_chat_tool
from app.services.constraint_graph import (
    CONSTRAINT_TYPES,
    ThreadConstraint,
    detect_conflicts,
)


def _c(ctype: str, value: str, hardness: str = "hard", origin: str = "explicit") -> ThreadConstraint:
    return ThreadConstraint(constraint_type=ctype, value=value, hardness=hardness, origin=origin)


def test_the_vocabulary_has_the_17_types_of_the_ticket() -> None:
    assert len(CONSTRAINT_TYPES) == 17
    assert len(set(CONSTRAINT_TYPES)) == 17


def test_the_tool_schema_exposes_the_closed_vocabulary() -> None:
    props = NOTE_THREAD_CONTEXT_TOOL["input_schema"]["properties"]
    item = props["constraints"]["items"]
    assert item["properties"]["constraint_type"]["enum"] == list(CONSTRAINT_TYPES)
    assert item["properties"]["hardness"]["enum"] == ["hard", "soft"]
    assert item["properties"]["origin"]["enum"] == ["explicit", "inferred"]


# ── detect_conflicts : doit savoir dire NON ──────────────────────────────────


def test_compatible_constraints_give_no_conflict() -> None:
    constraints = [
        _c("geography", "Île-de-France"),
        _c("size", "grand groupe"),
        _c("purchase_model", "référencé chez eux"),
        _c("remote", "full remote"),
        _c("sector", "banque"),
    ]
    assert detect_conflicts(constraints) == []


def test_one_constraint_never_conflicts_with_itself() -> None:
    # « grand groupe sans référencement » dans UNE seule contrainte n'est pas
    # un conflit entre deux contraintes : c'est une seule demande.
    assert detect_conflicts([_c("size", "grand groupe sans référencement")]) == []


def test_empty_gives_nothing() -> None:
    assert detect_conflicts([]) == []


def test_a_hard_hard_conflict_relaxes_neither() -> None:
    [conflict] = detect_conflicts([_c("size", "grand groupe"), _c("purchase_model", "sans référencement")])
    assert conflict.relax is None


def test_a_soft_side_is_the_one_proposed_for_relaxation() -> None:
    [conflict] = detect_conflicts(
        [_c("size", "grand groupe"), _c("purchase_model", "sans référencement", hardness="soft")]
    )
    assert conflict.relax is not None
    assert conflict.relax.constraint_type == "purchase_model"


def test_compatible_with_and_conflicts_with_are_computed_per_constraint() -> None:
    a, b, c = _c("size", "grand groupe"), _c("purchase_model", "sans référencement"), _c("geography", "Lyon")
    conflicts = detect_conflicts([a, b, c])
    assert [(x.first.constraint_type, x.second.constraint_type) for x in conflicts] == [("size", "purchase_model")]


# ── Les 6 scénarios du ticket (#3201.8), tour entier rejoué ──────────────────

_SCENARIOS: list[tuple[str, list[dict[str, str]], str]] = [
    (
        "grand_groupe_sans_referencement",
        [
            {"constraint_type": "size", "value": "grand groupe"},
            {"constraint_type": "purchase_model", "value": "sans référencement"},
        ],
        "referencement",
    ),
    (
        "50_comptes_petite_commune",
        [
            {"constraint_type": "expected_volume", "value": "50 comptes"},
            {"constraint_type": "geography", "value": "petite commune"},
        ],
        "volume",
    ),
    (
        "startup_recente_creee_avant_2010",
        [
            {"constraint_type": "company_type", "value": "startup récente"},
            {"constraint_type": "proof_level", "value": "société créée avant 2010"},
        ],
        "anciennete",
    ),
    (
        "full_remote_secteur_regule_sur_site",
        [
            {"constraint_type": "remote", "value": "full remote"},
            {"constraint_type": "service_type", "value": "intervention sur site, secteur réglementé"},
        ],
        "teletravail",
    ),
    (
        "client_final_rang_2",
        [
            {"constraint_type": "company_type", "value": "client final"},
            {"constraint_type": "purchase_model", "value": "rang 2"},
        ],
        "rang",
    ),
    (
        "compte_bancaire_accessible_immediatement",
        [
            {"constraint_type": "sector", "value": "banque"},
            {"constraint_type": "deadline", "value": "accessible immédiatement"},
        ],
        "delai",
    ),
]


def _replay(constraints: list[dict[str, str]]) -> tuple[ThreadStateCollector, dict[str, Any]]:
    out = asyncio.run(
        execute_chat_tool("note_thread_context", {"constraints": constraints}, user_id="u-1", profile_data=None)
    )
    collector = ThreadStateCollector(ThreadState())
    collector.record("note_thread_context", {}, out)
    return collector, out


@pytest.mark.parametrize(("name", "constraints", "rule_key"), _SCENARIOS, ids=[s[0] for s in _SCENARIOS])
def test_each_ticket_scenario_is_detected_and_said_before_the_arbitration(
    name: str, constraints: list[dict[str, str]], rule_key: str
) -> None:
    collector, out = _replay(constraints)
    assert out["status"] == "thread_note"
    assert len(collector.state.constraints) == 2

    [conflict] = detect_conflicts(collector.state.constraints)
    assert conflict.rule == rule_key

    block = format_thread_state_block(collector.state)
    assert "CONFLIT DE CONTRAINTES" in block
    assert "UNE question d'arbitrage" in block
    assert "%" not in block  # jamais une probabilité (doctrine)

    # Le fil relu au tour suivant porte encore le conflit.
    reread = thread_state_from_wire(collector.state.to_wire())
    assert detect_conflicts(reread.constraints)


def test_a_state_without_conflict_says_nothing_about_conflict() -> None:
    collector, _ = _replay(
        [{"constraint_type": "geography", "value": "Lyon"}, {"constraint_type": "sector", "value": "industrie"}]
    )
    block = format_thread_state_block(collector.state)
    assert "Contraintes posées" in block
    assert "CONFLIT DE CONTRAINTES" not in block


def test_a_type_outside_the_vocabulary_is_dropped_not_guessed() -> None:
    _, out = _replay(
        [{"constraint_type": "couleur_preferee", "value": "bleu"}, {"constraint_type": "sector", "value": "banque"}]
    )
    assert [c["constraint_type"] for c in out["constraints"]] == ["sector"]


def test_naming_the_same_type_again_replaces_it() -> None:
    collector = ThreadStateCollector(ThreadState())
    collector.record(
        "note_thread_context",
        {},
        {
            "status": "thread_note",
            "constraints": [
                {"constraint_type": "geography", "value": "Paris", "hardness": "hard", "origin": "explicit"}
            ],
        },
    )
    collector.record(
        "note_thread_context",
        {},
        {
            "status": "thread_note",
            "constraints": [
                {"constraint_type": "geography", "value": "Lyon", "hardness": "soft", "origin": "inferred"}
            ],
        },
    )
    assert [(c.value, c.hardness, c.origin) for c in collector.state.constraints] == [("Lyon", "soft", "inferred")]


def test_an_old_state_without_constraints_reads_without_error() -> None:
    assert thread_state_from_wire({"version": 1}).constraints == []


# ── #3201.1 (reste) : priorité, coût de relâchement, impact métier ───────────


def _cx(ctype: str, value: str, **extra: str) -> ThreadConstraint:
    return ThreadConstraint(constraint_type=ctype, value=value, **extra)


def test_the_tool_schema_names_the_three_remaining_fields_as_closed_vocabularies() -> None:
    item = NOTE_THREAD_CONTEXT_TOOL["input_schema"]["properties"]["constraints"]["items"]["properties"]
    assert item["priority"]["enum"] == ["primary", "secondary"]
    assert item["relaxation_cost"]["enum"] == ["low", "medium", "high"]
    assert item["business_impact"]["type"] == "string"


def test_the_three_fields_survive_the_wire_and_an_unnamed_one_stays_absent() -> None:
    from app.services.constraint_graph import constraint_from_raw

    named = constraint_from_raw(
        {
            "constraint_type": "size",
            "value": "grand groupe",
            "priority": "primary",
            "relaxation_cost": "high",
            "business_impact": "cœur de cible",
        }
    )
    assert named is not None
    assert named.to_wire()["relaxation_cost"] == "high"
    assert named.to_wire()["priority"] == "primary"
    assert named.to_wire()["business_impact"] == "cœur de cible"
    bare = constraint_from_raw({"constraint_type": "size", "value": "grand groupe"})
    assert bare is not None
    # « non nommé » n'est jamais une valeur par défaut inventée.
    assert set(bare.to_wire()) == {"constraint_type", "value", "hardness", "origin"}
    # hors vocabulaire : disparaît, ne devient pas « medium ».
    odd = constraint_from_raw({"constraint_type": "size", "value": "x", "relaxation_cost": "enorme"})
    assert odd is not None and odd.relaxation_cost is None


def test_two_soft_sides_relax_the_cheaper_one() -> None:
    conflicts = detect_conflicts(
        [
            _cx("size", "grand groupe", hardness="soft", relaxation_cost="high"),
            _cx("purchase_model", "sans référencement", hardness="soft", relaxation_cost="low"),
        ]
    )
    assert conflicts[0].relax is not None
    assert conflicts[0].relax.constraint_type == "purchase_model"
    swapped = detect_conflicts(
        [
            _cx("size", "grand groupe", hardness="soft", relaxation_cost="low"),
            _cx("purchase_model", "sans référencement", hardness="soft", relaxation_cost="high"),
        ]
    )
    assert swapped[0].relax is not None and swapped[0].relax.constraint_type == "size"


def test_unnamed_cost_keeps_the_previous_choice() -> None:
    conflicts = detect_conflicts(
        [_c("size", "grand groupe", hardness="soft"), _c("purchase_model", "sans référencement", hardness="soft")]
    )
    assert conflicts[0].relax is not None and conflicts[0].relax.constraint_type == "purchase_model"


def test_the_thread_block_tells_the_cost_and_the_impact() -> None:
    from app.prompts.thread_state import format_thread_state_block
    from app.services.chat_thread_state import ThreadState

    state = ThreadState(
        constraints=[
            _cx("size", "grand groupe", hardness="soft", relaxation_cost="high", business_impact="cœur de cible"),
            _cx("purchase_model", "sans référencement", hardness="soft", relaxation_cost="low", priority="secondary"),
        ]
    )
    block = format_thread_state_block(state) or ""
    assert "coût de relâchement élevé" in block
    assert "impact : cœur de cible" in block
    assert "priorité secondaire" in block
    assert "propose de relâcher modèle d'achat" in block


# ── Lot X36 (02/10) — le tour qui a posé la contrainte, et qui contredit qui ──


def _play_turn(previous: dict[str, Any] | None, constraints: list[dict[str, str]]) -> ThreadStateCollector:
    """UN tour entier : exécuteur `note_thread_context` → collecteur relu du fil précédent."""
    out = asyncio.run(
        execute_chat_tool("note_thread_context", {"constraints": constraints}, user_id="u-1", profile_data=None)
    )
    collector = ThreadStateCollector(thread_state_from_wire(previous))
    collector.record("note_thread_context", {}, out)
    return collector


@pytest.mark.parametrize(("name", "constraints", "rule_key"), _SCENARIOS, ids=[s[0] for s in _SCENARIOS])
def test_a_conflict_across_two_turns_cites_both_constraints_and_their_turn(
    name: str, constraints: list[dict[str, str]], rule_key: str
) -> None:
    first, second = constraints
    turn1 = _play_turn(None, [first])
    turn2 = _play_turn(turn1.state.to_wire(), [second])

    by_type = {c.constraint_type: c for c in turn2.state.constraints}
    a, b = by_type[first["constraint_type"]], by_type[second["constraint_type"]]
    assert (a.source_turn, b.source_turn) == (1, 2)
    assert a.conflicts_with == (b.constraint_type,)
    assert b.conflicts_with == (a.constraint_type,)
    assert a.compatible_with == () and b.compatible_with == ()

    # Au tour 3, le bloc que Laura lit AVANT sa question d'arbitrage.
    block = format_thread_state_block(thread_state_from_wire(turn2.state.to_wire()))
    conflict_line = next(line for line in block.splitlines() if "CONFLIT DE CONTRAINTES" in line)
    assert f"« {first['value']} » (posée au tour 1)" in conflict_line
    assert f"« {second['value']} » (posée au tour 2)" in conflict_line
    assert "en conflit avec" in block
    assert "%" not in block


def test_a_compatible_constraint_is_carried_and_a_replaced_one_takes_the_new_turn() -> None:
    turn1 = _play_turn(
        None,
        [
            {"constraint_type": "size", "value": "grand groupe"},
            {"constraint_type": "geography", "value": "Lyon"},
        ],
    )
    turn2 = _play_turn(turn1.state.to_wire(), [{"constraint_type": "purchase_model", "value": "sans référencement"}])
    by_type = {c.constraint_type: c for c in turn2.state.constraints}
    assert by_type["geography"].source_turn == 1
    assert by_type["geography"].compatible_with == ("size", "purchase_model")
    assert by_type["geography"].conflicts_with == ()
    assert by_type["size"].compatible_with == ("geography",)
    assert by_type["size"].conflicts_with == ("purchase_model",)

    # Renommer un type le REMPLACE et lui donne le tour courant : le conflit disparaît.
    turn3 = _play_turn(turn2.state.to_wire(), [{"constraint_type": "size", "value": "PME"}])
    size = next(c for c in turn3.state.constraints if c.constraint_type == "size")
    assert size.source_turn == 3
    assert not detect_conflicts(turn3.state.constraints)
    assert "CONFLIT DE CONTRAINTES" not in format_thread_state_block(turn3.state)


def test_an_old_state_without_turns_reads_and_renders_without_a_turn() -> None:
    wire = {
        "version": 1,
        "constraints": [
            {"constraint_type": "size", "value": "grand groupe"},
            {"constraint_type": "purchase_model", "value": "sans référencement"},
        ],
    }
    state = thread_state_from_wire(wire)
    assert state.turns == 0 and all(c.source_turn is None for c in state.constraints)
    block = format_thread_state_block(state)
    assert "CONFLIT DE CONTRAINTES" in block and "posée au tour" not in block
