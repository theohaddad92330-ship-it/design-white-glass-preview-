"""#2034.14 / #2025.2 — la maturité déclarée et l'effectif réel atteignent le
prompt du profiler.

Lot L15 (#2034, #2035) a ajouté sept colonnes `esn_profiles` (migration
`1794010000000-MaturiteEffectifReel`) et leurs questions
(`apps/web/src/features/onboarding/lib/questions/maturite.ts`,
`.../effectif-reel.ts`) — mais comme #2007 avant elles, rien ne les lisait
côté modèle : une entreprise « en création » et une ESN de 500 recevaient le
même prompt dès lors que `consultant_size` seul ne suffisait pas à les
distinguer. `#2025.2` (« une question existe si sa réponse est LUE quelque
part ») exige que chaque clé de `questions/*.ts` ait un lecteur ; celui-ci en
est un.

Même garde à trois preuves que `test_profiler_prompt_extended_answers.py`
(#2007) : la garde LIT quelque chose, elle sait dire NON, elle n'attrape pas
ce qu'elle ne vise pas (un payload Temps-1 seul reste inchangé).
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

#: Les sept champs du lot L15 (#2034 maturité, #2035 effectif réel), chacun
#: associé à une valeur RECONNAISSABLE.
_CHAMPS_L15: dict[str, str] = {
    "esn_maturity_situation": "Activité en création",
    "company_growth_goal": "Ouvrir un nouveau territoire",
    "active_clients_band": "1 à 5 clients actifs",
    "revenue_recurrence": "Essentiellement du one-shot (mission ponctuelle, projet unique)",
    "client_concentration_risk": "Je ne sais pas encore",
    "consultants_managed_by_user_band": "6 à 15 consultants",
    "available_consultants_band": "Beaucoup de disponibilité, fort intercontrat",
}


def test_le_corpus_nest_pas_vide() -> None:
    """Preuve n°2 — cette garde LIT quelque chose."""

    assert len(_CHAMPS_L15) == 7


def test_chaque_champ_l15_atteint_le_prompt_utilisateur() -> None:
    prompt = build_profiler_user_prompt({**_TEMPS_1, **_CHAMPS_L15})

    absents = [cle for cle in _CHAMPS_L15 if cle not in prompt]
    assert absents == [], f"champs L15 qui n'atteignent pas le prompt : {absents}"


def test_chaque_valeur_l15_atteint_le_prompt_utilisateur() -> None:
    prompt = build_profiler_user_prompt({**_TEMPS_1, **_CHAMPS_L15})

    manquantes = [f"{cle}={valeur!r}" for cle, valeur in _CHAMPS_L15.items() if valeur not in prompt]
    assert manquantes == [], f"valeurs L15 perdues avant le modèle : {manquantes}"


def test_un_payload_temps1_seul_reste_a_loctet_pres_celui_davant() -> None:
    """Preuve n°3 — la garde n'attrape pas ce qu'elle ne vise pas : un espace
    qui n'a répondu qu'au Temps 1 ne voit aucun des sept libellés."""

    prompt = build_profiler_user_prompt(_TEMPS_1)

    fuites = [cle for cle in _CHAMPS_L15 if cle in prompt]
    assert fuites == [], f"champs L15 annoncés alors qu'ils sont absents du payload : {fuites}"


def test_la_garde_sait_dire_non() -> None:
    """Preuve n°1 — retirer un champ du rendu doit faire rougir le test du
    dessus."""

    sans_maturite = {k: v for k, v in {**_TEMPS_1, **_CHAMPS_L15}.items() if k != "esn_maturity_situation"}
    prompt = build_profiler_user_prompt(sans_maturite)

    assert "esn_maturity_situation" not in prompt
    assert "Activité en création" not in prompt


def test_les_deux_profils_esn_maturity_produisent_deux_prompts_differents() -> None:
    """#2034.14 — « une entreprise en création n'a pas le même audit qu'une
    ESN de 500 » : deux situations déclarées différentes doivent produire
    deux prompts différents, pas seulement deux `consultant_size`."""

    profil_creation = {**_TEMPS_1, "esn_maturity_situation": "Activité en création"}
    profil_grande_esn = {**_TEMPS_1, "esn_maturity_situation": "Croissance"}

    assert build_profiler_user_prompt(profil_creation) != build_profiler_user_prompt(profil_grande_esn)
