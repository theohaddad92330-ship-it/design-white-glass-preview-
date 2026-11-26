"""#4464 — crédits implicites : Laura ne lit ni coût, ni solde, ni crédit.

Les cartes envoyées au navigateur gardent leurs champs (le web décide ce qu'il montre) ;
la copie que le MODÈLE relit (`chat_orchestrator._tool_payload`) en est purgée, pour
qu'aucune phrase de Laura ne puisse annoncer un chiffre qu'elle n'a pas vu.
"""

from __future__ import annotations

from typing import Any

# Clés de coût / solde en crédits, toutes casses de nommage confondues (snake_case et camelCase).
MONEY_KEYS: frozenset[str] = frozenset(
    {
        "cost_credits",
        "costCredits",
        "credits_left",
        "creditsLeft",
        "credits_left_after",
        "creditsLeftAfter",
        "credit_kind",
        "creditKind",
        "credits_remaining",
        "creditsRemaining",
        "credits_spent",
        "creditsSpent",
        "estimated_credits",
        "estimatedCredits",
    }
)


def strip_money(value: Any) -> Any:
    """Copie de ``value`` sans aucune clé de ``MONEY_KEYS``, à toute profondeur."""
    if isinstance(value, dict):
        return {key: strip_money(item) for key, item in value.items() if key not in MONEY_KEYS}
    if isinstance(value, list):
        return [strip_money(item) for item in value]
    if isinstance(value, tuple):
        return tuple(strip_money(item) for item in value)
    return value
