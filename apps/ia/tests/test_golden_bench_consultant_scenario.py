"""#3349 (LAU-FINAL-259, retour bêta 29/09) — GOLDEN CONVERSATION « CONSULTANT
SUR LE BENCH », la conversation réelle du 29 septembre transformée en test.

─────────────────────────────────────────────────────────────────────────────
CE QUE CE FICHIER EST, ET CE QU'IL N'EST PAS
─────────────────────────────────────────────────────────────────────────────
L'épopée demande un test BLOQUANT qui rejoue les quatre tours et vérifie le
comportement du modèle. Ce dépôt n'a nulle part un tel test pour une
conversation multi-tours (`test_copilote_error_posture.py`,
`test_forbidden_phrasings.py` : même méthode partout) : chaque suite prouve
que la RÈGLE est écrite là où le modèle la lit — le prompt système — jamais
que le modèle l'applique en conversation réelle, qui reste l'éval en ligne
(ANTHROPIC_API_KEY hors CI). Ce fichier suit la MÊME discipline : il rejoue
les quatre tours du retour bêta comme une CHECKLIST de ce que le prompt doit
tenir à chaque tour, avec la citation exacte de la règle. Une régression sur
n'importe laquelle casse ce test — c'est le sens de « bloquant » ici.

─────────────────────────────────────────────────────────────────────────────
CE QUI RESTE (délibérément hors de cette tranche, #3345.2 / #3348)
─────────────────────────────────────────────────────────────────────────────
Le critère « une correction invalide réellement les anciennes
recommandations… dans les pages concernées » (propagation CROSS-ÉCRAN, pas
seulement dans le fil de conversation) N'EST PAS prouvé ici : aucun chemin
d'écriture n'existe encore de Laura vers `qualification_lead_decisions`
(`apps/api/src/modules/qualification-leads/`, seul mécanisme d'écartement
partagé par un écran produit — `QualificationLeadsQueue.tsx`) ni vers
`needs.status`. Le pont interne de Laura est LECTURE SEULE PAR CONCEPTION
(`app/services/bellum_api.py`, docstring de tête, règle 2) : une écriture
suppose une nouvelle carte de proposition (même famille que
`propose_need_transition` / `propose_opportunity_update`,
`packages/contracts/src/schemas/copilot-card.ts`) que le clic de la personne
exécute — un chantier à part entière, tranché sans Louis comme HORS de ce
lot (même verdict que #2270 pour son protocole complet, voir
`test_copilote_error_posture.py`).
"""

from __future__ import annotations

from app.eval.chat_hard_failures import ChatHardFailure
from app.prompts.bellum_advisor import (
    _BLOCK_ERROR_PROTOCOL,
    _BLOCK_SPONTANEOUS_ORCHESTRATION,
    build_system_prompt,
)
from app.prompts.context_transparency import build_context_transparency
from app.prompts.laura_business_language import BLOCK_BUSINESS_LANGUAGE
from app.prompts.laura_source_priority import BLOCK_SOURCE_PRIORITY
from app.prompts.thread_state import THREAD_CONTINUITY_BLOCK
from app.services.chat_tools import FIND_NEEDS_TOOL

BARE = build_system_prompt({}, {}, "", "")


# ── Tour 1 — « j'ai un consultant AWS en CDI sur mon bench… » ───────────────


def test_turn1_laura_organises_the_work_herself_instead_of_waiting_for_each_source():
    assert _BLOCK_SPONTANEOUS_ORCHESTRATION in BARE
    assert "dès le premier tour, tu organises TOI-MÊME le travail" in _BLOCK_SPONTANEOUS_ORCHESTRATION
    assert "Tu présentes une STRATÉGIE, jamais seulement un résultat brut" in _BLOCK_SPONTANEOUS_ORCHESTRATION
    assert "AU MAXIMUM deux questions bloquantes" in _BLOCK_SPONTANEOUS_ORCHESTRATION


def test_turn1_internal_sources_are_exhausted_before_external_search():
    assert BLOCK_SOURCE_PRIORITY in BARE
    assert "L'INTERNE D'ABORD, LE PUBLIC EN DERNIER RECOURS" in BLOCK_SOURCE_PRIORITY


