"""#2899 (#2278.13) — les dix-sept dimensions de score du chat, NOMMÉES.

#2278.13 demande une rubrique de score conversationnel à 17 dimensions
(compréhension, personnalisation, exactitude, provenance, fraîcheur, utilité
commerciale, profondeur, concision, posture, continuité, bon usage des
outils, exécution réelle, sécurité, permissions, absence de boucle, qualité
sectorielle, qualité du prochain mouvement). Aucun scoreur n'existe pour le
chat (le rapport déterministe du banc DOSSIER note sur 8 métriques
différentes, `app/eval/report.py`) — ce module NOMME le vocabulaire, même
tour que `chat_hard_failures`/`chat_corpus_sources` avant lui : jamais un
score inventé sans scoreur pour le calculer.
"""

from __future__ import annotations

from app.eval.chat_score_dimensions import DIMENSION_LABELS, ChatScoreDimension


def test_exactly_seventeen_dimensions() -> None:
    assert len(list(ChatScoreDimension)) == 17


def test_every_dimension_has_a_bilingual_label() -> None:
    assert set(DIMENSION_LABELS.keys()) == set(ChatScoreDimension)
    for dimension, label in DIMENSION_LABELS.items():
        assert label.fr.strip(), f"{dimension} sans libellé FR"
        assert label.en.strip(), f"{dimension} sans libellé EN"


def test_no_two_dimensions_share_the_same_label() -> None:
    fr_labels = [label.fr for label in DIMENSION_LABELS.values()]
    assert len(fr_labels) == len(set(fr_labels))


def test_no_dimension_is_a_probability_or_a_bare_number() -> None:
    # Doctrine : aucune PROBABILITÉ ne s'affiche, et un score n'est jamais nu
    # — les valeurs de l'enum restent catégorielles, jamais numériques.
    for dimension in ChatScoreDimension:
        assert not any(char.isdigit() for char in dimension.value)
        assert "%" not in dimension.value


def test_values_are_stable_snake_case_strings() -> None:
    # GA-08 : une valeur ne change jamais de forme une fois écrite.
    assert ChatScoreDimension.COMPREHENSION.value == "comprehension"
    assert ChatScoreDimension.NEXT_MOVE_QUALITY.value == "next_move_quality"


def test_no_scorer_is_claimed_to_exist_yet() -> None:
    # Ce module ne prétend calculer AUCUN score — seulement nommer le
    # vocabulaire qu'un futur scoreur devra reconnaître.
    import app.eval.chat_score_dimensions as mod

    assert not hasattr(mod, "score")
    assert not hasattr(mod, "compute_score")
