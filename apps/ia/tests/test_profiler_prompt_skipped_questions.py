"""#2007.11 — LES QUESTIONS VOLONTAIREMENT PASSÉES ATTEIGNENT LE MODÈLE.

Le bouton « passer » du questionnaire (`ProfileQuestionnaireDialog.tsx`) ne
persistait rien : le Profileur ne pouvait pas distinguer une question qui
n'a jamais été posée d'une question que l'utilisateur a sciemment refusé de
remplir MAINTENANT. `answer_meta` (#2006.22) ne peut pas porter ce fait — il
suppose toujours qu'une valeur existe.

Même patron que #2007.6/#2007.7/#2007.10 (`test_profiler_prompt_answer_provenance.py`) :
un champ ADDITIF, silencieux quand absent — jamais une clé passée inventée.
"""

from __future__ import annotations

from app.prompts.bellum_profiler import build_profiler_user_prompt

_TEMPS_1 = {
    "esn_name": "DataCraft",
    "consultant_size": "1-10",
    "sales_team_size": "Je suis seul",
    "expertise_areas": ["Data", "Cloud"],
    "positioning": "Expertise de niche",
    "staffing_model": "Régie",
    "target_sectors": ["Banque", "Assurance"],
    "target_company_types": ["PME", "ETI"],
    "geo_zones": ["National"],
    "main_sales_pain": "Gérer mon temps",
}


def test_une_question_passee_atteint_le_prompt_comme_non_evaluable() -> None:
    prompt = build_profiler_user_prompt({**_TEMPS_1, "skipped_question_keys": ["avg_tjm"]})

    assert "avg_tjm" in prompt
    assert "NON ÉVALUABLES" in prompt


def test_aucune_question_passee_ne_sinvente_quand_la_liste_est_vide() -> None:
    prompt = build_profiler_user_prompt({**_TEMPS_1, "skipped_question_keys": []})

    assert "skipped_question_keys" not in prompt
    assert "NON ÉVALUABLES" not in prompt


def test_aucune_question_passee_ne_sinvente_quand_le_champ_est_absent() -> None:
    prompt = build_profiler_user_prompt(_TEMPS_1)

    assert "NON ÉVALUABLES" not in prompt
