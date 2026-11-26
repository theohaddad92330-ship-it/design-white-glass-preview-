"""#4401 (N4) — LES COORDONNÉES D'UN CV, LUES DANS LE TEXTE BRUT, SANS MODÈLE.

Mesuré en recette prod (21/10) : un CV simple donnait AUCUNE coordonnée. Le modèle ne rendait pas toujours
le bloc ``identity`` avec une citation retrouvable, et ``_validate_fields`` le jetait. Or un e-mail, un
téléphone et une URL LinkedIn ont une FORME qui se reconnaît sans deviner : les lire dans le document n'est
pas inventer, la valeur lue est sa propre citation.

Le NOM est plus fragile : il se prend dans la première ligne qui ressemble à « Prénom NOM » (ou « NOM
Prénom »), sinon il reste vide — l'appelant le DIT (``identity_gaps``), jamais un nom approché.
"""

from __future__ import annotations

import re
import unicodedata

_EMAIL = re.compile(r"[A-Za-z0-9._%+\-]+@[A-Za-z0-9\-]+(?:\.[A-Za-z0-9\-]+)*\.[A-Za-z]{2,}")
# Un candidat téléphone : « + » ou « ( » ou chiffre en tête, groupes de chiffres séparés par espace . - ( ) — jamais par un saut de ligne (#4401.2 : « 06 12 34 56 78\n75011 »).
_PHONE_CANDIDATE = re.compile(r"(?<![\w/+.-])(?:\+|00|\(\+)?[\d(][\d \t().\-]{7,}\d(?![\w@])")
# #4401.3 — les espaces que rendent l'OCR et les PDF mis en page (insécable, fine, demi-cadratin…) valent l'espace simple.
_UNICODE_SPACES = re.compile(r"[\u00a0\u1680\u2000-\u200a\u202f\u205f\u3000]")
_LINKEDIN = re.compile(r"(?:https?://)?(?:[a-z]{2,3}\.)?linkedin\.com/(?:in|pub)/[^\s,;|)<>\"']+", re.IGNORECASE)

# #4401.2 — une ville ne se cite sans deviner qu'accolée à un CODE (miroir de ``readLocationFromIdentity``,
# ``@bellum/contracts``) : « 75011 Paris » ou « Paris (75) ». Une ville nue n'a aucune forme qui la distingue.
_CITY_WORD = r"[A-ZÀ-Ý][A-Za-zÀ-ÿ'’\-]*"
_CITY_WITH_POSTCODE = re.compile(rf"(?<!\d)\d{{5}}(?!\d)[ \t]+{_CITY_WORD}(?:[ \t]+{_CITY_WORD}){{0,3}}")
_CITY_WITH_DEPARTMENT = re.compile(rf"{_CITY_WORD}(?:[ \t]+[A-Za-zÀ-ÿ'’\-]+){{0,3}}[ \t]*\(\d{{2,3}}\)")
_CITY_SCAN_LINES = 25

_PHONE_MIN_DIGITS = 9
_PHONE_MAX_DIGITS = 15

_NAME_SCAN_LINES = 15
_NAME_MAX_CHARS = 45
_NAME_PARTICLES = frozenset({"de", "du", "des", "la", "le", "van", "von", "der", "den", "di", "da", "d'", "el", "al"})
_NAME_TOKEN = re.compile(r"^[A-ZÀ-ÖØ-Ý][A-Za-zÀ-ÖØ-öø-ÿ'’\-]*$")
# Mots qui disent « ce n'est pas un nom » : titres de CV, métiers, rubriques, lieux courants.
_NOT_A_NAME = frozenset(
    "curriculum vitae cv resume profil profile ingenieur ingenieure consultant consultante developpeur developpeuse "
    "chef projet responsable architecte expert experte data cyber securite analyste directeur directrice technique "
    "competences competence experience experiences formation formations langues langue outils centres interet "
    "interets coordonnees contact contacts paris lyon marseille toulouse bordeaux lille nantes france senior junior "
    "manager engineer developer software cloud devops fullstack full stack freelance independant disponible "
    "mission missions parcours professionnel professionnelle objectif page".split()
)


def _ascii_lower(text: str) -> str:
    return unicodedata.normalize("NFKD", text or "").encode("ascii", "ignore").decode().lower()


def _read_phone(text: str) -> str | None:
    for match in _PHONE_CANDIDATE.finditer(_UNICODE_SPACES.sub(" ", text)):
        raw = match.group(0).strip()
        digits = re.sub(r"\D", "", raw)
        if not _PHONE_MIN_DIGITS <= len(digits) <= _PHONE_MAX_DIGITS:
            continue
        # Un numéro commence par « + », « 00 » ou « 0 » : « 2019-2024 », « 12 345 678 » n'en sont pas.
        if not (raw.startswith(("+", "00", "0", "(0", "(+")) or digits.startswith("0")):
            continue
        if re.fullmatch(r"\d{4}\s*[-–]\s*\d{4}", raw):
            continue
        return raw.rstrip(" .-")
    return None


