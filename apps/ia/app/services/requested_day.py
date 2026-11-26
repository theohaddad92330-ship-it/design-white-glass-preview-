"""#4293.8 (#2770.13) — le JOUR qu'une demande de planning nomme, lu en code.

« Organise-moi ma journée de lundi » dite un lundi visait aujourd'hui : le modèle devinait une date AAAA-MM-JJ
sans connaître le calendrier. Ici : « demain », « après-demain » et un jour de semaine se résolvent contre
« aujourd'hui » dans le fuseau applicable. Un jour de semaine nomme TOUJOURS la prochaine occurrence À VENIR
(dit un lundi, « lundi » est le lundi suivant) ; « aujourd'hui », « cet après-midi » ou aucun jour : ``None``,
le défaut de l'outil (aujourd'hui) reste.
"""

from __future__ import annotations

import re
import unicodedata
from datetime import date, timedelta

_WEEKDAYS = ("lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche")


def _fold(text: str) -> str:
    return unicodedata.normalize("NFD", text.lower()).encode("ascii", "ignore").decode().replace("’", "'")


def requested_day(message: str | None, today: date) -> date | None:
    """Le jour nommé par la demande, ou ``None`` quand elle n'en nomme aucun (défaut : aujourd'hui)."""
    if not message:
        return None
    text = _fold(message)
    if re.search(r"(?<![a-z])apres-?\s?demain(?![a-z])", text):
        return today + timedelta(days=2)
    if re.search(r"(?<![a-z])demain(?![a-z])", text):
        return today + timedelta(days=1)
    for index, name in enumerate(_WEEKDAYS):
        if re.search(rf"(?<![a-z]){name}(?![a-z])", text):
            ahead = (index - today.weekday()) % 7 or 7
            return today + timedelta(days=ahead)
    return None
