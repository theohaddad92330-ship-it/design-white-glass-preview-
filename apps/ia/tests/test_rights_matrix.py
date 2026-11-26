"""Tests de `app/access/rights_matrix.py` (#2445.4, #2766).

Preuves attendues : (1) le module DÉFINIT bien la classification — extraite de
`tests/copilote_scenario_metadata.py` et `tests/test_copilote_security_eval.py`
sans en changer le contenu ; (2) les huit fichiers qui l'importaient encore
ré-exportent les mêmes noms, sans un seul import cassé ; (3) du code de
PRODUCTION la lit désormais réellement (`chat_orchestrator._is_read_only_tool`)
— le défaut « du code juste que personne n'appelle » que #2899/#2766 nomment
tous les deux.
"""

from __future__ import annotations

from app.access.rights_matrix import (
    ANCIENNETE_DU_NOUVEL_ARRIVANT,
    FAMILLE_PAR_ROLE,
    READ_ONLY_TOOLS,
    SPENDING_TOOLS,
    TOUTES_LES_FAMILLES,
    Famille,
    Permission,
    is_spending_tool,
    permission_de,
)
from app.services import chat_tools
from app.services.chat_orchestrator import _is_read_only_tool


def test_famille_has_exactly_five_values():
    assert set(Famille) == {
        Famille.BUSINESS_MANAGER,
        Famille.RECRUTEUR,
        Famille.DIRECTEUR_AGENCE,
        Famille.DIRIGEANT,
        Famille.NOUVEL_ARRIVANT,
    }
    assert frozenset(Famille) == TOUTES_LES_FAMILLES


def test_famille_par_role_maps_every_value_to_a_real_famille():
    assert FAMILLE_PAR_ROLE, "la table ne doit pas être vide"
    for role, famille in FAMILLE_PAR_ROLE.items():
        assert isinstance(role, str) and role
        assert famille in Famille


def test_anciennete_du_nouvel_arrivant_is_a_named_string():
    assert ANCIENNETE_DU_NOUVEL_ARRIVANT == "Moins de 3 mois"


def test_permission_has_exactly_four_values():
    assert set(Permission) == {
        Permission.CONVERSATION,
        Permission.LECTURE,
        Permission.PROPOSITION,
        Permission.DEPENSE,
    }


def test_permission_de_none_is_conversation():
    assert permission_de(None) == Permission.CONVERSATION


def test_permission_de_a_read_only_tool_is_lecture():
    exemple = next(iter(READ_ONLY_TOOLS))
    assert permission_de(exemple) == Permission.LECTURE


def test_permission_de_a_spending_tool_is_depense():
    for outil in SPENDING_TOOLS:
        assert permission_de(outil) == Permission.DEPENSE


def test_permission_de_an_unclassified_tool_is_proposition():
    outil = next(
        str(tool["name"])
        for tool in chat_tools.CHAT_TOOLS
        if str(tool["name"]) not in READ_ONLY_TOOLS and str(tool["name"]) not in SPENDING_TOOLS
    )
    assert permission_de(outil) == Permission.PROPOSITION


def test_read_only_and_spending_are_disjoint():
    assert not (READ_ONLY_TOOLS & SPENDING_TOOLS)


def test_spending_tools_is_exactly_the_one_named_exception():
    """#1489 — l'exception est nommée, et elle est unique."""
    # #4462.1 (décision Louis 22/10) — la seconde, nommée : une liste par la même porte.
    assert frozenset({"start_account_analysis", "analyze_named_companies"}) == SPENDING_TOOLS


def test_is_spending_tool_matches_spending_tools():
    for outil in SPENDING_TOOLS:
        assert is_spending_tool(outil) is True
    exemple_lecture = next(iter(READ_ONLY_TOOLS))
    assert is_spending_tool(exemple_lecture) is False


def test_every_read_only_tool_is_declared_in_the_registry():
    """Aucun nom fantôme : chaque outil classé LECTURE existe réellement."""
    declared = {str(tool["name"]) for tool in chat_tools.CHAT_TOOLS}
    ghosts = READ_ONLY_TOOLS - declared
    assert not ghosts, f"READ_ONLY_TOOLS cite des outils absents du registre : {sorted(ghosts)}"


# ── #2445.4 — LE PREMIER APPELANT RÉEL DE PRODUCTION ─────────────────────────


def test_no_spending_tool_is_ever_treated_as_read_only_for_concurrency():
    """`chat_orchestrator._is_read_only_tool` (le lot concurrent d'outils) ne
    doit JAMAIS traiter un outil de DÉPENSE comme lisible-en-lot — c'est le
    filet dérivé de la MÊME classification que le gate de sécurité, câblé en
    production (#2445.4)."""
    for outil in SPENDING_TOOLS:
        assert _is_read_only_tool(outil) is False


def test_a_plain_read_only_tool_is_still_read_only_for_concurrency():
    """Non-régression : le câblage n'a pas durci un outil de LECTURE qui ne
    l'était pas avant."""
    exemple = next(iter(READ_ONLY_TOOLS))
    assert _is_read_only_tool(exemple) is True
