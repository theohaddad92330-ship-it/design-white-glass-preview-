"""#2007.8 — L'ÉTAT DES CONNECTEURS ATTEINT LE MODÈLE.

`ToolRegistryService.list(userId)` (apps/api/.../tool-registry/tool-registry.service.ts)
sait déjà dire quels outils sont RÉELLEMENT connectés pour un espace (CRM, ATS,
agenda, Notion…) — distinct des réponses `tooling_*` du questionnaire, qui ne
sont que ce que l'utilisateur a DÉCLARÉ. Jusqu'ici, cette liste n'atteignait
jamais le Profileur : le modèle ne pouvait interpréter l'écart entre outillage
déclaré et outillage réellement branché.

Ce module garde le dernier bond (le rendu dans le prompt), sur le même patron
que #2007 (`test_profiler_prompt_extended_answers.py`) : un champ ADDITIF,
silencieux quand absent — jamais un « Non connecté » inventé pour un espace
qui n'a envoyé aucune liste.
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


def test_les_connecteurs_reellement_branches_atteignent_le_prompt() -> None:
    prompt = build_profiler_user_prompt({**_TEMPS_1, "connected_tools": ["Salesforce", "HubSpot"]})

    assert "Salesforce" in prompt
    assert "HubSpot" in prompt


def test_aucun_connecteur_ne_sinvente_quand_la_liste_est_vide() -> None:
    prompt = build_profiler_user_prompt({**_TEMPS_1, "connected_tools": []})

    assert "connected_tools" not in prompt


def test_aucun_connecteur_ne_sinvente_quand_le_champ_est_absent() -> None:
    prompt = build_profiler_user_prompt(_TEMPS_1)

    assert "connected_tools" not in prompt
