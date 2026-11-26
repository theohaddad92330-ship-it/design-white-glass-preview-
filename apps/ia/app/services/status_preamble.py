"""#3482 — retire la phrase de statut « Le travail s'est interrompu… » d'une réponse
qui n'a aucune raison de la porter.

`INTERRUPTED_WORK_BLOCK` (prompts/thread_state.py) demande au modèle de ne
l'employer que pour un arrêt réel ; ce filet DÉTERMINISTE couvre le cas où il
l'ouvre quand même. Pure : texte entrant, texte sortant, aucun appel.
"""

from __future__ import annotations

import re
from collections.abc import Collection

# Le gabarit FR (« … Reprendre ? ») et son équivalent EN, en tête de réponse, gras
# markdown et apostrophe typographique tolérés. La phrase court jusqu'au « ? »
# du gabarit, ou à défaut jusqu'à la fin du premier paragraphe.
_OPENING = re.compile(
    r"""\A\s*(?:\*\*|__)?\s*
        (?:Le\s+travail\s+s['’]est\s+interrompu|The\s+work\s+was\s+interrupted)
        (?P<rest>.*?)
        (?:(?:Reprendre|Resume)\s*\?(?:\*\*|__)?|(?=\n\s*\n)|\Z)
    """,
    re.IGNORECASE | re.DOTALL | re.VERBOSE,
)

# La personne parle du travail lui-même : le gabarit répond alors à sa question.
_ASKS_ABOUT_WORK = re.compile(
    r"\bo[uù]\s+en\s+(?:est|sommes|étions|était)|on\s+en\s+était\s+o[uù]|\breprend|\brepris|\breprendre\b"
    r"|\binterromp|\bpoursui|\bwhere\s+(?:are\s+we|were\s+we)|\bresume\b|\bpick\s+up\b|\binterrupted\b",
    re.IGNORECASE,
)


def strip_status_preamble(reply: str, *, user_message: str, failed_tools: Collection[str]) -> str:
    """La réponse sans sa phrase d'ouverture de statut, quand rien ne la justifie.

    Gardée telle quelle si un outil de CE tour a échoué, si la personne demande où
    en est le travail, ou si le retrait ne laisserait rien.
    """
    if failed_tools or _ASKS_ABOUT_WORK.search(user_message or ""):
        return reply
    match = _OPENING.match(reply)
    if match is None:
        return reply
    remainder = reply[match.end() :].lstrip()
    return remainder if remainder else reply


# #3437 (recette prod 03/10 puis 04/10) — la formule « première tranche » ne sort JAMAIS d'une
# réponse : ni en tête (« Première tranche : »), ni en milieu de phrase (« Cette première
# tranche couvre… »), quelle que soit la casse, l'accent (« premiere »), l'abréviation
# (« 1ère / 1re ») ou la langue (« first slice / tranche »). Citer l'interdit dans le prompt
# l'ancre ; ce filet DÉTERMINISTE retire la PHRASE qui la porte, et ne touche à rien d'autre.
_SLICE_FORMULA = re.compile(
    r"(?:\bpremi[èeé]re|\b1\s*(?:[èeé]re|re|ère)\b|\bfirst)\s+(?:tranche|slice)\b",
    re.IGNORECASE,
)
# Une phrase : jusqu'à . ! ? ou fin de ligne ; « Première tranche : » (deux-points) s'arrête
# aussi au deux-points quand la formule n'est qu'une étiquette de tête.
_SLICE_LABEL = re.compile(r"\A\s*(?:\*\*|__)?\s*" + _SLICE_FORMULA.pattern + r"\s*(?:\*\*|__)?\s*:\s*(?:\*\*|__)?\s*", re.IGNORECASE)
_SENTENCE = re.compile(r"[^.!?\n]+(?:[.!?]+|\n)?[ \t]*\n*|\n+")


def strip_slice_preamble(reply: str) -> str:
    """La réponse sans la formule « première tranche » ; si rien ne reste, la formule est remplacée par « partie » (jamais gardée).

    Une étiquette de tête (« Première tranche : ») est retirée seule ; toute autre phrase qui
    porte la formule est retirée entière."""
    label = _SLICE_LABEL.match(reply)
    text = reply[label.end() :] if label else reply
    kept = [part for part in _SENTENCE.findall(text) if not _SLICE_FORMULA.search(part)]
    result = "".join(kept).strip()
    return result if result else _SLICE_FORMULA.sub("partie", reply)
