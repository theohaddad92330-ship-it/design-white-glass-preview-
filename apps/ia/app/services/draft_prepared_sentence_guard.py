"""#4060 (R12, prod 15/10) — jamais « je n'ai pas préparé de brouillon » sous la carte d'un brouillon.

Quand `prepare_mail_draft` a rendu une carte, le brouillon EST préparé (et jamais envoyé : le commercial
envoie). La consigne `note_pour_laura` ne suffit pas — Laura a quand même écrit « Je n'ai pas préparé
ni envoyé de brouillon » sous la carte. Ce filet est DÉTERMINISTE : la phrase contradictoire est
remplacée par la phrase vraie. Sans carte de brouillon (absente ou en échec), la phrase peut être
vraie et reste intacte. Pur : texte et actions entrants, texte sortant.
"""

from __future__ import annotations

import re
from typing import Any

_DRAFT_TOOL = "prepare_mail_draft"
_FAILED_STATUSES = frozenset({"error", "failed", "refused"})

TRUE_SENTENCE = "J'ai préparé un brouillon, il n'a pas été envoyé : l'envoi reste ton geste."

_APOS = r"['’]"
_CONTRADICTION = re.compile(
    rf"[ \t]*[^.!?\n]*(?:\b(?:je\s+n{_APOS}ai\s+pas\s+pr[ée]par[ée]|je\s+n{_APOS}ai\s+(?:aucun|pas\s+de)\s+brouillon\s+pr[ée]par[ée])"
    rf"|\baucun\s+brouillon\s+n{_APOS}a\s+(?:[ée]t[ée]\s+)?pr[ée]par[ée]"
    rf"|\bpas\s+de\s+brouillon\s+pr[ée]par[ée]"
    rf"|\bbrouillon\s+(?:non|pas)\s+(?:enregistr[ée]|sauvegard[ée])\w*)[^.!?\n]*[.!?…]?",
    re.IGNORECASE,
)


_SAYS_PREPARED = re.compile(rf"\bpr[ée]par[ée]s?\b", re.IGNORECASE)


def _has_draft_card(actions: list[dict[str, Any]]) -> bool:
    return any(
        isinstance(a, dict) and a.get("tool") == _DRAFT_TOOL and str(a.get("status") or "") not in _FAILED_STATUSES
        for a in actions
    )


def fix_unprepared_draft_sentence(reply: str, actions: list[dict[str, Any]]) -> str:
    """La réponse où « pas préparé » est remplacé par la phrase vraie, si une carte de brouillon existe."""
    if not reply or not _has_draft_card(actions):
        return reply
    if not _CONTRADICTION.search(reply):
        # #4060 (R37) — carte rendue, mais la réponse ne dit nulle part « préparé » : la phrase vraie est posée.
        return reply if _SAYS_PREPARED.search(reply) else f"{reply.rstrip()}\n\n{TRUE_SENTENCE}"
    out = _CONTRADICTION.sub(TRUE_SENTENCE, reply, count=1)
    return _CONTRADICTION.sub("", out).strip() if _CONTRADICTION.search(out) else out
