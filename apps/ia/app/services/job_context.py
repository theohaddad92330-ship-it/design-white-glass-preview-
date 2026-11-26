"""Équipe et rattachement hiérarchique d'une offre d'emploi — #3204.2 (épopée
#3238), partie EXTRACTION de LAU-FINAL-210.

> « Pour chaque offre : […] équipe, rattachement. »

Zéro LLM : capture le texte qui suit un MARQUEUR explicite d'appartenance
(« l'équipe X », « the X team ») ou de rattachement (« rattaché(e) au X »,
« reports to X »). Sans marqueur, `None` — un intitulé de poste ne dit pas qui
décide (règle explicite de la spec #3204 : « un intitulé ne suffit pas à
identifier le décideur »), donc jamais deviné hors d'une phrase qui le nomme
textuellement.

La capture est bornée à quelques mots (`_MAX_CAPTURE_WORDS`) pour ne jamais
avaler la phrase entière qui suit le marqueur — une capture longue produirait
un « rattachement » qui est en réalité une phrase de contexte, pas un nom de
fonction ou d'équipe.
"""

from __future__ import annotations

import re

from app.services.text_norm import normalize_name

_MAX_CAPTURE_WORDS = 6
_WORD = r"[a-z0-9]+"
_CAPTURE = rf"((?:{_WORD}[ -]?){{1,{_MAX_CAPTURE_WORDS}}})"

_TEAM_RE = re.compile(rf"(?:au sein de |integrez )?l ?equipe\s+{_CAPTURE}")
_TEAM_EN_RE = re.compile(rf"the {_CAPTURE}team\b")

# Le petit écart `.{0,6}?` avale la forme féminine parenthésée
# (« rattaché(e) au », « rattachée au ») sans lui dédier un marqueur à part.
_REPORTING_PATTERNS = (
    re.compile(rf"rattache.{{0,6}}?(?:au|a la|a l ?)\s+{_CAPTURE}"),
    re.compile(rf"rapporte.{{0,6}}?(?:au|a la|a l ?)\s+{_CAPTURE}"),
    re.compile(rf"sous la responsabilite (?:du|de la|de l ?)\s*{_CAPTURE}"),
    re.compile(rf"reports? to\s+(?:the\s+)?{_CAPTURE}"),
    re.compile(rf"under the supervision of\s+(?:the\s+)?{_CAPTURE}"),
)


def _prepared(*texts: str | None) -> str:
    combined = normalize_name(" ".join(t for t in texts if isinstance(t, str) and t.strip()))
    return " ".join(combined.replace("'", " ").split())


# Un mot de liaison arrête la capture du nom d'ÉQUIPE : sans lui, « l'équipe
# Data au sein de la DSI » capturerait la moitié de la phrase plutôt que le
# seul nom d'équipe. Un intitulé de rattachement (« Head OF Engineering »)
# porte lui-même des mots de liaison légitimes — cette troncature ne s'y
# applique donc pas.
_TEAM_STOPWORDS = {"au", "aux", "a", "de", "du", "des", "dans", "chez", "pour", "sur"}


def _captured(match: re.Match[str] | None, *, stopwords: frozenset[str] = frozenset()) -> str | None:
    if not match:
        return None
    words: list[str] = []
    for word in match.group(1).strip(" -").split():
        if word in stopwords:
            break
        words.append(word)
    captured = " ".join(words)
    return captured or None


def derive_team(*texts: str | None) -> str | None:
    """Le nom de l'équipe, seulement quand un marqueur explicite l'introduit.
    `None` sinon — jamais déduit d'un intitulé de poste seul."""
    text = _prepared(*texts)
    if not text:
        return None
    return _captured(_TEAM_RE.search(text), stopwords=_TEAM_STOPWORDS) or _captured(
        _TEAM_EN_RE.search(text), stopwords=_TEAM_STOPWORDS
    )


def derive_reporting_line(*texts: str | None) -> str | None:
    """La fonction de rattachement hiérarchique, seulement quand un marqueur
    explicite l'introduit (« rattaché au… », « reports to… »). `None` sinon —
    RÈGLE de la spec : un intitulé ne suffit pas à identifier le décideur."""
    text = _prepared(*texts)
    if not text:
        return None
    for pattern in _REPORTING_PATTERNS:
        captured = _captured(pattern.search(text))
        if captured:
            return captured
    return None


# #3204.7 (épopée #3238, reste) — REPLACEMENT_SIGNAL. `hiring_aggregation.py`
# refuse à raison de le déduire d'une simple récurrence d'offres (confondrait
# croissance et remplacement — RÈGLE explicite de la spec). La seule preuve
# honnête est un marqueur EXPLICITE de départ/succession dans le texte de
# CETTE offre, jamais un volume d'offres ni un intitulé seul.
_REPLACEMENT_PATTERNS = (
    # `_prepared` tourne l'apostrophe en espace (« d'un » → « d un ») avant
    # que ces motifs ne s'appliquent — `d` seul couvre donc aussi « d'un ».
    re.compile(r"en remplacement (?:de|du|des|d)\b"),
    re.compile(r"suite (?:au|a la|a l ?)\s*(?:depart|demission|fin de contrat)"),
    re.compile(r"poste (?:vacant|laisse vacant|libere)"),
    re.compile(r"succede (?:au|a la|a l ?)"),
    re.compile(r"remplace le titulaire"),
    re.compile(r"\breplacement for\b"),
    re.compile(r"\bbackfill\b"),
    re.compile(r"due to (?:the )?departure of"),
    re.compile(r"\bvacated position\b"),
)


def derive_replacement_signal(*texts: str | None) -> bool:
    """`True` seulement quand un marqueur EXPLICITE de départ/succession
    introduit l'offre — jamais deviné d'une récurrence d'offres ou d'un
    intitulé seul (RÈGLE de la spec #3204 : « plusieurs recrutements peuvent
    indiquer une croissance, pas un remplacement sans preuve de départ »)."""
    text = _prepared(*texts)
    if not text:
        return False
    return any(pattern.search(text) for pattern in _REPLACEMENT_PATTERNS)


__all__ = ["derive_replacement_signal", "derive_reporting_line", "derive_team"]
