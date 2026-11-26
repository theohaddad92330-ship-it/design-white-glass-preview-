"""#2372.8 — si le contexte est mince, Laura pose une question honnête plutôt
que d'inventer une actualité.

Le garde-fou #2368.14 (``assert_claims_are_grounded``, evidence_gate.py) bloque
déjà APRÈS coup toute affirmation sans preuve — mais ne dit jamais au modèle
QUOI faire à la place : sans cette consigne, un contexte mince produit soit une
affirmation inventée (bloquée en 422, brouillon perdu, appel payé pour rien),
soit un message vide de personnalisation. Ce test épingle la consigne
manquante dans ``_COMMON_GUARDRAILS`` : à contexte mince, poser une question
honnête plutôt qu'inventer.
"""

from __future__ import annotations

from app.prompts.bellum_outreach import build_system_prompt

_PROFILE = {"companyName": "Acme ESN", "offers": ["conseil IT"]}


def test_le_prompt_outreach_interdit_dinventer_une_actualite_et_demande_une_question_honnete() -> None:
    prompt = build_system_prompt(_PROFILE, "email")
    assert "actualité" in prompt
    assert "question honnête" in prompt


def test_la_consigne_sapplique_aux_trois_canaux() -> None:
    for channel in ("email", "linkedin", "phone"):
        prompt = build_system_prompt(_PROFILE, channel)
        assert "question honnête" in prompt, f"canal {channel} : consigne #2372.8 absente"
