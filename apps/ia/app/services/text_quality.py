"""#3935 (12/10) — la QUALITÉ du texte extrait d'un CV, évaluée et réparée.

Mesuré en prod : pypdf rend certains CV PDF lettre à lettre (« L a m i s\\nM O U
L O U D J »). Le texte n'est pas vide, donc ni l'OCR ni le repli « Claude lit le
PDF » ne partaient — et le modèle de lecture n'en tirait rien (fiche
« incomplète », champs vides). La qualité n'était JAMAIS jugée.

Ce module est PUR (aucun réseau, aucune dépendance de service) :

- :func:`assess_text_quality` — un score 0..1 et les RAISONS nommées ;
- :func:`repair_letter_spacing` — recolle de façon déterministe ;
- :func:`pdf_page_count` — le dénominateur de la densité par page.

L'orchestration (réparation d'abord, repli ensuite, le meilleur au score est
gardé) vit dans `routers/cv.py` ; le journal dit la VOIE et la LONGUEUR, jamais
le contenu d'un CV.
"""

from __future__ import annotations

import io
import re
from dataclasses import dataclass, field

from pypdf import PdfReader

#: Part de tokens d'UNE seule lettre au-delà de laquelle le texte est espacé
#: lettre à lettre. Une prose française en contient ~5-10 % (« a », « à », « y »,
#: « l' » éclaté) ; un CV espacé en contient > 60 %. 35 % sépare les deux avec
#: une grande marge.
SPACED_TOKEN_RATIO_MAX = 0.35

#: Sous ce nombre de tokens, le ratio ne veut rien dire (un titre court).
SPACED_MIN_TOKENS = 15

#: Densité minimale par page. Une page de CV porte 1 500 à 3 000 caractères ;
#: sous 300, la page est quasi vide (calque texte partiel, scan mal reconnu).
MIN_CHARS_PER_PAGE = 300

#: Part de caractères non lisibles (U+FFFD, `(cid:N)`, contrôles) tolérée.
#: Un CV propre en a 0 ; 5 % suffit déjà à casser des noms propres.
UNREADABLE_RATIO_MAX = 0.05

#: Une ligne est « espacée » si au moins cette part de ses tokens est d'1 caractère…
_LINE_SPACED_RATIO = 0.7
#: … et qu'elle en compte au moins autant (« J a » reste en l'état : ambigu).
_LINE_MIN_TOKENS = 3

_CID_TOKEN = re.compile(r"\(cid:\d+\)")
_WORD_GAP = re.compile(r"[ \t\u00a0]{2,}")

REASON_SPACED = "lettre_a_lettre"
REASON_SPARSE = "quasi_vide"
REASON_UNREADABLE = "illisible"


@dataclass(frozen=True)
class TextQuality:
    #: 1.0 = propre ; sert à choisir le MEILLEUR de deux textes.
    score: float
    reasons: list[str] = field(default_factory=list)


def is_acceptable(quality: TextQuality) -> bool:
    return not quality.reasons


def assess_text_quality(text: str, pages: int | None = None) -> TextQuality:
    """Juge un texte extrait. ``pages`` (si connu) ouvre le critère de densité."""
    reasons: list[str] = []
    penalties = [0.0]

    tokens = text.split()
    if len(tokens) >= SPACED_MIN_TOKENS:
        single = sum(1 for token in tokens if len(token) == 1 and token.isalpha())
        ratio = single / len(tokens)
        if ratio > SPACED_TOKEN_RATIO_MAX:
            reasons.append(REASON_SPACED)
            penalties.append(ratio)

    compact = "".join(text.split())
    if compact:
        bad = sum(len(m) for m in _CID_TOKEN.findall(compact))
        bad += sum(1 for ch in compact if ch == "�" or (ord(ch) < 32 and ch not in "\t\n\r"))
        unreadable = bad / len(compact)
        if unreadable > UNREADABLE_RATIO_MAX:
            reasons.append(REASON_UNREADABLE)
            penalties.append(min(1.0, unreadable * 5))

    if pages and pages > 0:
        per_page = len(compact) / pages
        if per_page < MIN_CHARS_PER_PAGE:
            reasons.append(REASON_SPARSE)
            penalties.append(1.0 - per_page / MIN_CHARS_PER_PAGE)
    elif not compact:
        reasons.append(REASON_SPARSE)
        penalties.append(1.0)

    return TextQuality(score=max(0.0, 1.0 - max(penalties)), reasons=reasons)


def _repair_line(line: str) -> str:
    tokens = line.split()
    if len(tokens) < _LINE_MIN_TOKENS:
        return line
    singles = sum(1 for token in tokens if len(token) == 1)
    if singles / len(tokens) < _LINE_SPACED_RATIO:
        return line
    # UN espace entre lettres = un mot ; 2+ espaces = séparation de mots.
    words: list[str] = []
    for group in _WORD_GAP.split(line.strip()):
        glued = ""
        parts: list[str] = []
        for token in group.split():
            if len(token) == 1:
                glued += token
            else:
                if glued:
                    parts.append(glued)
                    glued = ""
                parts.append(token)
        if glued:
            parts.append(glued)
        words.append(" ".join(parts))
    return " ".join(word for word in words if word)


def repair_letter_spacing(text: str) -> str:
    """Recolle les lignes espacées lettre à lettre ; toute autre ligne est
    rendue INTACTE (un texte propre ressort byte-identique)."""
    return "\n".join(_repair_line(line) for line in text.split("\n"))


def pdf_page_count(data: bytes) -> int | None:
    """Nombre de pages d'un PDF, ``None`` s'il ne se compte pas."""
    try:
        return len(PdfReader(io.BytesIO(data)).pages) or None
    except Exception:  # noqa: BLE001 — un PDF qu'on ne sait pas compter n'est pas jugé en densité
        return None
