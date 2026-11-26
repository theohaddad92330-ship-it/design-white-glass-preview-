"""#2489.3 — orienter Découvrir SANS secteur coché vers les secteurs du PROFIL.

En mode Signaux (`/discover/signals`), une recherche sans secteur coché ne
retire rien (`matches_sectors` sur une liste vide rend toujours ``True``) —
c'est juste, une recherche non restreinte ne doit rien exclure. Mais les trois
sources de signal (BOAMP, DECP, France Travail) sont des registres de
COMMANDE PUBLIQUE ou de recrutement où l'administration pèse lourd : sans
orientation, la liste rendue est surtout des acheteurs publics, quel que soit
le métier de l'ESN.

Le PROFIL porte les secteurs visés par l'espace (`profile_data.sectors`), mais
dans le vocabulaire LIBRE de l'onboarding (« Aéronautique & Défense » —
`packages/contracts/src/schemas/onboarding.ts::target_sectors`), pas dans le
vocabulaire CODÉ et fin de `APPLICATION_SECTOR_NAF` (`aerospace`, `defense`…)
que ce module sait traduire en codes NAF. Les deux catalogues sont VOISINS
mais distincts par construction (`application-sectors.ts` l'explique : le
libellé libre AGRÈGE ce que le vocabulaire codé sépare), donc aucune égalité
stricte ne les relie.

Le pont retenu : un MOT du libellé profil (≥ 4 lettres, plié — sans accent ni
casse) qui est un PRÉFIXE (dans un sens ou l'autre) d'un mot du libellé FR
d'un secteur codé le désigne. Même convention que
`account_qualification._keyword_elsewhere` (« aéronautique » ↔ « aéronautiques »).
Ce n'est jamais un filtre dur : voir `routers/discover_signals.py`, qui
s'en sert pour RÉORDONNER, jamais pour exclure — une recherche sans secteur
coché ne doit toujours rien retirer.
"""

from __future__ import annotations

import re
from collections.abc import Mapping
from typing import Any

from app.services.application_sector_naf import naf_prefixes_for_sectors
from app.services.application_sectors import APPLICATION_SECTOR_LABELS_FR
from app.services.text_norm import normalize_name

#: Un mot plus court ne discrimine rien (« de », « et », « aux »).
_MIN_WORD_LENGTH = 4

#: Mots-catégorie qui apparaissent dans le libellé de PLUSIEURS secteurs sans
#: en désigner aucun en particulier (« Secteur public & Collectivités » ne
#: devrait pas répondre à un profil qui parle juste de « secteur », au sens
#: générique du terme). Même principe que `_COMPANY_FORM_TOKENS`
#: (`account_qualification.py`) : un mot-outil n'est jamais un indice.
_GENERIC_WORDS = frozenset({"secteur", "secteurs", "activite", "activites", "distribution"})


def _words(value: object) -> list[str]:
    return [
        word
        for word in re.split(r"[^0-9a-z]+", normalize_name(value))
        if len(word) >= _MIN_WORD_LENGTH and word not in _GENERIC_WORDS
    ]


def _shares_a_word(profile_words: list[str], label_words: list[str]) -> bool:
    return any(w1.startswith(w2) or w2.startswith(w1) for w1 in profile_words for w2 in label_words)


def application_sectors_from_profile_labels(labels: object) -> list[str]:
    """Codes `APPLICATION_SECTOR_NAF` dont le libellé FR partage un mot avec au
    moins un des libellés du PROFIL (catalogue onboarding). Ordre stable —
    celui de `APPLICATION_SECTOR_LABELS_FR` — pour rester déterministe."""
    if not isinstance(labels, list):
        return []
    profile_words = [word for label in labels for word in _words(label)]
    if not profile_words:
        return []
    return [
        code
        for code, fr_label in APPLICATION_SECTOR_LABELS_FR.items()
        if _shares_a_word(profile_words, _words(fr_label))
    ]


def profile_sector_naf_prefixes(profile_data: Mapping[str, Any] | None) -> list[str]:
    """Les préfixes NAF (4 chiffres) qui orientent vers les secteurs du PROFIL,
    ou ``[]`` si le profil n'en nomme aucun d'exploitable — jamais deviné."""
    labels = (profile_data or {}).get("sectors")
    codes = application_sectors_from_profile_labels(labels)
    return naf_prefixes_for_sectors(codes)
