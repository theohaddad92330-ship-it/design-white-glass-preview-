"""#2616.1 — table de vérité UNIQUE des plateformes d'offres d'emploi
publiques (GA-26 : un réglage vit à un seul endroit).

Avant ce fichier, ``discover_signals._corroborate_hiring_platforms`` tenait sa
propre table ``_JOB_PLATFORM_LABELS`` (wttj/greenhouse/lever) — celle-ci la
REMPLACE et l'étend aux ATS publics que ``job_search.py`` interroge en plus
(Teamtailor, SmartRecruiters, Welcomekit). Un libellé humain de plateforme
n'est JAMAIS un fournisseur À NOUS (GA-44) : ce sont les outils que
l'entreprise CIBLE utilise pour publier ses offres, au même titre que
« France Travail » ou « APEC ».

``platform_from_url``/``company_from_url`` lisent uniquement le DOMAINE et le
SLUG PUBLIC que l'entreprise elle-même publie dans son URL d'offre — même
doctrine d'attribution que ``ats_boards.py`` (« on n'attribue que sur
PREUVE ») : un domaine non reconnu ne rattache RIEN au hasard, et un slug
absent ne devine JAMAIS un nom d'entreprise.
"""

from __future__ import annotations

import re
from urllib.parse import urlsplit

#: Libellé humain par jeton de plateforme — la SEULE table de ce genre dans le
#: dépôt (voir le docstring du module).
JOB_PLATFORM_LABELS: dict[str, str] = {
    "wttj": "Welcome to the Jungle",
    "greenhouse": "Greenhouse",
    "lever": "Lever",
    "teamtailor": "Teamtailor",
    "smartrecruiters": "SmartRecruiters",
    "welcomekit": "Welcomekit",
}

#: (domaine, jeton) — un domaine inconnu de cette liste ne rattache RIEN.
_HOST_TOKENS: tuple[tuple[str, str], ...] = (
    ("welcometothejungle.com", "wttj"),
    ("jobs.lever.co", "lever"),
    ("boards.greenhouse.io", "greenhouse"),
    ("teamtailor.com", "teamtailor"),
    ("jobs.smartrecruiters.com", "smartrecruiters"),
    ("welcomekit.co", "welcomekit"),
)


def platform_from_url(url: str | None) -> str | None:
    """Le jeton de plateforme (``"wttj"``, ``"lever"``…) déduit du DOMAINE de
    l'URL — jamais du texte. ``None`` sur un domaine non reconnu : du bruit
    hors périmètre, jamais rattaché à une plateforme au hasard."""
    host = (urlsplit(str(url or "")).hostname or "").lower()
    if not host:
        return None
    for pattern, token in _HOST_TOKENS:
        if host == pattern or host.endswith("." + pattern):
            return token
    return None


def _slug_to_name(slug: str) -> str | None:
    """Un slug d'URL public → un libellé lisible, DÉTERMINISTE (jamais un nom
    deviné) : CamelCase éclaté, séparateurs en espaces, mots capitalisés — la
    résolution SIREN en aval (``resolve_company_identity``) affine ou corrige
    ce libellé, exactement comme pour toute autre ligne du bucket ``hiring``."""
    raw = (slug or "").strip()
    if not raw:
        return None
    spaced = re.sub(r"(?<=[a-z0-9])(?=[A-Z])", " ", raw)
    spaced = re.sub(r"[-_]+", " ", spaced)
    words = [w for w in spaced.split() if w]
    if not words:
        return None
    return " ".join(w if w.isupper() and len(w) <= 4 else w.capitalize() for w in words)


def company_from_url(url: str | None, platform: str | None = None) -> str | None:
    """Le nom d'employeur déduit du SLUG que l'URL de l'offre porte —
    l'entreprise elle-même publie ce slug. ``None`` quand l'URL ne porte pas
    un slug exploitable (rien à prospecter, on n'invente pas)."""
    token = platform or platform_from_url(url)
    if not token:
        return None
    parts = urlsplit(str(url or ""))
    segments = [s for s in parts.path.split("/") if s]
    slug: str | None = None
    if token in ("wttj", "welcomekit"):
        if "companies" in segments:
            i = segments.index("companies")
            if i + 1 < len(segments):
                slug = segments[i + 1]
    elif token in ("lever", "greenhouse", "smartrecruiters"):
        slug = segments[0] if segments else None
    elif token == "teamtailor":
        host_parts = (parts.hostname or "").split(".")
        if len(host_parts) > 2 and host_parts[0] not in ("www", "jobs"):
            slug = host_parts[0]
    return _slug_to_name(slug) if slug else None


__all__ = ["JOB_PLATFORM_LABELS", "platform_from_url", "company_from_url"]
