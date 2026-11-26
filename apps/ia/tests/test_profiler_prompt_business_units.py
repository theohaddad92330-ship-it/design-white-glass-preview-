"""#2007.3 — LE PÉRIMÈTRE PORTÉ (BU / agence) ATTEINT LE PROFILEUR.

La couche BU (`business_units` + `business_unit_members`) atteignait déjà les
prompts d'analyse (#2118.9, `bellum_plan.seller_scope_directive_block`) mais
jamais le Profileur : l'audit d'un commercial de l'agence lyonnaise se
raisonnait comme celui de toute l'ESN.

Même patron que #2007.8 (`test_profiler_prompt_connected_tools.py`) : un champ
ADDITIF, silencieux quand absent — jamais un périmètre inventé. La ligne d'une
BU est rendue par LE formateur de #2118.9 (`_business_unit_line`, GA-26).
"""

from __future__ import annotations

from app.prompts.bellum_profiler import build_profiler_user_prompt
from app.routers.profiler import OnboardingAnswers

_TEMPS_1 = {
    "esn_name": "DataCraft",
    "consultant_size": "1-10",
    "sales_team_size": "Je suis seul",
    "expertise_areas": ["Data", "Cloud"],
    "positioning": "Expertise de niche",
    "staffing_model": "Régie",
    "target_sectors": ["Banque"],
    "target_company_types": ["PME"],
    "geo_zones": ["National"],
    "main_sales_pain": "Gérer mon temps",
}

_LYON = {"name": "Agence Lyon", "kind": "agency", "territory": "Auvergne-Rhône-Alpes", "specialties": ["Data"]}


def test_le_perimetre_porte_atteint_le_prompt() -> None:
    prompt = build_profiler_user_prompt({**_TEMPS_1, "business_units": [_LYON]})

    bloc = prompt.split("Périmètre porté")[1]
    assert "Agence Lyon (agence ; territoire : Auvergne-Rhône-Alpes ; spécialités : Data)" in bloc


def test_aucun_perimetre_ne_sinvente_quand_la_liste_est_vide() -> None:
    prompt = build_profiler_user_prompt({**_TEMPS_1, "business_units": []})

    assert "Périmètre porté" not in prompt


def test_aucun_perimetre_ne_sinvente_quand_le_champ_est_absent() -> None:
    assert build_profiler_user_prompt(_TEMPS_1) == build_profiler_user_prompt({**_TEMPS_1, "business_units": []})


def test_une_bu_sans_nom_ne_produit_aucune_ligne() -> None:
    prompt = build_profiler_user_prompt({**_TEMPS_1, "business_units": [{"name": " ", "kind": "agency"}]})

    assert "Périmètre porté" not in prompt


def test_lendpoint_accepte_le_champ_et_le_transmet_au_prompt() -> None:
    """Le modèle de requête de `POST /profiler/generate` accepte le champ (additif),
    et `model_dump` le rend sous la forme que le prompt lit."""
    body = OnboardingAnswers.model_validate({**_TEMPS_1, "user_id": "u-1", "business_units": [_LYON]})
    dumped = body.model_dump(exclude={"user_id", "progress_callback"})

    assert dumped["business_units"][0]["name"] == "Agence Lyon"
    assert "Agence Lyon" in build_profiler_user_prompt(dumped)


def test_un_appelant_plus_ancien_sans_le_champ_reste_accepte() -> None:
    body = OnboardingAnswers.model_validate({**_TEMPS_1, "user_id": "u-1"})

    assert body.business_units == []
