"""#3192 (LAU-FINAL-198) — recette du 30/09 : « contrôle de densité de réponse
non prouvé ». Ce fichier est la preuve : la RECETTE de l'issue elle-même
(trois questions, trois densités) rejouée comme test, sans appel de modèle.
"""

from __future__ import annotations

from app.services.response_density import classify_expected_density, density_mismatch

# ── #3192.9 — la RECETTE de l'issue, rejouée comme preuve déterministe ──────


def test_recette_the_three_questions_classify_at_three_distinct_levels():
    q1 = "SG prend des consultants ?"
    q2 = "Explique-moi en détail le modèle d'achat de SG"
    q3 = "Fais-moi une stratégie complète sur 30 jours"
    levels = {classify_expected_density(q1), classify_expected_density(q2), classify_expected_density(q3)}
    assert classify_expected_density(q1) == "micro"
    assert classify_expected_density(q2) == "decision"
    assert classify_expected_density(q3) == "deep"
    assert len(levels) == 3  # trois questions, trois densités — l'exigence même de la RECETTE


# ── #3192 (recette prod 01/10) — la relance « Et X, … ? » dans un fil chargé ──


def test_recette_01_10_a_short_follow_up_question_in_a_loaded_thread_is_micro():
    # Recette prod 01/10 : « Et Armelle, elle est dans quel état de relation ? »
    # (50 caractères) tombait à « short » — donc aucun signal MICRO — alors que
    # c'est une relance fermée d'un fil en cours. La longueur seule (40) la ratait.
    assert classify_expected_density("Et Armelle, elle est dans quel état de relation ?") == "micro"
    assert classify_expected_density("Et lui, il est où dans le process ?") == "micro"


def test_a_follow_up_opener_does_not_swallow_a_real_request():
    # Témoins : une relance longue, ou qui réclame un détail, ne devient pas MICRO.
    long_follow_up = "Et " + "x" * 90 + " ?"
    assert classify_expected_density(long_follow_up) == "short"
    assert classify_expected_density("Et détaille-moi le modèle d'achat de SG") == "decision"
    assert classify_expected_density("Et ensuite une stratégie complète sur 30 jours") == "deep"
    # « et » n'est un ouvreur que mot entier : « Étapes suivantes… » reste « short ».
    assert classify_expected_density("Étapes suivantes pour Armelle chez Thales cette semaine ?") == "short"


# ── classification — les quatre niveaux ─────────────────────────────────────


def test_short_is_the_default_for_a_plain_medium_question():
    assert classify_expected_density("Quels sont les contacts actifs chez Thales cette semaine ?") == "short"


def test_deep_trigger_does_not_fire_on_the_bare_word_strategie():
    # Témoin voisin : #3342 montre qu'une stratégie se demande parfois en une
    # phrase courte, sans réclamer un rapport structuré — un mot-clé isolé
    # capturerait à tort ce cas (son propre gabarit ne dépend pas d'ici).
    assert classify_expected_density("Ça serait quoi ta stratégie ?") != "deep"


def test_micro_threshold_is_on_message_length_not_punctuation():
    assert classify_expected_density("Ok merci") == "micro"


# ── density_mismatch — le symptôme exact du corps de l'issue ────────────────


def test_mismatch_on_a_mini_report_for_a_micro_question():
    # « Ne plus produire un mini-rapport pour une question de deux lignes. »
    assert density_mismatch("micro", "x" * 400) is True


def test_pass_on_a_short_reply_to_a_micro_question():
    assert density_mismatch("micro", "Oui, trois missions en cours chez SG.") is False


def test_mismatch_on_a_one_liner_for_a_deep_report_request():
    # Le symptôme inverse : un rapport structuré demandé, une phrase rendue.
    assert density_mismatch("deep", "Voici trois pistes.") is True


def test_pass_on_a_structured_reply_to_a_deep_report_request():
    assert density_mismatch("deep", "x" * 600) is False


def test_pass_at_exactly_the_micro_ceiling():
    assert density_mismatch("micro", "x" * 320) is False


def test_mismatch_just_above_the_micro_ceiling():
    assert density_mismatch("micro", "x" * 321) is True


def test_decision_and_short_have_their_own_ceilings():
    assert density_mismatch("short", "x" * 700) is False
    assert density_mismatch("short", "x" * 701) is True
    assert density_mismatch("decision", "x" * 900) is False
    assert density_mismatch("decision", "x" * 901) is True
