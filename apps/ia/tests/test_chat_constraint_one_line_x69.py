"""#3224 (recette prod 02/10, Y18) — « Priorité retenue : … je relâche … » apparaissait 2× d'affilée
(modèle d'achat puis référencement) : le fil porte DEUX contraintes « sans référencement » (l'une lue du
message, l'autre nommée par le modèle), chacune en conflit avec « grand groupe » → deux contradictions,
deux lignes. Une seule ligne, qui nomme les deux critères.
Question exacte à poser en recette (/chat, fil neuf) : « Trouve-moi des comptes grand groupe » puis « Et sans
référencement » puis « Le grand groupe compte plus que le reste »."""

from __future__ import annotations

from app.services.constraint_graph import ThreadConstraint, annotate_constraints, constraint_turn_addendum


def _thread(primary_size: bool) -> list[ThreadConstraint]:
    return annotate_constraints(
        [
            ThreadConstraint("size", "grand groupe", priority="primary" if primary_size else None, source_turn=3),
            ThreadConstraint("purchase_model", "sans référencement", source_turn=2),
            ThreadConstraint("referencing", "sans référencement", source_turn=2),
        ]
    )


def test_the_priority_line_appears_once_and_names_both_criteria() -> None:
    out = constraint_turn_addendum("", _thread(True), turn=3)
    assert out.count("Priorité retenue") == 1 and out.count("je relâche") == 1
    assert "modèle d'achat" in out and "référencement" in out
    assert out.count("« sans référencement »") == 1


def test_the_arbitration_question_appears_once_too() -> None:
    constraints = [
        replace_turn(c, 2) for c in _thread(False)
    ]
    out = constraint_turn_addendum("", constraints, turn=2)
    assert out.count("Arbitrage") == 1 and out.count("Laquelle garde la priorité") == 1


def test_english_line_is_single_as_well() -> None:
    out = constraint_turn_addendum("", _thread(True), turn=3, language="en")
    assert out.count("Priority kept") == 1


def replace_turn(c: ThreadConstraint, turn: int) -> ThreadConstraint:
    from dataclasses import replace

    return replace(c, source_turn=turn)
