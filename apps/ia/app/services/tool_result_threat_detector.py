"""#2879 (#2442.14) — deux détecteurs de sécurité sur le résultat d'un outil de
chat, appelés par `chat_tools.execute_chat_tool` (seul appelant réel) AVANT la
purge : le compteur `security_events` en tire deux espèces, `cross_tenant_suspected`
et `injection_suspected`.

- Cross-tenant : aucun outil n'a jamais besoin de rendre un identifiant d'espace
  (`tool_result_sanitizer`, #2438.6, le retire inconditionnellement). Qu'il en
  porte un est donc un signal structurel — un connecteur ou une projection qui
  laisse passer une clé d'un autre périmètre. On ne COMPARE pas à l'espace de
  l'appelant : on signale la présence de la clé.
- Injection : heuristique de motifs (consigne d'ignorer les instructions,
  changement de rôle) dans un texte que le modèle va lire. Un SOUPÇON, jamais
  une preuve : le mot « suspected » est dans le nom de l'espèce.

Ils rendent un booléen. Jamais le texte détecté : ni journalisé, ni stocké
(aucune donnée personnelle dans `security_events`).
"""

from __future__ import annotations

import re
from typing import Any

from app.services.tool_result_sanitizer import is_cross_workspace_key

_INJECTION_RE = re.compile(
    r"ignor(?:e|ez)\s+(?:\w+\s+){0,3}?(?:instructions?|consignes?)"
    r"|disregard\s+(?:\w+\s+){0,2}?(?:previous|prior|above)"
    r"|forget\s+(?:all\s+)?(?:your|previous|prior)\s+instructions"
    r"|oublie\s+(?:toutes?\s+)?(?:tes|les|vos)\s+(?:instructions|consignes)"
    r"|you\s+are\s+now\s+(?:DAN|in\s+developer\s+mode)"
    r"|(?:reveal|print|show|affiche|r[eé]v[eè]le)\s+(?:me\s+)?(?:your\s+|the\s+|ton\s+|le\s+)?(?:system\s+prompt|prompt\s+syst[eè]me)",
    re.IGNORECASE,
)


def detect_cross_tenant_key(value: Any) -> bool:
    """Vrai si une clé d'identifiant d'espace figure, à n'importe quelle profondeur."""
    if isinstance(value, dict):
        return any(
            (isinstance(k, str) and is_cross_workspace_key(k)) or detect_cross_tenant_key(v) for k, v in value.items()
        )
    if isinstance(value, list):
        return any(detect_cross_tenant_key(item) for item in value)
    return False


def detect_prompt_injection(value: Any) -> bool:
    """Vrai si un texte du résultat ressemble à une consigne d'injection."""
    if isinstance(value, str):
        return _INJECTION_RE.search(value) is not None
    if isinstance(value, dict):
        return any(detect_prompt_injection(v) for v in value.values())
    if isinstance(value, list):
        return any(detect_prompt_injection(item) for item in value)
    return False


__all__ = ["detect_cross_tenant_key", "detect_prompt_injection"]
