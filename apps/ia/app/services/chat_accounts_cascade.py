"""#3905.5/.6 (décision Louis 18/10) — « des comptes dans <secteur/zone> » : recherche en CASCADE.

1) les comptes de l'espace (``search_workspace_accounts``, gratuit) ; 2) les API branchées (``find_accounts``
prépare la recherche sur Découvrir, ``run_account_search`` la mène) ; 3) EN DERNIER RECOURS seulement, la
collecte web. Jamais une recherche web en premier : tant qu'une marche plus haute n'a pas été tentée,
``web_search`` sort du catalogue du round. Une autre demande, ou un outil non exposé : rien ne change.
"""

from __future__ import annotations

from collections.abc import Iterable
from typing import Any

from app.services.compilers.intent_router import asks_to_find_accounts_in_a_sector

WORKSPACE_STEP = "search_workspace_accounts"
API_STEPS = frozenset({"find_accounts", "run_account_search"})
WEB_STEP = "web_search"


def web_is_last_resort(user_message: str | None, called: Iterable[str]) -> bool:
    """Vrai quand le web doit encore être retenu : demande de comptes d'un secteur, et la marche « espace »
    OU la marche « API branchées » n'a pas encore été tentée."""
    if not user_message or not asks_to_find_accounts_in_a_sector(user_message):
        return False
    done = set(called)
    return not (WORKSPACE_STEP in done and done & API_STEPS)


def forced_first_step(
    round_index: int, user_message: str | None, available_tools: list[dict[str, Any]]
) -> dict[str, Any]:
    """Round 0 : les comptes de l'ESPACE d'abord ; à défaut d'outil exposé, la marche suivante (``find_accounts``)."""
    if round_index != 0 or not user_message or not asks_to_find_accounts_in_a_sector(user_message):
        return {}
    names = {tool.get("name") for tool in available_tools}
    for step in (WORKSPACE_STEP, "find_accounts"):
        if step in names:
            return {"force_tool": step}
    return {}


def tools_for_round(
    user_message: str | None, called: Iterable[str], available_tools: list[dict[str, Any]]
) -> list[dict[str, Any]]:
    """Le catalogue du round : ``web_search`` en moins tant que la cascade n'a pas parcouru ses marches."""
    if not web_is_last_resort(user_message, called):
        return available_tools
    return [tool for tool in available_tools if tool.get("name") != WEB_STEP]


# #4288.1 (#3905.5) — l'ORIGINE de chaque compte rendu, en clair. Jamais un fournisseur : le registre public,
# l'espace de la personne, le web — ce que l'espace a branché se nomme par famille, pas par fournisseur.
ORIGIN_WORKSPACE = "déjà dans ton espace"
ORIGIN_REGISTRY = "registre public"
ORIGIN_WEB = "trouvé sur le web"
ORDER_SENTENCE = (
    "J'ai d'abord regardé les comptes de ton espace, puis les registres publics, et le web en dernier recours."
)
# Début de la clause de la 1re marche (`tag_origin`) : la réponse qui la porte annonce DÉJÀ l'ordre, avec ses comptes.
_ORDER_CLAUSE_MARKER = "d'abord dans ton espace"


def _plural(count: int, one: str, many: str, none: str) -> str:
    return none if count == 0 else f"{count} {one if count == 1 else many}"


def _clause(prefix: str, count: int | None, one: str, many: str, none: str) -> str:
    """La clause d'UNE marche, avec SON compte. Pas de liste lisible (`None`) : aucun nombre — jamais un « 0 »."""
    return prefix if count is None else f"{prefix} ({_plural(count, one, many, none)})"


def tag_origin(tool_name: str, result: Any) -> Any:
    """Pose `origin` sur chaque compte rendu, et sur le résultat la CLAUSE de l'étape (`origin_order`).

    V4-CORRECTIFS 4288.1 — la clause dit l'étape ET son compte (« d'abord dans ton espace (3 comptes) ») : la réponse
    compose UNE ligne avec les clauses des étapes réellement appelées, la dernière dit où la recherche s'est arrêtée.
    Seuls les trois outils de la cascade sont touchés ; une erreur, un autre outil ou une forme inattendue
    ressortent TELS QUELS. Le modèle redit l'origine de chaque compte et annonce l'ordre — il ne l'invente pas.
    """
    if not isinstance(result, dict) or result.get("error"):
        return result
    if tool_name == WEB_STEP:
        found = result.get("results")
        count = len(found) if isinstance(found, list) else None
        clause = _clause("en dernier recours sur le web", count, "résultat", "résultats", "aucun résultat")
        return {**result, "origin": ORIGIN_WEB, "origin_order": clause}
    if tool_name == WORKSPACE_STEP:
        key, default = "accounts", None
    elif tool_name == "run_account_search":
        key, default = "items", ORIGIN_REGISTRY
    else:
        return result
    rows = result.get(key)
    if not isinstance(rows, list):
        return result
    tagged = [
        {**row, "origin": ORIGIN_WORKSPACE if default is None or row.get("account_id") else default}
        if isinstance(row, dict)
        else row
        for row in rows
    ]
    if default is None:
        clause = _clause("d'abord dans ton espace", len(tagged), "compte", "comptes", "aucun compte")
    else:
        # Les comptes de l'espace déjà revenus par cette marche ne sont pas des comptes du registre.
        from_registry = sum(1 for row in tagged if isinstance(row, dict) and row.get("origin") == default)
        clause = _clause("puis dans les registres publics", from_registry, "compte", "comptes", "aucun compte")
    return {**result, key: tagged, "origin_order": clause}


def announce_order(reply: str, user_message: str | None, actions: Iterable[dict[str, Any]]) -> str:
    """#4288.1 (#3905.5) — la réponse finale ANNONCE l'ordre suivi, en une ligne, sans dépendre du modèle.

    Seulement si la demande est « des comptes d'un secteur » ET qu'une marche de la cascade a réellement abouti
    ce tour. Jamais deux fois : une réponse qui dit déjà l'ordre ressort telle quelle.
    """
    if not reply.strip() or not user_message or not asks_to_find_accounts_in_a_sector(user_message):
        return reply
    steps = {WORKSPACE_STEP, WEB_STEP, *API_STEPS}
    if not any(a.get("tool") in steps and a.get("status") == "done" for a in actions):
        return reply
    if ORDER_SENTENCE in reply or _ORDER_CLAUSE_MARKER in reply:
        return reply
    return f"{ORDER_SENTENCE}\n\n{reply}"
