"""#2032.10 / #2036.9 — les fonctions réellement exercées et l'ambition
territoriale déclarée atteignent le prompt du profiler.

Même défaut n°1 que #2007 et le lot L15 : une question posée à l'utilisateur
sans lecteur dans le modèle est du travail payé et jamais lu. Même garde à
trois preuves que `test_profiler_prompt_maturity_effectif.py`.

⚠️ Un TROISIÈME test, spécifique à ce lot : `growth_target_zones` ne doit
JAMAIS produire le même libellé que `geo_zones` dans le prompt — la doctrine
#2036.10 exige que le modèle reçoive les deux états SÉPARÉMENT nommés, jamais
une zone souhaitée confondue avec une zone où le vendeur intervient déjà.
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
    "geo_zones": ["Paris & Île-de-France"],
    "main_sales_pain": "Gérer mon temps",
}

_CHAMPS_NEUFS: dict[str, list[str]] = {
    "role_functions_practiced": ["Vente / prospection", "Management / direction"],
    "growth_target_zones": ["Lyon & Auvergne-Rhône-Alpes"],
}


def test_le_corpus_nest_pas_vide() -> None:
    """Preuve n°2 — cette garde LIT quelque chose."""

    assert len(_CHAMPS_NEUFS) == 2


def test_chaque_champ_neuf_atteint_le_prompt_utilisateur() -> None:
    prompt = build_profiler_user_prompt({**_TEMPS_1, **_CHAMPS_NEUFS})

    absents = [cle for cle in _CHAMPS_NEUFS if cle not in prompt]
    assert absents == [], f"champs qui n'atteignent pas le prompt : {absents}"


def test_chaque_valeur_neuve_atteint_le_prompt_utilisateur() -> None:
    prompt = build_profiler_user_prompt({**_TEMPS_1, **_CHAMPS_NEUFS})

    manquantes = [
        f"{cle}={item!r}" for cle, valeurs in _CHAMPS_NEUFS.items() for item in valeurs if item not in prompt
    ]
    assert manquantes == [], f"valeurs perdues avant le modèle : {manquantes}"


def test_un_payload_temps1_seul_reste_a_loctet_pres_celui_davant() -> None:
    """Preuve n°3 — la garde n'attrape pas ce qu'elle ne vise pas."""

    prompt = build_profiler_user_prompt(_TEMPS_1)

    fuites = [cle for cle in _CHAMPS_NEUFS if cle in prompt]
    assert fuites == [], f"champs annoncés alors qu'ils sont absents du payload : {fuites}"


def test_la_garde_sait_dire_non() -> None:
    """Preuve n°1 — retirer un champ du rendu doit faire rougir le test du
    dessus."""

    sans_zones = {k: v for k, v in {**_TEMPS_1, **_CHAMPS_NEUFS}.items() if k != "growth_target_zones"}
    prompt = build_profiler_user_prompt(sans_zones)

    assert "growth_target_zones" not in prompt
    assert "Lyon & Auvergne-Rhône-Alpes" not in prompt


def test_2036_10_geo_zones_et_growth_target_zones_ont_deux_libelles_distincts() -> None:
    """#2036.10 — la zone SOUHAITÉE ne se lit jamais comme une zone COUVERTE :
    le prompt doit nommer les deux sections séparément, jamais sous le même
    libellé."""

    prompt = build_profiler_user_prompt(
        {
            **_TEMPS_1,
            "geo_zones": ["Paris & Île-de-France"],
            "growth_target_zones": ["Lyon & Auvergne-Rhône-Alpes"],
        }
    )

    # Les deux valeurs arrivent, sous deux libellés de champ distincts —
    # jamais la même clé `- geo_zones :` portant les deux listes fusionnées.
    assert "- geo_zones : Paris & Île-de-France" in prompt
    assert "- growth_target_zones : Lyon & Auvergne-Rhône-Alpes" in prompt
    assert "souhaitée" in prompt.lower()
