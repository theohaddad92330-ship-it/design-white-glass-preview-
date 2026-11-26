"""#4438 (épopée #4433) — aucune consigne d'outil ne renvoie Laura à PROPOSER d'élargir.

Le zéro d'un outil lui dit d'élargir elle-même, dans le tour (paliers de #4433), et de le dire en une ligne.
Une consigne « propose d'élargir » réintroduit le « tu veux que j'élargisse ? » que l'audit du 21/10 a mesuré
(26 % des réponses). Le test lit le code des outils : il sait dire NON.
"""

from __future__ import annotations

import re
from pathlib import Path

_APP = Path(__file__).resolve().parents[1] / "app"
_PROPOSE_TO_WIDEN = re.compile(r"propos\w*\s+(?:de\s+|d'|un\s+|l')?[ée]largi", re.IGNORECASE)
_ALLOWED_NEGATIONS = re.compile(r"(?:ne|jamais)\s+[^.\"]{0,40}propos\w*\s+(?:de\s+|d')?[ée]largi", re.IGNORECASE)


def test_no_tool_instruction_tells_laura_to_propose_widening():
    offenders: list[str] = []
    for path in (_APP / "services" / "chat_tools.py", *sorted((_APP / "prompts").glob("*.py"))):
        if path.name == "laura_acts.py":  # il DÉCRIT le défaut (docstring) et l'interdit
            continue
        for number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), start=1):
            if line.lstrip().startswith("#"):
                continue
            if _PROPOSE_TO_WIDEN.search(line) and not _ALLOWED_NEGATIONS.search(line):
                offenders.append(f"{path.name}:{number}")
    assert offenders == []


def test_the_guard_sees_the_forbidden_phrase():
    assert _PROPOSE_TO_WIDEN.search("dis-le, et propose d'élargir les critères.")
    assert not _PROPOSE_TO_WIDEN.search("élargis seule, et dis-le.")
