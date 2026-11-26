"""Prestataire tiers mentionné dans une offre d'emploi — #3205.1 (épopée
#3239), la tranche « offres d'emploi mentionnant un fournisseur » de
LAU-FINAL-211.

> « SOURCES POSSIBLES : […] offres d'emploi mentionnant un fournisseur. »

Zéro LLM, zéro appel réseau : lit le TEXTE déjà moissonné (`label` + `detail`
d'un signal `hiring`, France Travail / APEC / WTTJ) et cherche une mention
EXPLICITE d'un partenariat/prestataire, FR+EN (« en partenariat avec X »,
« aux côtés de X », « with our partner X »). Le nom capturé est exactement
celui ÉCRIT sur l'offre — jamais un nom deviné ou complété — même règle que
`official_directory.py` : « une personne n'est retenue que si son nom ET sa
fonction sont écrits textuellement ».

Ce module ne couvre QU'UNE des sources possibles nommées par la spec
(crédits de site, mentions légales, sous-domaines et pages partenaires
restent hors de ce lot : ils supposent un scrape ciblé neuf, à cadrer sur le
budget Firecrawl existant avant d'écrire la première ligne — voir l'épopée).
"""

from __future__ import annotations

import re

from app.services.text_norm import normalize_name

_MAX_CAPTURE_WORDS = 5
_WORD = r"[a-z0-9]+"
_CAPTURE = rf"((?:{_WORD}[ .-]?){{1,{_MAX_CAPTURE_WORDS}}})"

# FR + EN — un marqueur de PARTENARIAT, jamais un marqueur de client final
# (« pour notre client X » nommerait l'EMPLOYEUR, pas un tiers).
_PARTNER_MARKERS = (
    r"en partenariat avec",
    r"aux cotes de (?:notre partenaire|nos partenaires)?",
    r"en collaboration avec",
    r"avec notre partenaire",
    r"with our partner",
    r"alongside our partner",
    r"in partnership with",
)

# Un mot de liaison arrête la capture du NOM : sans lui, « Sopra Steria sur ce
# projet » capturerait la fin de la phrase plutôt que le seul nom du tiers.
_STOPWORDS = {"sur", "pour", "dans", "au", "aux", "de", "du", "des", "on", "for", "in", "at"}


def derive_third_party_provider_mention(*texts: str | None) -> str | None:
    """Le nom du prestataire tiers, seulement quand un marqueur de
    partenariat explicite l'introduit. `None` sinon — jamais deviné hors
    d'une phrase qui le nomme textuellement."""
    combined = normalize_name(" ".join(t for t in texts if isinstance(t, str) and t.strip()))
    if not combined:
        return None
    text = " ".join(combined.replace("'", " ").split())
    for marker in _PARTNER_MARKERS:
        match = re.search(marker + rf"\s+{_CAPTURE}", text)
        if not match:
            continue
        words: list[str] = []
        for word in match.group(1).strip(" .-").split():
            if word in _STOPWORDS:
                break
            words.append(word)
        captured = " ".join(words)
        if captured:
            return captured
    return None


__all__ = ["derive_third_party_provider_mention"]
