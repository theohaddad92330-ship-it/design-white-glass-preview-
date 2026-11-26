"""#1924 — LE JEU D'ÉVALUATION DU VERDICT : la carte, et une seule fois.

Les gardes voisines tiennent chacune une moitié, et le trou était entre les deux :
`test_reply_formats_prompt.py` vérifie qu'une chaîne est dans le PROMPT,
`test_reply_blocks.py` mocke `call_claude` et ne vérifie donc que le PARSING, et
`pnpm eval:gate` ne rejoue que des fixtures d'ANALYSE. **Aucune ne regarde une
RÉPONSE.** C'est pourquoi la production a pu rendre, le 14/09/2026, un verdict en
texte sectionné ÉCRIT DEUX FOIS sans qu'un seul test rougisse.

Ce fichier fait rejouer `app.eval.chat_verdict` — le même contrôleur que le
chemin `--live`, qui lui pose la vraie question au vrai modèle — sur un corpus
de réponses COMMITTÉES. Déterministe, hors ligne, zéro appel payant.

Les trois preuves qu'une garde doit donner :
  * elle LIT quelque chose — le corpus est chargé depuis le disque et son compte
    est vérifié (`test_le_corpus_est_charge_et_il_n_est_pas_vide`) ;
  * elle sait dire NON — la réponse de production y est, reconstituée dans sa
    FORME, et elle doit produire exactement ses deux constats ;
  * elle n'attrape pas ce qu'elle ne vise pas — deux témoins : une question
    factuelle répondue en deux phrases, et une question marché rendue avec son
    gabarit texte légitime (« 1. VERDICT — une phrase »), qui restent verts.
"""

from __future__ import annotations

import pytest

from app.eval.chat_verdict import (
    DUPLICATE_VERDICT,
    MISSING_VERDICT_BLOCK,
    REPEATED_CARD_CONTENT,
    audit_answer,
    is_verdict_question,
    load_cases,
)

CASES = load_cases()


# ── Ce que la garde LIT ───────────────────────────────────────────────────────


def test_le_corpus_est_charge_et_il_n_est_pas_vide() -> None:
    assert len(CASES) >= 5, f"corpus trop maigre pour garder quoi que ce soit : {len(CASES)}"
    assert any(case.expected for case in CASES), "aucun cas ROUGE : la garde ne peut pas dire non"
    assert any(not case.expected for case in CASES), "aucun cas VERT : la garde ne fait que refuser"


@pytest.mark.parametrize("case", CASES, ids=[case.name for case in CASES])
def test_chaque_reponse_du_corpus_rend_le_verdict_attendu(case) -> None:
    assert sorted(audit_answer(case.question, case.answer)) == sorted(case.expected), case.why


# ── Elle sait dire NON : la réponse mesurée en production ─────────────────────


def test_la_reponse_de_production_est_refusee_pour_ses_deux_symptomes() -> None:
    case = next(c for c in CASES if c.name == "production_2026_09_14_thales")
    findings = audit_answer(case.question, case.answer)
    assert MISSING_VERDICT_BLOCK in findings, "symptôme 1 : aucune carte verdict rendue"
    assert DUPLICATE_VERDICT in findings, "symptôme 2 : le verdict écrit deux fois"


def test_une_carte_juste_devient_rouge_des_qu_on_la_reecrit_en_texte() -> None:
    """La mutation qui prouve le refus de la redite, sur un cas VERT du corpus."""
    good = next(c for c in CASES if c.name == "verdict_rendu_en_carte")
    assert audit_answer(good.question, good.answer) == []
    redite = good.answer + "\n\nEn clair : oui, mais pas en placement immédiat, et pas sans une entrée nommée."
    assert REPEATED_CARD_CONTENT in audit_answer(good.question, redite)


def test_une_question_de_verdict_sans_carte_est_refusee() -> None:
    assert is_verdict_question("Est-ce que je peux placer un expert cyber chez ce compte ?")
    assert MISSING_VERDICT_BLOCK in audit_answer(
        "Réponds par un verdict net : est-ce que je peux y aller ?",
        "Oui, tu peux y aller, mais prépare l'entrée avant.",
    )


# ── Les témoins : ce qu'elle ne vise PAS ─────────────────────────────────────


def test_une_question_qui_n_appelle_aucun_verdict_ne_reclame_aucune_carte() -> None:
    question = "Combien de comptes est-ce que j'ai dans mon portefeuille ?"
    assert not is_verdict_question(question)
    assert audit_answer(question, "Tu en as 62. Tu veux que je te dise lesquels ont bougé cette semaine ?") == []


def test_le_gabarit_texte_legitime_d_une_question_marche_reste_vert() -> None:
    """Une question marché rend ses cinq temps EN TEXTE, verdict compris : c'est
    le gabarit prévu, pas une redite. Une garde qui rougirait ici interdirait une
    réponse juste."""
    case = next(c for c in CASES if c.name == "temoin_question_marche_cinq_temps")
    assert not is_verdict_question(case.question)
    assert audit_answer(case.question, case.answer) == []
