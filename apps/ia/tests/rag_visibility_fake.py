"""#2779 — l'interprète EN MÉMOIRE du filtre de visibilité RAG (`_visibility_filter`).

Partagé par les faux PostgREST des tests RAG : chacun applique VRAIMENT le
prédicat que le service pose (comportemental, pas un match de chaîne), et
seule la forme émise par le service est comprise — toute autre forme lève,
pour qu'un changement de forme côté service ne passe jamais au vert en silence.

Forme : ``scope.in.(workspace,knowledge_base),and(scope.eq.personal,user_id.eq.<uid>)``
suivie, quand la requête porte un compte, de ``,and(scope.eq.account,account_id.eq.<id>)``.
"""

from __future__ import annotations

import re
from collections.abc import Callable

_TEAM = re.compile(r"^scope\.in\.\(([a-z_,]+)\)")
_PERSONAL = re.compile(r"and\(scope\.eq\.personal,user_id\.eq\.([^,)]+)\)")
_ACCOUNT = re.compile(r"and\(scope\.eq\.account,account_id\.eq\.([^,)]+)\)")


def is_visibility_filter(expression: str) -> bool:
    return expression.startswith("scope.")


def visibility_predicate(expression: str) -> Callable[[dict], bool]:
    team = _TEAM.match(expression)
    personal = _PERSONAL.search(expression)
    if not team or not personal:
        raise AssertionError(f"forme de filtre de visibilité inconnue : {expression}")
    team_scopes = set(team.group(1).split(","))
    owner = personal.group(1)
    account = _ACCOUNT.search(expression)
    account_id = account.group(1) if account else None

    def pred(row: dict) -> bool:
        scope = row.get("scope")
        if scope in team_scopes:
            return True
        if scope == "personal" and row.get("user_id") == owner:
            return True
        return bool(account_id) and scope == "account" and row.get("account_id") == account_id

    return pred