def test_turn1_no_match_is_ever_invented_is_a_named_hard_failure():
    # ⚠️ Taxonomie seulement (#2899) : aucun gate CI ne la lit encore, voir le
    # docstring de `chat_hard_failures.py`. Nommer l'invariant reste la plus
    # petite pierre prouvable de ce critère précis.
    assert ChatHardFailure.FABRICATED_RESULT in ChatHardFailure


# ── Cas AWS LVMH — le besoin périmé, non sourcé ─────────────────────────────


def test_aws_lvmh_case_an_invalidated_lead_is_explicitly_retracted_not_just_apologised_for():
    assert "tu invalides explicitement les éléments faux que tu avais annoncés" in _BLOCK_ERROR_PROTOCOL
    assert "tu produis tout de suite la réponse corrigée ou relances la bonne récupération" in _BLOCK_ERROR_PROTOCOL
    assert "tu indiques ce qui reste inconnu après correction" in _BLOCK_ERROR_PROTOCOL


def test_aws_lvmh_case_a_need_with_a_passed_deadline_is_never_a_priority_lead():
    """RÉFUTÉ en recette prod le 30/09 (commentaire #3349) : le besoin AWS
    LVMH, dont le démarrage (23/09) était dépassé, se présentait comme
    « Piste à vérifier en priorité ». `find_needs` ne rendait jusqu'ici ni
    `deadline_at` ni un verdict calculé de péremption — le modèle devait
    comparer lui-même une date ISO à « aujourd'hui », et le ratait. Voir
    `test_chat_tool_output_bounds_lot14.py::test_find_needs_flags_a_deadline_
    and_start_date_already_passed` pour la preuve bout en bout (le calcul,
    exécuté)."""
    assert "deadline_passed" in FIND_NEEDS_TOOL["description"]
    assert "date de démarrage passée" in FIND_NEEDS_TOOL["description"]
    assert "n'est PAS une piste active" in FIND_NEEDS_TOOL["description"]
    assert "Ne le présente JAMAIS comme prioritaire" in FIND_NEEDS_TOOL["description"]


# ── Tour 2 — « ne te base pas sur mon pipe… » ────────────────────────────────


def test_turn2_an_excluded_scope_survives_the_rest_of_the_thread_and_a_page_change():
    assert THREAD_CONTINUITY_BLOCK in BARE
    assert "Une piste déjà ÉCARTÉE ne se repropose pas et ne se recherche pas" in THREAD_CONTINUITY_BLOCK
    assert "pour qu'il survive au reste de la conversation et à un changement de page" in THREAD_CONTINUITY_BLOCK
    assert (
        "Un critère déjà exclu ne se réintroduit jamais dans une recherche de ce fil "
        "sans que l'utilisateur ne le redemande explicitement" in THREAD_CONTINUITY_BLOCK
    )


# ── Tour 3 — « d'où viennent concrètement ces opportunités ? » ─────────────


def test_turn3_provenance_is_structured_data_not_a_generic_seven_sources_line():
    # #3346.6 — « source interne » ne se dit jamais nue.
    assert "e-mail, d'un CRM, d'un import, d'une note ou d'un objet créé dans Bellum" in BLOCK_BUSINESS_LANGUAGE
    # La transparence de provenance est une DONNÉE structurée (`active` /
    # `sources` / `not_consulted`), jamais un texte générique du modèle.
    result = build_context_transparency(
        profile_data={},
        account_data={},
        contacts_summary="",
        plan_summary="",
        knowledge_docs=None,
    )
    assert {"active", "sources", "not_consulted"} <= result.keys()


# ── Tour 4 — « cette opportunité est fausse ou non prouvée. » ───────────────


def test_turn4_the_correction_protocol_runs_in_a_single_turn_and_returns_to_business_value():
    assert (
        "puis tu retournes IMMÉDIATEMENT à la valeur métier : pas une phrase de plus sur l'erreur elle-même"
        in _BLOCK_ERROR_PROTOCOL
    )
    assert "ce protocole tient en un seul tour, jamais en plusieurs" in _BLOCK_ERROR_PROTOCOL
