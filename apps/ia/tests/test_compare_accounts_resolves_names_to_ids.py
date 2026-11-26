"""#3763 — recette prod 08/10 (W 5b4b10d2f3) : « compare-moi Sanofi et Société
Générale » sort en réponse TEXTE SEULE, aucune carte `comparison` détectée.

Cause nommée (`compare_accounts` exige des `account_ids`, des UUID — jamais ce
qu'un utilisateur tape). Son input_schema le dit déjà (« Les identifiants
(UUID) des comptes à comparer »), mais sa DESCRIPTION ne disait nulle part
comment les obtenir à partir des noms d'entreprise que la personne tape
réellement (« Sanofi », « Société Générale ») : sans ce pont, un modèle qui
n'a pas déjà ces UUID dans le fil n'a aucun chemin DÉCRIT vers `compare_accounts`
et retombe sur une comparaison en prose, depuis sa connaissance générale —
exactement le défaut que l'épopée #2778 avait déjà réglé une fois (voir
`test_chat_compare_accounts_tool.py`), mais pour la carte, pas pour la
résolution des noms.

`search_workspace_accounts` résout déjà un nom vers un compte du portefeuille
et son pont (`CopilotAccountsSearchController.search`) rend bien
`account_id: account.id` par ligne (`copilot-accounts-search.controller.ts:101`)
— la donnée existe, seule la description ne la nommait pas, donc le modèle
n'avait aucune raison de s'y fier pour la réutiliser dans `compare_accounts`.
"""

from __future__ import annotations

from app.services.chat_tools import CHAT_TOOLS


def _tool(name: str) -> dict:
    return next(t for t in CHAT_TOOLS if t["name"] == name)


def test_compare_accounts_describes_how_to_resolve_names_to_ids() -> None:
    description = _tool("compare_accounts")["description"]
    assert "search_workspace_accounts" in description
    assert "account_id" in description


def test_search_workspace_accounts_names_account_id_as_a_rendered_field() -> None:
    description = _tool("search_workspace_accounts")["description"]
    assert "account_id" in description
