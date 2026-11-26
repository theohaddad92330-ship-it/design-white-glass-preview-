"""CACHE-LLM (Louis 15/10) — l'ORDRE des outils de Laura, pensé pour le cache de prompt.

Le cache de prompt du fournisseur porte sur un PRÉFIXE, dans l'ordre
``outils → system → messages``, jusqu'à une coupure ``cache_control``. Laura
envoie ~150 outils (~80 k jetons) AVANT son system : la coupure posée sur le
system (``claude_service._cached_system``) couvre donc aussi tous les outils —
et un seul outil RETIRÉ au milieu de la liste fait rater tout le préfixe.

Or le catalogue d'un tour varie, pour quatre raisons déjà en place :

* une connexion absente retire les outils de sa famille (``TOOL_REQUIRED_FAMILIES``) ;
* une question explicite retire ``ask_clarification`` ;
* le mode RAPIDE retire la recherche web (``mode_excluded_tool_names``) ;
* un ``SourcePlan`` ou l'exclusion des données de l'espace retire des couches
  (``LAYER_TOOL_NAMES``, ``WORKSPACE_DATA_TOOL_NAMES``).

:func:`cache_ordered_tools` range ces outils VARIABLES en fin de liste (ordre
relatif conservé) et pose une coupure sur le DERNIER outil STABLE : le bloc
stable — identique pour tous les utilisateurs et tous les tours — est relu du
cache même quand la queue variable change. Coût : une coupure de plus (le
system en porte au plus deux ; le plafond du fournisseur est quatre), aucune
écriture en plus sur un préfixe déjà écrit.
"""

from __future__ import annotations

import functools
from typing import Any

_EPHEMERAL = {"type": "ephemeral"}

# LOT (15/10) DATA-C — le TTL 1 h par rôle vit dans `prompt_cache_ttl` (module feuille : `claude_service`
# le lit sans tirer `chat_tools` → `routers`, contrat de couches #4118) ; relu ici pour Laura.
from app.services.prompt_cache_ttl import ONE_HOUR, cache_ttl_for  # noqa: E402,F401


@functools.cache
def volatile_tool_names() -> frozenset[str]:
    """Les outils qu'un tour peut RETIRER du catalogue — lus aux sources mêmes."""
    from app.services.chat_tools import TOOL_REQUIRED_FAMILIES
    from app.services.context_mode import WORKSPACE_DATA_TOOL_NAMES
    from app.services.source_plan import LAYER_TOOL_NAMES

    layers = frozenset().union(*LAYER_TOOL_NAMES.values()) if LAYER_TOOL_NAMES else frozenset()
    return frozenset(TOOL_REQUIRED_FAMILIES) | {"ask_clarification", "web_search"} | layers | WORKSPACE_DATA_TOOL_NAMES


def cache_ordered_tools(tools: list[dict[str, Any]], *, ttl: str | None = None) -> list[dict[str, Any]]:
    """Outils stables d'abord (le dernier porte la coupure), variables ensuite.

    Ne modifie jamais le catalogue partagé : l'outil marqué est une COPIE."""
    volatile = volatile_tool_names()
    stable = [tool for tool in tools if tool.get("name") not in volatile]
    rest = [tool for tool in tools if tool.get("name") in volatile]
    if not stable:
        return list(rest)
    mark = {**_EPHEMERAL, "ttl": ttl} if ttl else dict(_EPHEMERAL)
    marked = {**stable[-1], "cache_control": mark}
    return [*stable[:-1], marked, *rest]


def with_history_breakpoint(messages: list[dict[str, Any]], *, ttl: str | None = ONE_HOUR) -> list[dict[str, Any]]:
    """LOT (15/10) DATA-C — une coupure sur le DERNIER bloc du dernier message.

    Le tour suivant de Laura relit alors tout l'historique (outils, system,
    échanges, résultats d'outils) au lieu de le repayer en entrée pleine — même
    quand l'utilisateur répond 20 minutes plus tard (TTL 1 h). Une seule
    coupure : celle d'un tour précédent n'est jamais conservée (le fournisseur
    en accepte quatre ; outils 1 + system 2 + historique 1).

    Rend une COPIE : ``messages`` (l'historique du transport) et ses blocs ne
    sont jamais modifiés — un ``cache_control`` collé dans l'historique se
    multiplierait d'un tour à l'autre. Un dernier bloc qui n'est pas un ``dict``
    (objet SDK rejoué) laisse la liste telle quelle : pas de coupure, rien de cassé.
    """
    if not messages:
        return list(messages)
    head, last = messages[:-1], messages[-1]
    content = last.get("content")
    mark = {**_EPHEMERAL, "ttl": ttl} if ttl else dict(_EPHEMERAL)
    if isinstance(content, str):
        if not content:
            return list(messages)
        blocks: list[Any] = [{"type": "text", "text": content, "cache_control": mark}]
    elif isinstance(content, list) and content and isinstance(content[-1], dict):
        blocks = [*content[:-1], {**content[-1], "cache_control": mark}]
    else:
        return list(messages)
    return [*head, {**last, "content": blocks}]
