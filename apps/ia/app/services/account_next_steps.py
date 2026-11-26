"""#AM.46 / #AM.68 — Laura oriente SANS tunnel.

Sur la carte d'un compte précis déjà au portefeuille, une ligne de SUITES cliquables (contacts, organigramme,
signaux), dans l'ordre que la personne choisit — aucune n'est imposée. Quand le compte est cité avec ses filiales
(« Free et ses filiales »), les deux gestes s'y ajoutent : le tour d'horizon (Découvrir) et l'analyse de fond.
Cliquer envoie une phrase à Laura (`follow_ups`, comme les cartes de classement) : rien ne part chez un tiers,
Laura prépare, le commercial envoie. Les suites sont posées par le CODE d'après la carte et les outils lus —
jamais écrites de mémoire par le modèle, jamais redemandées (« tu veux que… »).
"""

from __future__ import annotations

import json
import re
from typing import Any

from app.services.reply_blocks import REPLY_BLOCK_FENCE, split_reply_blocks

#: La lecture du compte AU PORTEFEUILLE : `get_account_briefing` ne rend jamais un compte étranger à l'espace.
_PORTFOLIO_READ_TOOLS = frozenset({"get_account_briefing"})
_GROUP_RE = re.compile(r"(?<![a-z])(?:filiales?|subsidiar(?:y|ies)|groupe|group)(?![a-z])", re.IGNORECASE)

_LABELS: dict[str, dict[str, tuple[str, str]]] = {
    "fr": {
        "contacts": ("Voir les contacts", "Quels sont les contacts de {name} ?"),
        "org": ("Voir l'organigramme", "Montre-moi l'organigramme de {name}."),
        "signals": ("Voir les signaux", "Quels sont les signaux récents chez {name} ?"),
        "overview": ("Tour d'horizon", "Fais un tour d'horizon de {name} et de ses filiales."),
        "deep": ("Analyse de fond", "Lance une analyse de fond de {name} et de ses filiales."),
    },
    "en": {
        "contacts": ("See contacts", "Who are the contacts at {name}?"),
        "org": ("See the org chart", "Show me the org chart of {name}."),
        "signals": ("See signals", "What are the recent signals at {name}?"),
        "overview": ("Overview", "Give me an overview of {name} and its subsidiaries."),
        "deep": ("Deep analysis", "Run a deep analysis of {name} and its subsidiaries."),
    },
}


def _follow_ups(name: str, user_message: str | None, language: str | None) -> list[dict[str, str]]:
    labels = _LABELS["en" if (language or "").lower().startswith("en") else "fr"]
    keys = ["contacts", "org", "signals"]
    # #AM.68 — le compte cité avec ses filiales : les deux gestes, en plus de ce que Laura sait déjà.
    if user_message and _GROUP_RE.search(user_message):
        keys += ["overview", "deep"]
    return [{"label": labels[key][0], "ask": labels[key][1].format(name=name)} for key in keys]


def with_account_next_steps(
    reply: str,
    *,
    user_message: str | None,
    language: str | None,
    actions: list[dict[str, Any]],
) -> str:
    """``reply`` dont chaque carte de compte sans suites en reçoit ; inchangée, à l'octet, sinon."""
    if not any(a.get("tool") in _PORTFOLIO_READ_TOOLS for a in actions):
        return reply
    segments = split_reply_blocks(reply)
    changed = False
    parts: list[str] = []
    for segment in segments:
        if segment.kind == "block" and (segment.block or {}).get("type") == "account_card":
            card = dict(segment.block or {})
            name = str(card.get("name") or "").strip()
            if name and not card.get("follow_ups"):
                card["follow_ups"] = _follow_ups(name, user_message, language)
                parts.append(f"```{REPLY_BLOCK_FENCE}\n{json.dumps(card, ensure_ascii=False)}\n```")
                changed = True
                continue
        parts.append(segment.text if segment.kind == "text" else _fence(segment))
    return "\n\n".join(part for part in parts if part) if changed else reply


def _fence(segment: Any) -> str:
    return f"```{REPLY_BLOCK_FENCE}\n{json.dumps(segment.block, ensure_ascii=False)}\n```"
