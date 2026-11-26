"""Sérialisation JSON tolérante aux valeurs non natives — partagée par les
DEUX chemins qui font sortir la même famille de dictionnaires (les actions
d'un outil de chat) hors de ce service.

#2354 — « ouvre la veille » rendait `STREAM_FAILURE_REPLY` côté Node en ~12 s :
`chat_orchestrator._tool_payload()` (le résultat d'un outil, vers le MODÈLE)
sérialisait déjà avec `default=str` ; `chat._sse()` (le même genre de
dictionnaire, vers le NAVIGATEUR) ne l'avait pas. Une valeur non JSON-native
dans `context["actions"]` cassait donc UN SEUL des deux flux — exactement
l'asymétrie qui rompt le flux SSE en cours.

GA-26 (« un réglage — ici une dérivation — vit à un seul endroit ») : les deux
appellent désormais CETTE fonction plutôt que de répéter `default=str` chacun
de son côté.
"""

from __future__ import annotations

import json
from typing import Any

_JSON_NATIVE_LEAF_TYPES = (str, int, float, bool, type(None))


def dumps_json_safe(value: Any) -> str:
    """La sérialisation JSON utilisée par les deux chemins. Une valeur non
    JSON-native (date, Decimal, objet métier) devient sa `str()` plutôt que de
    lever et de casser l'appelant."""
    return json.dumps(value, ensure_ascii=False, default=str)


def describe_unserializable(value: Any, *, _path: str = "", _seen: frozenset[int] = frozenset()) -> str | None:
    """Filet DU filet : `dumps_json_safe` échoue encore sur une clé non-str,
    un objet dont `str()` lève, ou une référence circulaire. Cette fonction
    NOMME le CHEMIN (clés/index structurels du dictionnaire, jamais une
    valeur) et le TYPE de la valeur fautive — jamais son contenu (D65, le
    corps d'une action ne sort jamais vers le journal).

    Rend `None` quand la valeur est en réalité sérialisable : cette fonction
    sert le diagnostic du filet de secours, pas le chemin nominal.
    """
    if isinstance(value, dict):
        obj_id = id(value)
        if obj_id in _seen:
            return f"{_path or '$'} (référence circulaire)"
        seen = _seen | {obj_id}
        for key, item in value.items():
            if not isinstance(key, _JSON_NATIVE_LEAF_TYPES):
                return f"{_path or '$'}.<clé de type {type(key).__name__}>"
            found = describe_unserializable(item, _path=f"{_path}.{key}" if _path else str(key), _seen=seen)
            if found:
                return found
        return None
    if isinstance(value, (list, tuple)):
        obj_id = id(value)
        if obj_id in _seen:
            return f"{_path or '$'} (référence circulaire)"
        seen = _seen | {obj_id}
        for index, item in enumerate(value):
            found = describe_unserializable(item, _path=f"{_path}[{index}]", _seen=seen)
            if found:
                return found
        return None
    if isinstance(value, _JSON_NATIVE_LEAF_TYPES):
        return None
    try:
        str(value)
    except Exception:  # noqa: BLE001 — on veut nommer N'IMPORTE QUEL échec de `str()`
        return f"{_path or '$'} (type {type(value).__name__}, str() lève)"
    return None
