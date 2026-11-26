"""#2372.9 — la suite NOMMÉE des dix scénarios de recette du DoD LAU-FINAL-087
(« couvrir dix scénarios de recette : compte froid, C-level, LinkedIn… »).

La couverture existait déjà — RÉELLE, mesurée — mais ÉCLATÉE entre
``test_message.py`` (23 tests) et ``test_icebreaker_router.py`` (5 tests) :
aucun fichier ne listait les dix scénarios du DoD COMME TELS. Ce module ne
reconstruit pas le pipeline (déjà testé ailleurs, ce serait dupliquer la
logique) : il DÉLÈGUE à la fonction de test existante pour chaque scénario,
sous un nom qui documente le scénario du DoD. Si un import casse ou qu'un
scénario disparaît, cette suite le dit immédiatement — c'est tout son travail.

Registre : ``.claude/notes/registre-2026-09-20-chat-lot4.md`` ligne #2372.9.
"""

from __future__ import annotations

from fastapi.testclient import TestClient

from tests.test_icebreaker_router import (
    test_icebreaker_generate_422_insufficient_context_when_nothing_to_hook_on as _scenario_insufficient_context,
)
from tests.test_message import (
    test_2123_72_task_channel_returns_a_task_title_and_body as _scenario_task_channel,
    test_a_claim_grounded_in_the_account_analysis_is_accepted as _scenario_claim_grounded,
    test_a_claim_without_a_matching_proof_in_the_packet_is_a_no_go as _scenario_claim_without_proof,
    test_a_generic_draft_is_flagged_and_returned_without_a_second_call as _scenario_generic_draft_flagged,
    test_composer_prompt_adds_no_block_on_a_cold_account as _scenario_compte_froid,
    test_composer_prompt_reads_the_account_relationship as _scenario_compte_chaud,
    test_message_generate_email_returns_subject_and_body as _scenario_canal_email,
    test_message_generate_linkedin_drops_subject as _scenario_canal_linkedin,
    test_the_router_reads_the_hierarchy_level_column as _scenario_c_level_hierarchy,
)

# Les deux affirmées mais NON déléguées ici sont déjà nommées ailleurs par leur
# propre suite dédiée (elles ne manquent pas, elles ont juste déjà un nom) :
# claim ancrée/sans preuve — importées ci-dessus comme scénarios 9 et 10.


def test_dod_scenario_01_canal_email(client: TestClient) -> None:
    """Premier contact par e-mail : sujet + corps rendus."""
    _scenario_canal_email(client)


def test_dod_scenario_02_canal_linkedin(client: TestClient) -> None:
    """Canal LinkedIn : pas de sujet, pas de rendez-vous forcé (#2372.5)."""
    _scenario_canal_linkedin(client)


def test_dod_scenario_03_canal_tache(client: TestClient) -> None:
    """Canal tâche (#2123.72) : titre + corps de tâche, règles isolées des autres canaux."""
    _scenario_task_channel(client)


def test_dod_scenario_04_persona_c_level() -> None:
    """Persona C-level dérivé de ``hierarchy_level`` (issu de la phase 3), pas du seul titre."""
    _scenario_c_level_hierarchy()


def test_dod_scenario_05_compte_froid() -> None:
    """Compte froid : aucun bloc « RELATION AU COMPTE » ajouté au prompt."""
    _scenario_compte_froid()


def test_dod_scenario_06_compte_chaud_relation_active() -> None:
    """Compte chaud (relation active) : le SalesContext persisté oriente le prompt."""
    _scenario_compte_chaud()


def test_dod_scenario_07_contexte_insuffisant_refuse_avant_le_modele(client: TestClient) -> None:
    """Contact sans poste ni signal récent : refus NOMMÉ (422 insufficient_context) AVANT tout appel modèle."""
    _scenario_insufficient_context(client)


def test_dod_scenario_08_brouillon_generique_signale(client: TestClient) -> None:
    """Brouillon générique : rendu quand même, avec son verdict (pas de régénération silencieuse)."""
    _scenario_generic_draft_flagged(client)


def test_dod_scenario_09_affirmation_sans_preuve_est_un_no_go(client: TestClient) -> None:
    """Affirmation sans preuve correspondante dans le packet : bloquée (422 NO-GO)."""
    _scenario_claim_without_proof(client)


def test_dod_scenario_10_affirmation_ancree_est_acceptee(client: TestClient) -> None:
    """Affirmation ancrée dans ``raw_analysis`` du compte : acceptée telle quelle."""
    _scenario_claim_grounded(client)
