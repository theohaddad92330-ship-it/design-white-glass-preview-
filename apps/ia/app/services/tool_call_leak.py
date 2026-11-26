"""#3218 — un appel d'outil ne fuit JAMAIS dans le texte d'un message de Laura.

Recette prod 02/10 : le texte d'un message portait ``{{functions.offer_reply_options({...})}}``
— l'appel d'outil recopié comme du texte par le modèle. Le filtre vit ICI, une
fois, et se pose sur la diffusion (``StreamingToolCallFilter``, fragment par
fragment) ET sur le texte réglé (``strip_tool_call_text``). Il ne retire que la
forme ``{{functions.<nom>(...)}}`` : un ``{{`` ordinaire n'est jamais touché.
"""

from __future__ import annotations

import re

_OPENER = "{{functions."
_CALL = re.compile(r"\{\{\s*functions\.\w+\s*\(.*?\)\s*\}\}", re.DOTALL)
_UNCLOSED = re.compile(r"\{\{\s*functions\..*\Z", re.DOTALL)


def strip_tool_call_text(text: str) -> str:
    """Retire les appels d'outil recopiés en texte (fermés, ou restés ouverts
    en fin de texte). Texte sans appel : rendu à l'identique."""
    if "functions." not in text:
        return text
    return _UNCLOSED.sub("", _CALL.sub("", text)).rstrip(" ") if _OPENER[:2] in text else text


def _held_prefix_length(buffer: str) -> int:
    """Longueur de la fin de ``buffer`` qui pourrait devenir ``{{functions.``
    (ou en est déjà le début d'un appel non refermé) : on la retient."""
    open_at = -1
    for match in re.finditer(r"\{\{\s*functions\.", buffer):
        open_at = match.start()
    if open_at >= 0 and not _CALL.search(buffer, open_at):
        return len(buffer) - open_at
    for size in range(min(len(buffer), len(_OPENER) + 2), 0, -1):
        tail = buffer[-size:]
        if re.fullmatch(r"\{(\{\s*(f(u(n(c(t(i(o(n(s(\.)?)?)?)?)?)?)?)?)?)?)?", tail):
            return size
    return 0


class StreamingToolCallFilter:
    """Même contrat que ``StreamingRedactor`` : ``feed`` rend la part sûre à
    émettre, ``flush`` vidange à la fin du round (un appel resté ouvert est
    alors jeté, jamais montré)."""

    def __init__(self) -> None:
        self._pending = ""

    def feed(self, fragment: str) -> str:
        if not fragment:
            return ""
        self._pending += fragment
        cleaned = _CALL.sub("", self._pending)
        held = _held_prefix_length(cleaned)
        safe, self._pending = cleaned[: len(cleaned) - held], cleaned[len(cleaned) - held :]
        return safe

    def flush(self) -> str:
        remainder, self._pending = self._pending, ""
        return strip_tool_call_text(remainder)
