"""#2007.6/#2007.7/#2007.10/#2007.12 — LA PROVENANCE ET LE STATUT DE CHAQUE
RÉPONSE ATTEIGNENT LE MODÈLE.

`answer_meta` (côté NestJS, `esn_profiles.answer_meta`, #2006.22) sait déjà
dire d'où vient chaque réponse (saisie, registre, Pappers, site, déduction,
connecteur) et si elle a été confirmée, proposée ou corrigée. Jusqu'ici, cette
carte n'atteignait jamais le Profileur : le modèle ne pouvait pas distinguer
une réponse déclarée d'une réponse importée, ni savoir laquelle avait été
corrigée après une première valeur.

Même patron que #2007.8 (`test_profiler_prompt_connected_tools.py`) : trois
champs ADDITIFS, silencieux quand absents — jamais une provenance inventée
pour une réponse qui n'a jamais été confirmée ni corrigée.
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


def test_la_provenance_et_le_statut_dune_reponse_atteignent_le_prompt() -> None:
    prompt = build_profiler_user_prompt(
        {**_TEMPS_1, "answer_provenance_lines": ["esn_name: source=user, statut=confirmed"]}
    )

    assert "esn_name: source=user, statut=confirmed" in prompt


def test_aucune_provenance_ne_sinvente_quand_la_liste_est_vide() -> None:
    prompt = build_profiler_user_prompt({**_TEMPS_1, "answer_provenance_lines": []})

    assert "answer_provenance_lines" not in prompt


def test_aucune_provenance_ne_sinvente_quand_le_champ_est_absent() -> None:
    prompt = build_profiler_user_prompt(_TEMPS_1)

    assert "answer_provenance_lines" not in prompt


def test_le_contexte_importe_atteint_le_prompt() -> None:
    prompt = build_profiler_user_prompt({**_TEMPS_1, "imported_context_keys": ["target_sectors"]})

    assert "target_sectors" in prompt.split("Contexte importé")[1]


def test_aucun_contexte_importe_ne_sinvente_quand_la_liste_est_vide() -> None:
    prompt = build_profiler_user_prompt({**_TEMPS_1, "imported_context_keys": []})

    assert "imported_context_keys" not in prompt


def test_les_corrections_passees_atteignent_le_prompt() -> None:
    prompt = build_profiler_user_prompt(
        {**_TEMPS_1, "corrected_answers_lines": ["consultant_size: corrigé le 2026-09-18"]}
    )

    assert "consultant_size: corrigé le 2026-09-18" in prompt


def test_aucune_correction_ne_sinvente_quand_la_liste_est_vide() -> None:
    prompt = build_profiler_user_prompt({**_TEMPS_1, "corrected_answers_lines": []})

    assert "corrected_answers_lines" not in prompt
