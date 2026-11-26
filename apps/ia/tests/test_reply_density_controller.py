"""#3192.8 (LAU-FINAL-198, reste des lots 28-29/09/2026) — LE CONTRÔLE DE
DENSITÉ RENDU PROUVABLE.

Recette en prod du 30/09 (commit 4a18b099a2) : « contrôle de densité de
réponse non prouvé ». Mesuré avant d'écrire : `detail_level_from_message`
(#2257.14) est calculé à chaque tour mais son résultat ne sert qu'au journal
— jamais consommé par `build_system_prompt`. Trois lots précédents (28/09,
L05, N07) ont buté sur « pas d'appel Claude live possible dans cet
environnement pour le vérifier empiriquement » sans remarquer que la moitié
PROUVABLE — le signal calculé, déterministe — n'était même pas câblée.

Ce fichier prouve deux choses qui NE dépendent PAS d'un appel Claude live :
1. `reply_density_signal_block` rend un texte différent selon le signal, et
   `""` en son absence (prompt inchangé au byte près).
2. `build_system_prompt` CONSOMME désormais ce signal — deux appels avec des
   `niveau_detail` différents rendent des prompts DIFFÉRENTS, ce qu'aucun
   test précédent ne pouvait affirmer puisque le paramètre n'existait pas.

L'appelant réel (`app/routers/chat.py`, `niveau_detail = detail_level_from_message(req.message)`
puis transmis à `build_system_prompt`) est prouvé dans `test_chat.py`.
"""

from __future__ import annotations

from app.prompts.bellum_advisor import build_system_prompt
from app.prompts.expected_density_signal import expected_density_signal_block
from app.prompts.reply_density_signal import reply_density_signal_block
from app.services.compilers.intent_markers import detail_level_from_message
from app.services.response_density import classify_expected_density

BARE = build_system_prompt({}, {}, "", "")


def test_no_marker_renders_nothing_never_a_guessed_value():
    assert reply_density_signal_block(None) == ""
    assert reply_density_signal_block("") == ""
    assert reply_density_signal_block("autre-chose-inconnue") == ""


def test_bref_and_detaille_render_distinct_named_signals():
    bref = reply_density_signal_block("bref")
    detaille = reply_density_signal_block("detaille")
    assert bref != ""
    assert detaille != ""
    assert bref != detaille
    assert "#2257.14" in bref
    assert "MICRO" in bref or "SHORT" in bref
    assert "DEEP" in detaille or "DÉCISION" in detaille


def test_build_system_prompt_without_signal_stays_byte_identical():
    """Absent = byte-identique : le contrat de tous les blocs volatils voisins
    (`reply_preferences_block`, `feedback_directives_block`, ...)."""
    assert build_system_prompt({}, {}, "", "", niveau_detail=None) == BARE


def test_build_system_prompt_now_consumes_the_signal():
    """Avant ce lot, ce paramètre n'existait pas : ces deux prompts auraient
    été IDENTIQUES quel que soit le signal calculé — c'est exactement le
    défaut nommé par la recette (« contrôle non prouvé »)."""
    with_bref = build_system_prompt({}, {}, "", "", niveau_detail="bref")
    with_detaille = build_system_prompt({}, {}, "", "", niveau_detail="detaille")
    assert with_bref != BARE
    assert with_detaille != BARE
    assert with_bref != with_detaille


def test_recipe_first_and_second_question_do_not_collapse_to_the_same_signal():
    """LAU-FINAL-198, RECETTE (#3192.6) : les deux premières questions de la
    recette ne produisent PAS le même signal calculé — la première (factuelle,
    aucun marqueur) reste `None`, la deuxième (« en détail ») produit
    `"detaille"`. C'est le seul des trois écarts de densité de la recette
    qu'un test sans appel Claude live peut établir ; les deux autres tiennent
    à la structure de la réponse (`_BLOCK_FORMAT`), pas à ce signal."""
    q1 = detail_level_from_message("SG prend des consultants ?")
    q2 = detail_level_from_message("Explique-moi en détail le modèle d'achat de SG")
    assert q1 is None
    assert q2 == "detaille"
    assert q1 != q2


# ── #3192.10 — recette prod du 30/09 (RÉFUTÉ) : le signal IMPLICITE ─────────
#
# « SG prend des consultants ? » (la question 1 de la recette elle-même) n'a
# AUCUN marqueur explicite (`q1 is None` ci-dessus) — c'est exactement pour
# ça qu'elle ne poussait jusqu'ici RIEN vers `build_system_prompt`, malgré
# `classify_expected_density` qui la classe déjà MICRO. Le prompt réel a
# rendu 420 mots avec Verdict/Pourquoi/alternatives : la moitié PROUVABLE
# (#3192.8/.9) existait mais ne pesait que sur la vérification APRÈS coup.


