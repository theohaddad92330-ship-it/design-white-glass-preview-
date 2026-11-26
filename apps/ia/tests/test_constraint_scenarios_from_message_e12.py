"""#3224 (#3201.8) — les 6 scénarios du ticket, rejoués depuis UN message utilisateur (lecture
mécanique du message → graphe → question d'arbitrage), sans que le modèle nomme quoi que ce soit.

Question exacte à poser en recette (/chat, fil neuf), un message par scénario :
1. « Je cible des grands groupes, sans référencement »
2. « Je veux 50 comptes dans une petite commune »
3. « Je cherche des startups récentes créées avant 2010 »
4. « Du full remote, avec des interventions sur site »
5. « Je vise le client final, en rang 2 »
6. « Je vise des banques, accessibles immédiatement »
Attendu : une ligne « Arbitrage : … Laquelle garde la priorité ? » nommant les deux côtés.
"""

from __future__ import annotations

import pytest

from app.services.constraint_graph import constraint_turn_addendum, constraints_from_message, detect_conflicts

_SCENARIOS = [
    ("Je cible des grands groupes, sans référencement", "referencement", "taille « grand groupe »"),
    ("Je veux 50 comptes dans une petite commune", "volume", "volume attendu « 50 comptes »"),
    (
        "Je cherche des startups récentes créées avant 2010",
        "anciennete",
        "niveau de preuve « société créée avant 2010 »",
    ),
    ("Du full remote, avec des interventions sur site", "teletravail", "remote « full remote »"),
    ("Je vise le client final, en rang 2", "rang", "type de société « client final »"),
    ("Je vise des banques, accessibles immédiatement", "delai", "secteur « banque »"),
]


@pytest.mark.parametrize(("message", "rule", "side"), _SCENARIOS, ids=[s[1] for s in _SCENARIOS])
def test_each_ticket_scenario_is_read_from_one_message_and_arbitrated(message: str, rule: str, side: str) -> None:
    constraints = constraints_from_message(message, turn=1)
    [conflict] = detect_conflicts(constraints)
    assert conflict.rule == rule
    reply = constraint_turn_addendum("", constraints, turn=1)
    assert "Arbitrage :" in reply and "Laquelle garde la priorité ?" in reply
    assert side in reply
    assert "%" not in reply


@pytest.mark.parametrize(
    "message",
    ["Je veux 20 comptes dans une petite commune", "Des startups créées après 2022", "Du client final en direct"],
)
def test_a_message_that_does_not_oppose_anything_raises_no_conflict(message: str) -> None:
    assert detect_conflicts(constraints_from_message(message, turn=1)) == []
