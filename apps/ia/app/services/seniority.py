"""Séniorité recherchée par une offre d'emploi — #3097, call bêta Apricot Labs
(24/09/2026).

> « Cibler des comptes par séniorité recherchée (la boîte cherche des
> juniors, pour tel TJM…). »

Zéro LLM : le TITRE de l'offre prime quand il la dit explicitement
(« Junior », « Senior », « Stagiaire »…) ; sinon le niveau d'expérience
CHIFFRÉ que la source affiche (France Travail `experienceLibelle`, ex.
« Expérience exigée de 3 An(s) ») tranche par seuil. Silence sur les deux ⇒
`None` — jamais deviné (doctrine : « non mesuré » n'est jamais un niveau
affirmé).

Seuils repris du découpage marché usuel (ESN / cabinets de recrutement IT
France) : < 2 ans junior, 2 à 5 ans confirmé, > 5 ans senior.
"""

from __future__ import annotations

import re

from app.services.text_norm import normalize_name

_JUNIOR_TITLE_MARKERS = ("junior", "debutant", "stagiaire", "stage", "alternant", "alternance")
_SENIOR_TITLE_MARKERS = ("senior", "lead", "principal", "expert")
_CONFIRME_TITLE_MARKERS = ("confirme",)

_NO_EXPERIENCE_MARKERS = ("debutant accepte", "sans experience")
_YEARS_RE = re.compile(r"(\d+)\s*an")


def derive_seniority(title: str | None, experience: str | None) -> str | None:
    """`junior` / `confirme` / `senior`, seulement quand le titre ou le niveau
    d'expérience affiché le dit. Le TITRE, plus explicite, est vérifié en
    premier — il ne se laisse jamais contredire par un chiffre d'expérience
    générique posé à côté."""
    normalized_title = normalize_name(title)
    if normalized_title:
        if any(marker in normalized_title for marker in _JUNIOR_TITLE_MARKERS):
            return "junior"
        if any(marker in normalized_title for marker in _SENIOR_TITLE_MARKERS):
            return "senior"
        if any(marker in normalized_title for marker in _CONFIRME_TITLE_MARKERS):
            return "confirme"

    normalized_experience = normalize_name(experience)
    if not normalized_experience:
        return None
    if any(marker in normalized_experience for marker in _NO_EXPERIENCE_MARKERS):
        return "junior"
    years = _YEARS_RE.search(normalized_experience)
    if not years:
        return None
    value = int(years.group(1))
    if value < 2:
        return "junior"
    if value <= 5:
        return "confirme"
    return "senior"


__all__ = ["derive_seniority"]