def test_the_recipe_question_one_is_classified_micro_with_no_explicit_marker():
    q1 = "SG prend des consultants ?"
    assert detail_level_from_message(q1) is None
    assert classify_expected_density(q1) == "micro"


def test_no_expected_level_or_non_micro_renders_nothing():
    assert expected_density_signal_block(None, None) == ""
    assert expected_density_signal_block("short", None) == ""
    assert expected_density_signal_block("decision", None) == ""
    assert expected_density_signal_block("deep", None) == ""


def test_micro_without_explicit_marker_renders_a_signal():
    block = expected_density_signal_block("micro", None)
    assert block != ""
    assert "MICRO" in block


def test_explicit_marker_wins_over_implicit_micro_never_a_duplicate():
    """Un marqueur explicite (#3192.8) a déjà couvert le signal : l'implicite
    ne s'ajoute pas par-dessus, jamais deux signaux pour le même tour."""
    assert expected_density_signal_block("micro", "bref") == ""
    assert expected_density_signal_block("micro", "detaille") == ""


def test_build_system_prompt_without_expected_density_stays_byte_identical():
    assert build_system_prompt({}, {}, "", "", expected_density=None) == BARE


def test_build_system_prompt_now_closes_the_recipe_gap():
    """Avant ce lot, ces deux appels auraient été byte-identiques à `BARE` : la
    question 1 de la recette (aucun marqueur explicite) ne pesait sur AUCUN
    signal. `expected_density="micro"` (calculé par `chat.py` sur ce même
    message) rend désormais un prompt DIFFÉRENT — c'est la moitié qui
    manquait pour que MICRO agisse avant génération, pas seulement après."""
    with_implicit_micro = build_system_prompt({}, {}, "", "", expected_density="micro")
    assert with_implicit_micro != BARE
    assert "MICRO" in with_implicit_micro


def test_the_micro_signal_caps_the_reply_at_two_sentences_to_count_before_answering():
    """#3192 (Y1 01/10) — « Et Armelle, elle est dans quel état de relation ? » (fil de 4 tours)
    rendait ≈72 mots en 3 phrases. Question à poser en recette : la même, dans un fil SG chargé —
    attendu : deux phrases au plus, sans Verdict/Pourquoi."""
    block = expected_density_signal_block("micro", None)
    assert "DEUX phrases au plus" in block
    assert "compte-les" in block


# ── #3192 (Y3 02/10) — fil de 10+ tours : la consigne de densité est le DERNIER texte lu ──
#
# Dans un fil chargé, l'historique (jusqu'à `_HISTORY_MSG_MAX` signes par tour) précède la
# question : le modèle en imite les longues réponses et la consigne MICRO, au système, est loin.
# Pour une question MICRO d'un fil à historique, le message utilisateur se ferme sur la consigne.
# Question exacte à poser en recette : dans un fil SG de 10+ tours, « Et Armelle, elle est dans
# quel état de relation ? » — attendu : deux phrases au plus, sans Verdict/Pourquoi.

from app.prompts.bellum_advisor import build_user_prompt  # noqa: E402


def _long_thread(turns: int) -> list[dict]:
    return [
        {"role": "user" if i % 2 == 0 else "assistant", "content": f"Tour {i} — " + "analyse détaillée. " * 40}
        for i in range(turns)
    ]


def test_micro_question_in_a_loaded_thread_ends_on_the_density_reminder():
    prompt = build_user_prompt(
        "Et Armelle, elle est dans quel état de relation ?", _long_thread(12), expected_density="micro"
    )
    assert prompt.index("Utilisateur: Et Armelle") < prompt.rindex("DEUX phrases au plus")
    assert prompt.rstrip().endswith("sans titre ni liste.)")


def test_the_reminder_never_appears_without_history_or_for_other_levels():
    message = "Et Armelle, elle est dans quel état de relation ?"
    assert build_user_prompt(message, [], expected_density="micro") == message
    assert "DEUX phrases" not in build_user_prompt(message, _long_thread(12), expected_density="deep")
    assert build_user_prompt(message, _long_thread(12)) == build_user_prompt(message, _long_thread(12), expected_density=None)
