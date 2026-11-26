"""#2304.22 / .25 (épopée #2932, LAU-FINAL-045) — deux critères de
personnalisation absents de `why_for_your_esn` : le MODÈLE de l'ESN et ses
OBJECTIFS commerciaux actifs (`esn_objectives`, #2052).

Le modèle (`staffingModel`) est DÉJÀ injecté au system prompt (§PROFIL ESN) —
il manquait seulement à la LISTE de ce que `why_for_your_esn` doit citer. Les
objectifs sont DÉJÀ dérivés par `scoring_objectives` (`dossier_read.py`,
#2306.16, qui les CONSERVE sur le bloc une fois le score posé) — il manquait
le chaînon qui les REND AU PROMPT pour qu'ils pèsent sur la lecture, pas
seulement sur son archivage a posteriori.

Trois choses à défendre, comme pour `seller_scope_directive_block` :
1. sans objectifs déclarés, le bloc est vide — comportement inchangé ;
2. avec, le bloc les NOMME et demande à `why_for_your_esn` de les citer ;
3. `staffingModel` fait partie de la liste explicite de citation, aux côtés
   des critères déjà présents.
"""

from __future__ import annotations

from app.prompts.bellum_plan import (
    build_subsection_user_prompt,
    esn_available_time_directive_block,
    esn_objectives_directive_block,
    esn_relations_directive_block,
)


def test_sans_objectifs_declares_le_bloc_est_vide() -> None:
    assert esn_objectives_directive_block(None) == ""
    assert esn_objectives_directive_block({}) == ""
    assert esn_objectives_directive_block({"objectives": []}) == ""
    assert esn_objectives_directive_block({"objectives": [{"other": "x"}]}) == ""


def test_avec_des_objectifs_le_bloc_les_nomme_et_demande_de_les_citer() -> None:
    block = esn_objectives_directive_block(
        {"objectives": [{"kind": "structuration_portefeuille"}, {"kind": "nouveaux_comptes"}]}
    )
    assert "structuration_portefeuille" in block
    assert "nouveaux_comptes" in block
    assert "why_for_your_esn" in block


def test_sans_objectifs_la_section_evaluation_reste_byte_identique() -> None:
    bare = build_subsection_user_prompt(company_name="Thales", section="evaluation", profile_data={"offers": ["Data"]})
    none = build_subsection_user_prompt(company_name="Thales", section="evaluation", profile_data=None)
    assert bare == none


def test_avec_des_objectifs_la_section_evaluation_les_porte() -> None:
    prompt = build_subsection_user_prompt(
        company_name="Thales",
        section="evaluation",
        profile_data={"objectives": [{"kind": "structuration_portefeuille"}]},
    )
    assert "structuration_portefeuille" in prompt


def test_une_section_hors_evaluation_ne_porte_jamais_les_objectifs() -> None:
    prompt = build_subsection_user_prompt(
        company_name="Thales", section="quick_wins", profile_data={"objectives": [{"kind": "nouveaux_comptes"}]}
    )
    assert "nouveaux_comptes" not in prompt


# #2304.22 — le MODÈLE de l'ESN (staffingModel) fait DÉJÀ partie du system
# prompt (§PROFIL ESN) : ce test verrouille qu'il rejoint la LISTE de ce que
# why_for_your_esn doit citer, aux côtés des critères déjà présents.
def test_le_prompt_demande_de_citer_le_modele_de_l_esn() -> None:
    prompt = build_subsection_user_prompt(company_name="Thales", section="evaluation", profile_data=None)
    citation_line = prompt.split("why_for_your_esn : pourquoi")[1].split("\n")[0]
    assert "modèle" in citation_line


# #2304.23 (clôture #2931/#2932) — le RÉSEAU personnel déclaré (#2045) était
# en base et lu par bellum_profiler.py, jamais mappé vers CE profil : un
# branchement absent (`esnAnswersToProfileData`, analysis.ts), pas une donnée
# à collecter.
def test_sans_reseau_declare_le_bloc_relations_est_vide() -> None:
    assert esn_relations_directive_block(None) == ""
    assert esn_relations_directive_block({}) == ""


def test_avec_un_reseau_declare_le_bloc_le_nomme_et_demande_de_le_citer() -> None:
    block = esn_relations_directive_block({"formerClientsCountBand": "6-15", "partnersCountBand": "1-5"})
    assert "6-15" in block
    assert "1-5" in block
    assert "why_for_your_esn" in block
    # Une bande NON déclarée ne fuit pas dans le bloc.
    assert "anciens collègues" not in block


def test_avec_un_reseau_declare_la_section_evaluation_le_porte() -> None:
    prompt = build_subsection_user_prompt(
        company_name="Thales",
        section="evaluation",
        profile_data={"formerClientsCountBand": "6-15"},
    )
    assert "6-15" in prompt


def test_une_section_hors_evaluation_ne_porte_jamais_le_reseau() -> None:
    prompt = build_subsection_user_prompt(
        company_name="Thales", section="quick_wins", profile_data={"formerClientsCountBand": "6-15"}
    )
    assert "6-15" not in prompt


# #2304.26 (clôture #2931/#2932) — même branchement absent pour le temps
# hebdomadaire PROTÉGÉ (`weekly_sales_time_protected`, #2050).
def test_sans_temps_declare_le_bloc_temps_est_vide() -> None:
    assert esn_available_time_directive_block(None) == ""
    assert esn_available_time_directive_block({}) == ""


def test_avec_un_temps_declare_le_bloc_le_nomme() -> None:
    block = esn_available_time_directive_block({"weeklySalesTimeProtected": "2 à 5 heures par semaine"})
    assert "2 à 5 heures par semaine" in block
    assert "why_for_your_esn" in block


def test_avec_un_temps_declare_la_section_evaluation_le_porte() -> None:
    prompt = build_subsection_user_prompt(
        company_name="Thales",
        section="evaluation",
        profile_data={"weeklySalesTimeProtected": "2 à 5 heures par semaine"},
    )
    assert "2 à 5 heures par semaine" in prompt
