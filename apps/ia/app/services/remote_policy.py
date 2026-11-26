"""Politique de télétravail d'une offre d'emploi — #3096, call bêta Apricot
Labs (24/09/2026).

> « Cibler les comptes sur des critères liés au consultant, avec des tags full
> remote, pour qu'une ESN dont les consultants travaillent à distance sache
> vers quels comptes aller. »

Zéro LLM, zéro appel réseau : lit le TEXTE déjà présent sur un signal `hiring`
de Découvrir (`label` + `detail`, déjà moissonnés par France Travail / APEC /
WTTJ) et cherche une mention EXPLICITE de la politique de télétravail. Les
quatre valeurs du produit sont `sur_site | hybride | full_remote | indifferent`
(`mission.remote_preference`, `project_need.remote`, GA-26) ; `indifferent` est
une préférence de CANDIDAT, jamais une politique d'EMPLOYEUR, donc absente ici.

Sans mention explicite, le résultat est `None` — jamais `sur_site` par défaut
(doctrine : « non mesuré » n'est jamais « 0 », un silence n'est jamais un fait).
"""

from __future__ import annotations

from app.services.text_norm import normalize_name

# FR + EN (+ DE / ES, #4736), normalisés (minuscules, sans accents) comme le texte scanné.
_FULL_REMOTE_MARKERS = (
    "full remote",
    "100% remote",
    "100% teletravail",
    "teletravail total",
    "teletravail integral",
    "tout teletravail",
    "entierement a distance",
    "full teletravail",
    "remote first",
    "work from anywhere",
    # #4736 lot G — DE / ES / GB. « Homeoffice » ou « teletrabajo » seuls ne disent
    # PAS full remote : seuls les marqueurs TOTAUX figurent ici.
    "fully remote",
    "remote-first",
    "100 % remote",
    "vollstandig remote",
    "komplett remote",
    "100% remoto",
    "100 % remoto",
    "totalmente remoto",
    "teletrabajo total",
    "teletrabajo 100",
)
_HYBRID_MARKERS = (
    "hybride",
    "teletravail partiel",
    "hybrid working",
    "hybrid work",
    "hybrid model",
    "hybrides arbeiten",
    "hybrides modell",
    "teilweise homeoffice",
    "hibrido",
    "teletrabajo parcial",
)
_ONSITE_MARKERS = (
    "sur site",
    "presentiel obligatoire",
    "100% presentiel",
    "aucun teletravail",
    "pas de teletravail",
    "kein homeoffice",
    "100% presencial",
    "sin teletrabajo",
)


def derive_remote_policy(*texts: str | None) -> str | None:
    """`full_remote` / `hybride` / `sur_site`, seulement si le texte le DIT.

    L'ordre de vérification (full remote → hybride → sur site) départage un
    texte qui nommerait plusieurs marqueurs à la fois — le plus SPÉCIFIQUE
    (« télétravail total ») l'emporte sur un mot plus générique.
    """
    combined = normalize_name(" ".join(t for t in texts if isinstance(t, str) and t.strip()))
    if not combined:
        return None
    if any(marker in combined for marker in _FULL_REMOTE_MARKERS):
        return "full_remote"
    if any(marker in combined for marker in _HYBRID_MARKERS):
        return "hybride"
    if any(marker in combined for marker in _ONSITE_MARKERS):
        return "sur_site"
    return None


__all__ = ["derive_remote_policy"]
