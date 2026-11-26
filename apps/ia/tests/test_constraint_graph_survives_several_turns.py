"""#3853 (BEL-LAU-1008-002, recette prod 08/10, 2e passe) — « Maintenir un brief
commercial vivant pendant toute la demande. »

La recette KO testait la survie du brief sur UN SEUL message intermédiaire (le brief
demandait explicitement d'en tester TROIS) et n'a pas joué le volet Neutre : « conv
neuve: 'grand compte bancaire, direct, jamais sous-traitance' puis (1 seul msg
intermédiaire, pas 3) 'Et pour les PME ?' -> la zone bancaire et 'jamais sous-traitance'
restent actives ». Le mécanisme (`ThreadStateCollector`/`ThreadState.constraints`,
épopée #3224) ne limite nulle part le nombre de tours couverts — ce test le PROUVE sur
TROIS tours intermédiaires sans rapport, comme le brief le demandait, plutôt que de se
contenter d'un seul.
"""

from __future__ import annotations

from app.prompts.thread_state import format_thread_state_block
from app.services.chat_thread_state import ThreadState, ThreadStateCollector, thread_state_from_wire


def _note(collector: ThreadStateCollector, **fields: object) -> None:
    collector.record("note_thread_context", {}, {"status": "thread_note", **fields})


def _reloaded(collector: ThreadStateCollector) -> ThreadStateCollector:
    """Simule la reprise du fil au tour SUIVANT : la persistance passe par
    ``to_wire``/``thread_state_from_wire`` comme un vrai rechargement (#3201.5)."""
    return ThreadStateCollector(thread_state_from_wire(collector.state.to_wire()))


def test_a_constraint_survives_three_unrelated_intervening_turns() -> None:
    collector = ThreadStateCollector(ThreadState())

    # Tour 1 — « grand compte bancaire, direct, jamais sous-traitance ».
    _note(
        collector,
        constraints=[
            {"constraint_type": "sector", "value": "banque"},
            {"constraint_type": "company_type", "value": "grand compte"},
            {"constraint_type": "purchase_model", "value": "direct, jamais sous-traitance"},
        ],
    )
    original = {(c.constraint_type, c.value) for c in collector.state.constraints}
    assert original == {
        ("sector", "banque"),
        ("company_type", "grand compte"),
        ("purchase_model", "direct, jamais sous-traitance"),
    }

    # Trois tours intermédiaires SANS RAPPORT (le brief en demande trois, la recette
    # KO n'en avait joué qu'un) — chacun rechargé comme un vrai tour suivant.
    for current_job in ("Chercher des signaux sur un compte voisin", "Préparer un message", "Relire un contact"):
        collector = _reloaded(collector)
        _note(collector, current_job=current_job)
        # Le brief reste identique APRÈS chaque tour intermédiaire, pas seulement au dernier.
        assert {(c.constraint_type, c.value) for c in collector.state.constraints} == original

    # Tour 5 — « Et pour les PME ? » : seule la taille change, le reste tient.
    collector = _reloaded(collector)
    _note(collector, constraints=[{"constraint_type": "company_type", "value": "PME"}])
    final = {(c.constraint_type, c.value) for c in collector.state.constraints}
    assert final == {
        ("sector", "banque"),
        ("purchase_model", "direct, jamais sous-traitance"),
        ("company_type", "PME"),
    }

    block = format_thread_state_block(collector.state)
    assert "banque" in block
    assert "jamais sous-traitance" in block
