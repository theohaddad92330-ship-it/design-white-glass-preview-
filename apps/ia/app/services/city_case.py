"""#3769.7 — UNE casse pour la ville du siège, posée à un seul endroit.

Les registres rendent « COURBEVOIE », « Colmar », « paris » selon la source. Le modèle recopie ce
qu'il lit, donc la carte affichait trois casses dans le même fil. Ce module est le seul endroit qui
décide : casse de titre française, tirets et apostrophes conservés, particules en minuscules.

Une valeur déjà en casse mixte est laissée telle quelle : quelqu'un l'a choisie (« Saint-Denis »),
on ne la « corrige » pas. Seul le tout-majuscules ou le tout-minuscules est retitré.
"""

import re
from typing import Any, TypeVar

_PARTICLES = frozenset({"de", "du", "des", "la", "le", "les", "sur", "sous", "en", "lès", "lez", "aux", "au", "et", "d", "l"})
# Clés d'un résultat d'outil qui portent une ville (`city`) ou une adresse de siège terminée par
# « <code postal> <COMMUNE> » (`headquarters`).
_CITY_KEYS = frozenset({"city", "hq_city", "headquarters_city", "headquartersCity"})
_ADDRESS_KEYS = frozenset({"headquarters"})
_POSTAL_THEN_CITY = re.compile(r"(\b\d{5}\s+)([^,;\d]+)$")

T = TypeVar("T")


def _title_word(word: str, first: bool) -> str:
    low = word.lower()
    if not first and low in _PARTICLES:
        return low
    return low[:1].upper() + low[1:]


def format_city(value: T) -> T:
    if not isinstance(value, str) or not value.strip():
        return value
    text = value.strip()
    if text != text.upper() and text != text.lower():
        return value
    out: list[str] = []
    for i, space_part in enumerate(re.split(r"(\s+)", text)):
        if not space_part or space_part.isspace():
            out.append(space_part)
            continue
        hyphen_parts = space_part.split("-")
        rebuilt = []
        for j, hp in enumerate(hyphen_parts):
            # « L'HAŸ » : l'élision reste minuscule devant la majuscule du nom.
            if "'" in hp or "’" in hp:
                sep = "'" if "'" in hp else "’"
                head, _, tail = hp.partition(sep)
                rebuilt.append(_title_word(head, i == 0 and j == 0) + sep + _title_word(tail, True))
            else:
                rebuilt.append(_title_word(hp, i == 0 and j == 0))
        out.append("-".join(rebuilt))
    return "".join(out)  # type: ignore[return-value]


def _format_address(value: str) -> str:
    match = _POSTAL_THEN_CITY.search(value.strip())
    if not match:
        return value
    start = match.start(2)
    stripped = value.strip()
    return stripped[:start] + format_city(match.group(2).strip())


def normalize_cities(data: Any) -> Any:
    """Parcourt un résultat d'outil et ne retouche QUE les clés de ville et de siège."""
    if isinstance(data, dict):
        out: dict[Any, Any] = {}
        for key, val in data.items():
            if isinstance(val, str) and key in _CITY_KEYS:
                out[key] = format_city(val)
            elif isinstance(val, str) and key in _ADDRESS_KEYS:
                out[key] = _format_address(val)
            else:
                out[key] = normalize_cities(val)
        return out
    if isinstance(data, list):
        return [normalize_cities(item) for item in data]
    return data
