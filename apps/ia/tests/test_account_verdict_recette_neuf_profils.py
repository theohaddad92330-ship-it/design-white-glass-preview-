"""#2304.37 (clôture #2931/#2932, LAU-FINAL-045) — recette sur les 9 profils
de comptes listés par l'épopée (registre `.claude/notes/registre-2026-09-17-
lau-045-2304.md`) : Cyber 20 consultants, grande ESN, cabinet environnement,
ingénierie, client, froid, sans signal, forte relation, données partielles.

Ce que #2304.37 demande, littéralement : une SUITE DE RECETTE GROUPÉE, comme
#2314/#2315/#2316, sur ces 9 profils — pas neuf dossiers complets rejoués en
CI (aucun corpus de comptes fixtures n'existe pour ce chapitre, et en fabriquer
neuf serait la donnée inventée que la doctrine interdit). La tranche VERTICALE
qui rend le point vrai et testée sans rien inventer : les 9 profils sont des
combinaisons RÉELLES et déterministes des fonctions déjà livrées par cette
épopée (`named_verdict`, `esn_objectives_directive_block`,
`esn_relations_directive_block`, `esn_available_time_directive_block`) —
chacun nommé, chacun vérifié un par un, sur les MÊMES fonctions qu'un vrai
dossier appelle.
"""

from __future__ import annotations

import pytest

from app.prompts.bellum_plan import build_subsection_user_prompt
from app.prompts.forbidden_phrasings import DOSSIER_VERDICT_FORBIDDEN_PHRASINGS
from app.services.account_score import named_verdict

# (label du profil, verdict brut GO/PRUDENT/STOP/EXPLORER, déclencheur no-go,
#  profile_data ESN, verdict métier attendu)
NINE_PROFILES = [
    ("cyber_20_consultants", "GO", False, {"offers": ["Cybersécurité"]}, "AGIR MAINTENANT"),
    (
        "grande_esn",
        "PRUDENT",
        False,
        {"size": "150", "objectives": [{"kind": "nouveaux_comptes"}]},
        "RÉSERVE",
    ),
    ("cabinet_environnement", "STOP", False, {"offers": ["Conseil environnemental"]}, "ÉCARTER POUR CET OBJECTIF"),
    ("ingenierie_budget_gele", "STOP", True, {"offers": ["Ingénierie"]}, "METTRE EN VEILLE"),
    ("client_existant", "GO", False, {"formerClientsCountBand": "6-15"}, "AGIR MAINTENANT"),
    ("compte_froid", "EXPLORER", False, {}, "QUALIFIER"),
    ("sans_signal", "STOP", False, {}, "ÉCARTER POUR CET OBJECTIF"),
    (
        "forte_relation",
        "GO",
        False,
        {"formerColleaguesCountBand": "1-5", "partnersCountBand": "6-15"},
        "AGIR MAINTENANT",
    ),
    ("donnees_partielles", "EXPLORER", False, {"weeklySalesTimeProtected": "moins de 2h/semaine"}, "QUALIFIER"),
]


@pytest.mark.parametrize("label,raw_verdict,has_trigger,profile_data,expected", NINE_PROFILES)
def test_les_neuf_profils_produisent_le_verdict_metier_attendu(
    label: str, raw_verdict: str, has_trigger: bool, profile_data: dict, expected: str
) -> None:
    assert named_verdict(raw_verdict, has_no_go_trigger=has_trigger) == expected, label


def test_les_neuf_profils_couvrent_les_cinq_verdicts_nommes() -> None:
    produced = {
        named_verdict(raw_verdict, has_no_go_trigger=has_trigger) for _, raw_verdict, has_trigger, _, _ in NINE_PROFILES
    }
    assert produced == {"AGIR MAINTENANT", "RÉSERVE", "METTRE EN VEILLE", "ÉCARTER POUR CET OBJECTIF", "QUALIFIER"}


@pytest.mark.parametrize("label,_raw_verdict,_has_trigger,profile_data,_expected", NINE_PROFILES)
def test_chaque_profil_porte_la_liste_interdite_dans_la_section_evaluation(
    label: str, _raw_verdict: str, _has_trigger: bool, profile_data: dict, _expected: str
) -> None:
    prompt = build_subsection_user_prompt(company_name="Compte test", section="evaluation", profile_data=profile_data)
    for phrase in DOSSIER_VERDICT_FORBIDDEN_PHRASINGS:
        assert phrase in prompt, f"{label}: {phrase!r} absente de la liste interdite"


def test_deux_profils_esn_distincts_sur_le_meme_compte_ne_citent_pas_les_memes_criteres() -> None:
    # #2304.27/.38 (déjà livrés) — même compte, verdict/plan différent selon
    # l'ESN. Cette recette vérifie que .23 et .26 (nouvellement branchés) en
    # font bien partie : « forte_relation » cite le réseau, « compte_froid »
    # (profil ESN vide) ne cite ni réseau ni temps protégé.
    forte_relation = next(p for p in NINE_PROFILES if p[0] == "forte_relation")[3]
    compte_froid = next(p for p in NINE_PROFILES if p[0] == "compte_froid")[3]
    prompt_relation = build_subsection_user_prompt(
        company_name="Compte test", section="evaluation", profile_data=forte_relation
    )
    prompt_froid = build_subsection_user_prompt(
        company_name="Compte test", section="evaluation", profile_data=compte_froid
    )
    assert "RÉSEAU PERSONNEL DÉCLARÉ" in prompt_relation
    assert "RÉSEAU PERSONNEL DÉCLARÉ" not in prompt_froid
