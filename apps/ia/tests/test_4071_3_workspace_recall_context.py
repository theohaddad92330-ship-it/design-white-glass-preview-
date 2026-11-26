"""#4071.3 — Laura reçoit les recherches enregistrées, les listes de cibles et les conversations passées.

Golden qui sait dire NON : le bloc est daté, sans provenance, borné ; le prompt sans contexte reste
byte-identique ; le mode Neutre et l'exclusion stricte des données de l'espace le vident."""

from __future__ import annotations

import re

from app.models.chat import ChatRequest
from app.prompts.bellum_advisor import build_system_prompt
from app.services.context_mode import apply_context_mode
from app.services.workspace_recall_context import workspace_recall_context_block

RECALL = (
    "- [2026-10-12 · il y a 1 jour] Recherche enregistrée : ESN cyber IDF (objectif : trouver des cibles)\n"
    "- [2026-09-13 · il y a 30 jours] Liste de cibles : Campagne rentrée\n"
    "- [2026-07-01 · il y a 3 mois] Conversation passée : On a parlé de la stratégie Renault."
)

_PROVENANCE = re.compile(
    r"saved_views|target_lists|conversation_summaries|dataforge|mémoire marché|hubspot|salesforce|pipedrive|"
    r"apollo|pappers|firecrawl|brave",
    re.IGNORECASE,
)


def _prompt(**kwargs):
    return build_system_prompt({}, {}, "", "", **kwargs)


def test_sans_contexte_aucun_bloc():
    assert workspace_recall_context_block("") == ""
    assert workspace_recall_context_block(None) == ""
    assert workspace_recall_context_block("  \n ") == ""


def test_le_bloc_est_date_et_sans_provenance():
    block = workspace_recall_context_block(RECALL)
    assert "il y a 3 mois" in block
    assert "DATE tout élément ancien" in block
    assert _PROVENANCE.search(block) is None


def test_NON_le_bloc_interdit_de_nier_la_presence():
    """#4071.3 — recette R6 (14/10) : Laura ouvrait par « je ne retrouve pas de
    recherche enregistrée » puis en citait une juste après — la présence doit
    être connue AVANT la rédaction de la première phrase, jamais découverte en
    cours de réponse."""
    block = workspace_recall_context_block(RECALL)
    assert "ne commence jamais" in block.lower()
    assert "avant d'écrire ta première phrase" in block.lower()


def test_NON_le_bloc_est_borne():
    assert len(workspace_recall_context_block("- x\n" * 5000)) < 5000


def test_le_prompt_porte_le_bloc_et_reste_identique_sans_lui():
    with_recall = _prompt(workspace_recall_context=RECALL)
    without = _prompt()
    assert workspace_recall_context_block(RECALL) in with_recall
    assert with_recall.replace(workspace_recall_context_block(RECALL), "") == without
    assert without == _prompt(workspace_recall_context="")
    assert "CE QUE L'ESPACE A GARDÉ" not in without


def test_NON_le_mode_neutre_ne_recoit_rien():
    req = ChatRequest(message="bonjour", user_id="u", context_mode="neutral", workspace_recall_context=RECALL)
    narrowed, _ = apply_context_mode(req)
    assert narrowed.workspace_recall_context == ""


def test_NON_l_exclusion_stricte_ne_recoit_rien():
    req = ChatRequest(message="bonjour", user_id="u", exclude_workspace_data=True, workspace_recall_context=RECALL)
    narrowed, _ = apply_context_mode(req)
    assert narrowed.workspace_recall_context == ""


def test_NON_un_souvenir_de_demande_ne_remplace_jamais_le_travail():
    """#5180 — recette R3 (02/11) : sur « donne-moi les comptes les plus faciles… », Laura répondait
    « J'ai repris le fil : la dernière demande concernant… » (un souvenir de conversation passée), sans
    appel d'outil ni carte. Reconnaître une demande déjà vue est permis ; la réponse PORTE LE RÉSULTAT."""
    block = workspace_recall_context_block(RECALL).lower()
    assert "même demande" in block
    assert "refais le travail" in block
    assert "jamais un renvoi seul" in block
