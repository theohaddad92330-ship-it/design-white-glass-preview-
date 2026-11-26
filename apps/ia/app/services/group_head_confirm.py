"""#3917 — confirmer le NOM de la tête de groupe par le registre avant de rattacher quoi que ce soit au groupe.

La cartographie Pappers donne un SIREN et un nom pour la tête ; le registre (Sirene) est l'arbitre du nom
attaché à ce SIREN. Trois issues, jamais un nom deviné :

- le registre est muet (pas de clé, panne, SIREN inconnu) → l'affiliation reste telle quelle (no-op strict) ;
- le registre nomme la même entité → son nom devient le nom canonique ;
- le registre nomme une AUTRE entité → pas de tête (``None``) : « Filiale de X » n'est pas affiché.
"""

from __future__ import annotations

import re
import unicodedata

from app.services.insee_sirene import InseeUniteLegale
from app.services.pappers.models import GroupAffiliation

# Formes juridiques et mots vides : elles ne distinguent pas deux entités.
_NOISE = frozenset(
    {
        "sa",
        "sas",
        "sasu",
        "sarl",
        "eurl",
        "sca",
        "snc",
        "se",
        "societe",
        "anonyme",
        "de",
        "du",
        "des",
        "la",
        "le",
        "les",
        "et",
        "groupe",
    }
)


def _tokens(name: str | None) -> frozenset[str]:
    text = unicodedata.normalize("NFKD", name or "").encode("ascii", "ignore").decode().lower()
    return frozenset(t for t in re.split(r"[^a-z0-9]+", text) if t and t not in _NOISE)


def confirm_group_head(affiliation: GroupAffiliation, registry: InseeUniteLegale | None) -> GroupAffiliation | None:
    """L'affiliation dont le nom de tête est confirmé par ``registry`` (l'unité légale du SIREN de tête)."""
    if affiliation.role != "filiale" or registry is None or not registry.denomination:
        return affiliation
    registry_tokens = _tokens(registry.denomination)
    if not registry_tokens:
        return affiliation
    if affiliation.head_name and _tokens(affiliation.head_name) != registry_tokens:
        return None
    return affiliation.model_copy(update={"head_name": registry.denomination})
