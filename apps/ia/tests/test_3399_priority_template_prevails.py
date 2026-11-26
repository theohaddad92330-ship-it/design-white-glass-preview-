"""#3399 — « Quel compte attaquer en premier ? » : le gabarit en cinq temps de
`_BLOCK_PRIORITISATION` PRIME ; les six questions restent des garde-fous INTERNES,
jamais une structure de réponse affichée (décision de Louis, 10/10/2026)."""

from __future__ import annotations

from app.prompts.laura_recommendation_guardrails import BLOCK_RECOMMENDATION_GUARDRAILS


def test_les_six_questions_sont_des_garde_fous_internes_non_affiches():
    text = BLOCK_RECOMMENDATION_GUARDRAILS
    assert "GARDE-FOUS INTERNES" in text
    assert "jamais une structure de réponse" in text
    assert "ne les écris pas comme des en-têtes" in text


def test_le_gabarit_de_priorisation_prime_sur_les_six_questions():
    text = BLOCK_RECOMMENDATION_GUARDRAILS
    assert "PRIORISER DES COMPTES" in text
    assert "PRIME" in text
