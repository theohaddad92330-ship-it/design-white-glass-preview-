"""#2088.12/.13 (DÉCISION Louis 18/09/2026, point 16) — les deux premiers vrais
NOMBRES du questionnaire atteignent le prompt du profiler.

`_complement_blocks` (`bellum_profiler.py`) ne rendait, avant ce lot, que les
chaînes et les listes : un `int` tombait dans aucune branche et restait muet,
transporté et stocké mais jamais lu par le modèle — le défaut n°1 de ce dépôt
(#2007). Ce module garde le câble bout en bout, et garde aussi ce qui NE DOIT
PAS bouger : `0` n'est jamais confondu avec « absent » (GA-18/GA-19), et une
clé absente du payload reste muette plutôt que de s'afficher « Non renseigné ».
"""

from __future__ import annotations

from app.prompts.bellum_profiler import build_profiler_user_prompt

_TEMPS_1 = {
    "first_name": "Théo",
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


def test_les_deux_nombres_atteignent_le_prompt_quand_repondus() -> None:
    answers = {**_TEMPS_1, "consultant_count": 7, "annual_revenue_amount": 620_000, "annual_revenue_period": "Dernier exercice clos"}
    prompt = build_profiler_user_prompt(answers)

    assert "consultant_count : 7" in prompt
    assert "annual_revenue_amount : 620000" in prompt
    assert "annual_revenue_period : Dernier exercice clos" in prompt


def test_zero_nest_pas_confondu_avec_absent() -> None:
    """`0` est une réponse réelle (une ESN qui vient de placer zéro consultant
    en ce moment) — elle doit apparaître, pas disparaître comme un champ vide."""

    answers = {**_TEMPS_1, "consultant_count": 0}
    prompt = build_profiler_user_prompt(answers)

    assert "consultant_count : 0" in prompt


def test_absent_reste_muet_jamais_non_renseigne() -> None:
    """Additif : un profil Temps-1 seul n'affiche NI les clés ni un « Non
    renseigné » inventé pour elles — même règle que les 25 champs de #2007."""

    prompt = build_profiler_user_prompt(dict(_TEMPS_1))

    assert "consultant_count" not in prompt
    assert "annual_revenue_amount" not in prompt
    assert "annual_revenue_period" not in prompt
