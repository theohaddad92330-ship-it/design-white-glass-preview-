"""#2297 — le catalogue des champs interdits, côté service IA.

Décision Louis 19/09/2026 (QCM, point 2) : le catalogue qui filtre
l'enrichissement de contacts s'applique AUSSI à la collecte de la phase 2
(`app/routers/phase2_contacts.py`). UN seul catalogue : il vit dans
`packages/contracts/src/schemas/enrichment-compliance.ts`
(`ENRICHMENT_FORBIDDEN_FIELDS`, chaque entrée avec sa raison). Ce service ne
peut pas importer du TypeScript, il en porte donc un MIROIR — les CLÉS seules,
dans l'ordre du contrat — et `tests/test_enrichment_compliance.py` relit le
contrat et rougit à la moindre divergence (même garde que `esn_naf.py` et
`tool-naming.ts`). Pour ajouter ou retirer une clé : le contrat d'abord, puis
ici.

Ce n'est pas le seul rempart : l'API applique le MÊME catalogue à l'entrée de
`ContactsService.bulkInsert`, et c'est elle qui tient la base quoi qu'on lui
envoie. Ce filtre-ci garantit que rien du catalogue ne quitte la phase 2 — ni
vers l'API, ni vers une phase suivante qui lirait les graines.

⚠️ La PHOTO n'y est pas : hors catalogue par décision Louis du 19/09/2026
(doctrine c58 — une photo s'affiche sur une fiche, elle n'ordonne pas des gens).
"""

from __future__ import annotations

import re
from typing import Any

#: Miroir de `ENRICHMENT_FORBIDDEN_FIELDS[*].keys`, aplati, dans l'ordre du contrat.
ENRICHMENT_FORBIDDEN_KEYS: tuple[str, ...] = (
    # age
    "age",
    "birth_date",
    "date_of_birth",
    "birth_year",
    "birthday",
    # gender
    "gender",
    "sex",
    "civility",
    # origin
    "ethnicity",
    "nationality",
    "nationalite",
    "race",
    # marital_status
    "marital_status",
    "situation_familiale",
    # religion
    "religion",
    # personal_address
    "address",
    "home_address",
    "personal_address",
    "postal_address",
    "street_address",
    # personal_phone — #2297.55, le mobile professionnel (#2297.8) reste permis
    "personal_phone",
    "personal_mobile",
    "home_phone",
    "mobile_personnel",
)


def _normalize_key(key: str) -> str:
    """Casse et séparateurs ignorés : `birth_date` = `birthDate` = `BirthDate`."""
    return re.sub(r"[^a-z0-9]", "", key.lower())


_FORBIDDEN: frozenset[str] = frozenset(_normalize_key(key) for key in ENRICHMENT_FORBIDDEN_KEYS)


def is_enrichment_forbidden_field(key: str) -> bool:
    """Cette clé est-elle au catalogue des champs interdits ?"""
    return _normalize_key(key) in _FORBIDDEN


def without_forbidden_enrichment_fields(value: Any) -> Any:
    """Une COPIE de `value` sans aucune clé du catalogue, à toute profondeur.

    Un historique d'emploi recopie du brut fournisseur : un filtre qui ne
    descend que d'un niveau laisse passer le suivant. L'entrée n'est jamais
    mutée."""
    if isinstance(value, list):
        return [without_forbidden_enrichment_fields(item) for item in value]
    if isinstance(value, dict):
        return {
            key: without_forbidden_enrichment_fields(item)
            for key, item in value.items()
            if not (isinstance(key, str) and is_enrichment_forbidden_field(key))
        }
    return value


# #4178.1 — la NATURE d'un numéro. « Professionnel » ne se déduit JAMAIS du
# format ni du préfixe : seul le type de ligne que le fournisseur DÉCLARE compte,
# et un « mobile » est un type de ligne, pas une nature. `professional_verified`
# est réservée (aucune preuve fournisseur n'existe) : jamais produite ici.
# Miroir de `phoneNatureFromProviderType` (@bellum/contracts).
_WORK_LINE_TYPES: frozenset[str] = frozenset({"work_direct", "work_hq", "work", "direct", "hq"})
_HOME_LINE_TYPES: frozenset[str] = frozenset({"home", "personal"})


def phone_nature_from_provider_type(line_type: str | None) -> str:
    """Type de ligne d'un fournisseur → nature ; tout ce qui n'est pas explicite est `unknown`."""
    key = (line_type or "").strip().lower()
    if key in _WORK_LINE_TYPES:
        return "professional_declared"
    if key in _HOME_LINE_TYPES:
        return "personal"
    return "unknown"
