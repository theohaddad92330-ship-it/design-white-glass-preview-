"""#3857 — une réponse n'annonce pas des options « juste dessous » qu'aucun bouton ne porte.

L'écran ne rend des boutons que depuis `context.reply_options` (outil
`offer_reply_options`) ou `context.clarification.options` (carte). Quand le modèle
écrit « les options sont juste dessous » sans les avoir transmises (appel oublié, ou
options refusées par `_reply_options`), la personne cherche des boutons qui n'existent
pas. Ce filet DÉTERMINISTE retire la phrase promesse — jamais une question, jamais une
réponse qui ne serait plus que cette phrase. Pure : texte entrant, texte sortant.
"""

from __future__ import annotations

import re
from typing import Any

# Une phrase qui PROMET des choix cliquables posés en dessous : un mot de « choix »
# ET un repère de position. « Le tableau ci-dessous » n'est pas une promesse d'options.
_CHOICE_WORD = r"(?:options?|choix|boutons?|propositions?|r[ée]ponses?\s+possibles?|buttons?|choices?)"
_BELOW = r"(?:juste\s+(?:en\s+)?dessous|ci-dessous|en\s+dessous|ci-apr[èe]s|just\s+below|below)"
_PROMISES_OPTIONS = re.compile(
    rf"(?:\b{_CHOICE_WORD}\b[^.!?\n]{{0,60}}\b{_BELOW}\b|\b{_BELOW}\b[^.!?\n]{{0,40}}\b{_CHOICE_WORD}\b)",
    re.IGNORECASE,
)
_SENTENCE_BOUNDARY = re.compile(r"(?<=[.!?…])\s+")


def has_clickable_options(context: dict[str, Any]) -> bool:
    """Vrai quand le contexte du tour porte au moins une option que l'écran rendra en bouton."""
    for group in context.get("reply_options") or []:
        if isinstance(group, dict) and group.get("options"):
            return True
    clarification = context.get("clarification")
    return isinstance(clarification, dict) and bool(clarification.get("options"))


def strip_unbacked_options_announcement(reply: str, *, has_options: bool) -> str:
    """La réponse sans sa phrase qui promet des options, quand aucune n'est transmise."""
    if has_options or not reply.strip():
        return reply
    paragraphs = reply.split("\n\n")
    rewritten: list[str] = []
    for paragraph in paragraphs:
        sentences = _SENTENCE_BOUNDARY.split(paragraph)
        kept = [s for s in sentences if "?" in s or not _PROMISES_OPTIONS.search(s)]
        if len(kept) == len(sentences):
            rewritten.append(paragraph)
        elif kept:
            rewritten.append(" ".join(kept).strip())
    out = "\n\n".join(rewritten).strip()
    return out if out else reply
