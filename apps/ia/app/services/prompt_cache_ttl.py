"""LOT (15/10) DATA-C — le TTL du cache de prompt par rôle (``"1h"`` ou forme d'avant).

Module FEUILLE (aucun import de l'app) : ``claude_service`` le lit à chaque appel ; le
loger dans ``prompt_cache_layout`` tirait ``chat_tools`` → ``routers`` dans le graphe
des agents (contrat ``agents-not-upward``, #4118).
"""

from __future__ import annotations

#: LOT (15/10) DATA-C — les rôles dont le system prompt se RELIT à 5-60 min
#: d'écart : les phases d'analyse (un espace enchaîne ses comptes dans l'heure,
#: le refresh nocturne est étalé d'un compte toutes les N minutes). Préfixes de
#: ``prompt_name`` : ``bellum_plan`` couvre ``bellum_plan_<section>``,
#: ``bellum_contacts`` couvre ``bellum_contacts_batch_<i>_of_<n>``. Écriture à
#: 2× (contre 1,25×) : rentable dès qu'une relecture tombe entre 5 et 60 min.
_ONE_HOUR_ROLES: tuple[str, ...] = (
    "bellum_facts",
    "bellum_signals",
    "bellum_strategy",
    "bellum_contacts",
    "bellum_organigramme",
    "bellum_plan",
    "bellum_messages",
)

#: Le TTL long du fournisseur. Laura le prend aussi (tours espacés > 5 min).
ONE_HOUR = "1h"


def cache_ttl_for(prompt_name: str) -> str | None:
    """``"1h"`` pour un rôle de phase, ``None`` (5 min, forme d'avant) sinon."""
    for role in _ONE_HOUR_ROLES:
        if prompt_name == role or prompt_name.startswith(role + "_"):
            return ONE_HOUR
    return None