def read_contact_facts(text: str) -> dict[str, str | None]:
    """L'e-mail, le téléphone (formats FR et internationaux) et l'URL LinkedIn ÉCRITS dans le texte —
    le premier de chaque, tel qu'écrit. ``None`` quand le texte n'en porte pas : rien n'est deviné."""
    email = _EMAIL.search(text or "")
    linkedin = _LINKEDIN.search(text or "")
    return {
        "email": email.group(0) if email else None,
        "phone": _read_phone(text or ""),
        "linkedin": linkedin.group(0).rstrip(".,;") if linkedin else None,
    }


#: #4401.1 — une civilité devant le nom n'en fait pas partie (« M. Jean DUPONT », « Mme Claire Martin »).
_CIVILITY = re.compile(r"^(?:m\.?|mr\.?|mme\.?|mlle\.?|monsieur|madame|mademoiselle|dr\.?|docteur)\s+", re.IGNORECASE)
#: #4401.1 — le nom suivi du poste sur la même ligne : on garde ce qui précède le premier séparateur.
_TITLE_SEPARATOR = re.compile(r"\s+[-–—|·•]\s+|\s*[|,]\s*")
#: #4401.1 — champs étiquetés (« Nom : Dupont », « Prénom : Jean », « Nom et prénom : Jean Dupont »).
_LABELLED = re.compile(r"^(nom et pr[ée]nom|pr[ée]nom et nom|pr[ée]nom|nom)\s*:\s*(.*)$", re.IGNORECASE)


def _plausible_name(line: str) -> str | None:
    """``line`` si elle ressemble à « Prénom NOM » (2 à 4 mots), sinon ``None``."""
    line = line.strip(" \t•·-–—|*#")
    if (
        not line
        or len(line) > _NAME_MAX_CHARS
        or any(char.isdigit() for char in line)
        or any(c in line for c in "@:/(),;")
    ):
        return None
    tokens = line.split()
    if not 2 <= len(tokens) <= 4:
        return None
    if any(_ascii_lower(token).strip("'’-") in _NOT_A_NAME for token in tokens):
        return None
    parts_ok = [
        bool(_NAME_TOKEN.match(token)) or (0 < index < len(tokens) - 1 and token in _NAME_PARTICLES)
        for index, token in enumerate(tokens)
    ]
    return line if all(parts_ok) else None


def _labelled_name(lines: list[str]) -> str | None:
    """« Prénom : Jean » + « Nom : Dupont » (dans un ordre ou l'autre) ou « Nom et prénom : Jean Dupont »."""
    first = last = None
    for line in lines:
        match = _LABELLED.match(line.strip(" \t•·-–—|*#"))
        if not match:
            continue
        label, value = _ascii_lower(match.group(1)), " ".join(match.group(2).split())
        if not value or any(char.isdigit() for char in value) or "@" in value:
            continue
        if label in ("nom et prenom", "prenom et nom"):
            return _plausible_name(value)
        if label == "prenom":
            first = value
        else:
            last = value
    if first and last:
        return _plausible_name(f"{first} {last}")
    return None


def guess_name(text: str) -> str | None:
    """La première ligne qui ressemble à « Prénom NOM » dans l'en-tête du texte, ou ``None``.

    #4401.1 — civilité retirée, poste de la même ligne ignoré, champs étiquetés lus : jamais un nom approché."""
    lines = (text or "").splitlines()
    labelled = _labelled_name([line for line in lines if line.strip()][:_NAME_SCAN_LINES])
    if labelled:
        return labelled
    seen = 0
    for raw_line in lines:
        line = raw_line.strip(" \t•·-–—|*#")
        if not line:
            continue
        seen += 1
        if seen > _NAME_SCAN_LINES:
            return None
        line = _CIVILITY.sub("", line)
        for candidate in (line, _TITLE_SEPARATOR.split(line, maxsplit=1)[0]):
            if name := _plausible_name(candidate):
                return name
    return None


def read_city(text: str) -> str | None:
    """#4401.2 — la ville ÉCRITE dans l'en-tête, à sa forme codée (« 75011 Paris », « Paris (75) »), ou ``None``.

    Seules les premières lignes sont lues : un code postal du corps (le site d'un client) n'est pas l'adresse de
    la personne. Une ville nue reste ``None`` — rien n'est interprété."""
    seen = 0
    for raw_line in (text or "").splitlines():
        line = raw_line.strip()
        if not line:
            continue
        seen += 1
        if seen > _CITY_SCAN_LINES:
            return None
        for pattern in (_CITY_WITH_POSTCODE, _CITY_WITH_DEPARTMENT):
            match = pattern.search(line)
            if match:
                return match.group(0).strip()
    return None
