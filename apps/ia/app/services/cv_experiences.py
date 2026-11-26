"""#4401.2 — LES EXPÉRIENCES D'UN CV, LUES DANS LE TEXTE BRUT, SANS MODÈLE.

Quand le modèle ne rend pas le bloc ``experiences`` (ou que sa citation est jetée), le CV écrit pourtant ses
missions sous une rubrique « Expériences ». Ce module les lit à la FORME : une ligne portant une période
(« 2018 – 2021 », « 03/2021 – Présent », « 2016-2018 ») et un libellé « rôle » + « entreprise » séparés sans
ambiguïté (« chez », « @ », « | », « – », « , »), dans l'ordre rôle puis entreprise.

Garde-fous : rien n'est lu hors de la rubrique d'expériences (une ligne de FORMATION n'est pas une mission) ;
une ligne dont le libellé ne se découpe pas en deux morceaux est IGNORÉE, jamais devinée ; une date absente
reste vide. Le format de sortie est celui que ``readExperiencesFromDetection`` (``@bellum/contracts``) sait
relire : « rôle | entreprise | début | fin | réalisations ».
"""

from __future__ import annotations

import re
import unicodedata

_DATE = r"(?:\d{1,2}/\d{4}|\d{4}-\d{2}|\d{4})"
_OPEN_END = r"(?:pr[ée]sent|aujourd'hui|aujourd’hui|en cours|actuel|actuellement|à ce jour)"
_PERIOD = re.compile(rf"(?<![\d/-])({_DATE})\s*(?:–|—|-|à|au)\s*({_DATE}|{_OPEN_END})(?![\d/])", re.IGNORECASE)
_SEPARATORS = re.compile(r"\s+chez\s+|\s+@\s+|\s*\|\s*|\s+[–—-]\s+|\s*,\s+", re.IGNORECASE)

_SECTION_START = ("experience", "parcours professionnel", "missions", "emplois")
_SECTION_END = (
    "formation",
    "diplome",
    "competence",
    "langue",
    "certification",
    "centre d'interet",
    "centres d'interet",
    "loisir",
    "projet",
    "reference",
)


def _fold(text: str) -> str:
    folded = unicodedata.normalize("NFKD", text.lower()).encode("ascii", "ignore").decode()
    return folded.replace("’", "'").strip(" :.-_*#")


def _heading_kind(line: str) -> str | None:
    """``start`` / ``end`` pour une ligne qui est une rubrique (courte, sans période), sinon ``None``."""
    stripped = line.strip()
    if not stripped or len(stripped) > 45 or _PERIOD.search(stripped):
        return None
    folded = _fold(stripped)
    if any(folded.startswith(key) for key in _SECTION_START):
        return "start"
    if any(folded.startswith(key) for key in _SECTION_END):
        return "end"
    return None


def _month_or_year(raw: str) -> str:
    slashed = re.fullmatch(r"(\d{1,2})/(\d{4})", raw)
    if slashed:
        return f"{slashed.group(2)}-{int(slashed.group(1)):02d}"
    return raw


def _bound(raw: str, *, end: bool) -> str:
    if end and re.fullmatch(_OPEN_END, raw, re.IGNORECASE):
        return "en cours"
    return _month_or_year(raw)


def _split_label(label: str) -> tuple[str, str] | None:
    parts = [part.strip(" -–—|,:;") for part in _SEPARATORS.split(label)]
    parts = [part for part in parts if part]
    if len(parts) != 2:
        return None
    return parts[0], parts[1]


def _previous_label_index(lines: list[str], at: int, used: set[int]) -> int | None:
    """La ligne non vide juste au-dessus de ``at`` si elle peut être un libellé « rôle + entreprise » : ni rubrique, ni
    période, ni déjà lue, et qui se découpe en deux morceaux. Sinon ``None`` (rien n'est deviné)."""
    cursor = at - 1
    while cursor >= 0 and not lines[cursor].strip():
        cursor -= 1
    if cursor < 0 or cursor in used:
        return None
    candidate = lines[cursor]
    if _PERIOD.search(candidate) or _heading_kind(candidate) or _split_label(candidate.strip(" ()")) is None:
        return None
    return cursor


def read_experience_lines(text: str) -> list[tuple[str, str]]:
    """Les expériences ÉCRITES sous la rubrique d'expériences : ``[(ligne_au_format_fermé, ligne_source), …]``.

    La ligne source est le texte du CV qui porte l'expérience (sa citation). Vide quand le CV n'a pas de rubrique
    d'expériences ou que ses lignes ne se découpent pas sans ambiguïté."""
    lines = (text or "").splitlines()
    results: list[tuple[str, str]] = []
    inside = False
    index = 0
    used: set[int] = set()  # lignes déjà lues comme libellé : la période seule d'après ne les reprend pas
    while index < len(lines):
        raw = lines[index]
        index += 1
        kind = _heading_kind(raw)
        if kind is not None:
            inside = kind == "start"
            continue
        if not inside:
            continue
        match = _PERIOD.search(raw)
        if not match:
            continue
        label = (raw[: match.start()] + " " + raw[match.end() :]).strip()
        source = raw.strip()
        if not label.strip(" -–—|,:;()"):
            # La période est seule sur sa ligne. #4401.2 — mise en page courante : le libellé est la ligne
            # d'AU-DESSUS (« Développeur – Doctolib » puis « 03/2021 – Présent ») quand elle n'a pas déjà servi
            # de libellé ; sinon (période en tête) c'est la ligne suivante.
            label_index = _previous_label_index(lines, index - 1, used)
            if label_index is not None:
                label = lines[label_index]
                source = f"{label.strip()}\n{raw.strip()}"
                used.add(label_index)
            else:
                following = next((candidate for candidate in lines[index : index + 1] if candidate.strip()), "")
                if not following.strip() or _PERIOD.search(following) or _heading_kind(following):
                    continue
                label = following
                source = f"{raw.strip()}\n{following.strip()}"
                used.add(index)
                index += 1
        pair = _split_label(label.strip(" ()"))
        if pair is None:
            continue
        role, company = pair
        start = _bound(match.group(1), end=False)
        end = _bound(match.group(2), end=True)
        results.append((f"{role} | {company} | {start} | {end} | ", source))
    return results
