"""Famille métier d'une offre d'emploi — #3204.2 (épopée #3238), partie
EXTRACTION de LAU-FINAL-210.

> « Pour chaque offre : […] famille métier. »

Zéro LLM : le TITRE de l'offre (`signal.label`) est classé dans une famille
métier fermée par des marqueurs FR+EN explicites — même geste que
`seniority.py` (le titre prime, jamais un texte générique). Une offre dont le
titre ne nomme aucune famille reconnue rend `None` — « non classé » n'est
jamais une famille par défaut (doctrine : un non-mesuré n'est jamais affirmé).

L'ordre de vérification ci-dessous départage un titre qui nommerait plusieurs
familles à la fois (« Lead Data Engineer » relève de `data_ia`, vérifié avant
`developpement` générique) — le plus SPÉCIFIQUE l'emporte, même logique que
`remote_policy.derive_remote_policy`.
"""

from __future__ import annotations

from app.services.text_norm import normalize_name

JobFamily = str

# (famille, marqueurs) — ORDONNÉ du plus spécifique au plus générique.
_FAMILY_MARKERS: tuple[tuple[str, tuple[str, ...]], ...] = (
    (
        "data_ia",
        (
            "data engineer",
            "data scientist",
            "data analyst",
            "machine learning",
            "intelligence artificielle",
            "ingenieur donnees",
            "analytics engineer",
            "mlops",
        ),
    ),
    (
        "infrastructure_cloud",
        (
            "devops",
            "sre",
            "ingenieur infrastructure",
            "ingenieur systeme",
            "administrateur systeme",
            "cloud engineer",
            "ingenieur reseau",
            "sysadmin",
        ),
    ),
    (
        "cybersecurite",
        ("cybersecurite", "pentester", "rssi", "security engineer", "soc analyst"),
    ),
    (
        "produit_design",
        ("product owner", "product manager", "ux designer", "ui designer", "product design"),
    ),
    (
        "qualite_test",
        ("qa engineer", "testeur", "ingenieur qualite", "quality engineer"),
    ),
    (
        "developpement",
        (
            "developpeur",
            "developpeuse",
            "ingenieur logiciel",
            "software engineer",
            "full stack",
            "fullstack",
            "backend",
            "frontend",
            "back end",
            "front end",
        ),
    ),
    (
        "direction_management",
        (
            "directeur",
            "directrice",
            "chief technology officer",
            "cto",
            "responsable technique",
            "engineering manager",
            # #4437.5 — « Resp. SI » : le responsable du système d'information (abréviation étendue ci-dessous).
            "responsable si",
            "responsable systeme d information",
            "responsable des systemes d information",
            "dsi",
        ),
    ),
    (
        "commercial_marketing",
        ("commercial", "business developer", "account executive", "responsable marketing"),
    ),
)


#: #4437.5 — les abréviations courantes d'un intitulé libre, étendues AVANT de chercher un marqueur. Elles ne
#: posent jamais une famille seules : « Resp. transverse » reste muet, seul le marqueur complet classe.
_ABBREVIATIONS: dict[str, str] = {"resp": "responsable", "dev": "developpeur", "ing": "ingenieur"}


def _expand_abbreviations(normalized_title: str) -> str:
    tokens = [token.strip(".,;:()") or token for token in normalized_title.split()]
    return " ".join(_ABBREVIATIONS.get(token, token) for token in tokens)


def derive_job_family(title: str | None) -> JobFamily | None:
    """La famille métier, seulement quand le TITRE la nomme explicitement.
    `None` sinon — jamais une famille devinée d'un intitulé muet."""
    normalized_title = _expand_abbreviations(normalize_name(title))
    if not normalized_title:
        return None
    for family, markers in _FAMILY_MARKERS:
        if any(marker in normalized_title for marker in markers):
            return family
    return None


def job_families() -> frozenset[str]:
    """#4437 — la liste FERMÉE des familles (le référentiel de rattachement du texte libre)."""
    return frozenset(family for family, _ in _FAMILY_MARKERS)


__all__ = ["JobFamily", "derive_job_family", "job_families"]
