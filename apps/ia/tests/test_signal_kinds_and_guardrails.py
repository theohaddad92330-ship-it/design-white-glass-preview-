"""#2952 (#2305.6/.7/.11/.12/.30/.31/.33/.34) — LAU-FINAL-046.

Quatre natures de signal manquaient à la grille demandée au modèle
(transformation, demenagement, investissement, organisation) — le contrat
TypeScript (`signalKindSchema`) les acceptait déjà (`z.union([signalKindSchema,
z.string()])` permet tout, mais le PROMPT ne les demandait pas), donc le
modèle ne les produisait jamais. Et quatre garde-fous anti-conflation nommés
par l'issue n'apparaissaient nulle part dans les règles du prompt.

Ce test verrouille les deux : le prompt lui-même est la source de vérité, pas
juste le schéma qui l'accepte après coup.
"""

from __future__ import annotations

from app.prompts.bellum_signals import build_system_prompt, build_user_prompt

PROFILE = {"companyName": "TestESN", "size": "50", "offers": ["Data"], "sectors": ["Finance"], "personas": ["DSI"]}


def test_user_prompt_asks_for_the_four_missing_signal_kinds():
    prompt = build_user_prompt("Société Générale", "", "", "")
    for kind in ["transformation", "demenagement", "investissement", "organisation"]:
        assert kind in prompt


def test_user_prompt_keeps_the_existing_signal_kinds():
    prompt = build_user_prompt("Société Générale", "", "", "")
    for kind in [
        "nomination",
        "budget",
        "projet",
        "incident",
        "regulation",
        "acquisition",
        "partenariat",
        "restructuration",
        "recrutement",
    ]:
        assert kind in prompt


def test_system_prompt_names_the_four_anti_conflation_guardrails():
    prompt = build_system_prompt(PROFILE)
    # #2305.30 — CDI ≠ besoin freelance
    assert "CDI" in prompt and "freelance" in prompt
    # #2305.31 — nouvelle usine ≠ appel immediat a une ESN
    assert "usine" in prompt
    # #2305.33 — budget groupe ≠ budget filiale
    assert "GROUPE" in prompt and "filiale" in prompt
    # #2305.34 — nomination d'un dirigeant ≠ besoin d'achat
    assert "dirigeant" in prompt
