"""#4971.1 — les noms des outils MAISON atteignent le profiler.

Un client qui a un CRM / ATS / ERP développé en interne le NOMME à l'étape
outillage (`tooling_internal_names`, contrat `answers-outillage.ts`). Sans
champ déclaré ici, pydantic l'ignore en silence (`extra="ignore"`) et le nom
ne sert à rien.

#4971.2 — un nom saisi n'est jamais « branché » : le prompt le pose comme une
DÉCLARATION, jamais comme une connexion.
"""

from __future__ import annotations

from app.prompts.bellum_profiler import build_profiler_user_prompt
from app.routers.profiler import OnboardingAnswers


def test_le_modele_d_entree_garde_les_noms_internes() -> None:
    answers = OnboardingAnswers(user_id="u1", tooling_internal_names=["GestMission"])
    assert answers.model_dump()["tooling_internal_names"] == ["GestMission"]


def test_absent_reste_vide_jamais_invente() -> None:
    assert OnboardingAnswers(user_id="u1").model_dump()["tooling_internal_names"] == []


def test_le_prompt_porte_le_nom_saisi() -> None:
    prompt = build_profiler_user_prompt({"tooling_internal_names": ["GestMission"]})
    assert "GestMission" in prompt


def test_sans_reponse_le_prompt_ne_dit_rien() -> None:
    assert "GestMission" not in build_profiler_user_prompt({"tooling_internal_names": []})
