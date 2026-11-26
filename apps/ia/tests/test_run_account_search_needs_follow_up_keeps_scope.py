"""#3704.2 — recette prod 07/10 (8d7c6957f0) RÉFUTÉE : après « trouve-moi cinq nouvelles
entreprises du luxe en Île-de-France », la relance « donne-moi aussi des besoins » faisait
repartir Laura sur le PORTEFEUILLE (LVMH, AIRBUS, SNCF Réseau) — les cinq cibles neuves
trouvées par le tour d'horizon précédent étaient oubliées.

``run_account_search`` sait déjà, outil par outil (#3704.6, lot F20), rendre les demandes
actuelles connues SANS jamais filtrer une entreprise (``current_demands`` /
``signals_not_applied``). Ce qui manquait : dire au modèle que CETTE relance reste CE MÊME
tour d'horizon (``refine: true``) — jamais un nouvel appel à un outil qui lit le
PORTEFEUILLE (``get_portfolio_priorities``, ``search_workspace_accounts``), qui n'a par
construction aucune connaissance d'une entreprise qui n'y est pas encore.

Pas d'appel de modèle possible ici (aucun test du dépôt n'en fait) : la garde est la
description de l'outil lui-même, le seul levier déjà éprouvé par les lots précédents
(#3704, #3706…) pour ce genre de confusion d'outil.
"""

from __future__ import annotations

from app.services.chat_tools import CHAT_TOOLS


def _tool(name: str) -> dict:
    return next(t for t in CHAT_TOOLS if t["name"] == name)


def test_run_account_search_says_a_needs_follow_up_stays_the_same_refine() -> None:
    description = _tool("run_account_search")["description"]
    assert "donne-moi aussi des besoins" in description
    assert "refine" in description
    assert "get_portfolio_priorities" in description
    assert "search_workspace_accounts" in description


def test_portfolio_priorities_disclaims_being_the_answer_to_a_needs_follow_up() -> None:
    description = _tool("get_portfolio_priorities")["description"]
    assert "run_account_search" in description, "doit renvoyer vers le bon outil, jamais rester muet"


def test_search_workspace_accounts_disclaims_being_the_answer_to_a_needs_follow_up() -> None:
    description = _tool("search_workspace_accounts")["description"]
    # Le garde-fou #3704 existant (« ce n'est PAS la réponse à N NOUVELLES entreprises »)
    # doit couvrir AUSSI la relance « besoins » sur ces mêmes cibles, pas seulement la
    # première demande.
    assert "besoins" in description
