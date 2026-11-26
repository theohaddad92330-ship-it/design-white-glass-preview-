"""R22 VU.5 (recette prod 23/10) — le NOM d'une entreprise, tel qu'il s'affiche sur une carte.

Le registre public publie un ``nom_complet`` qui colle au nom la liste de ses sigles et enseignes, séparés par
des points-virgules : « HEXANET (NOZICAA;OLM;OCEANET;…) ». La carte de Laura affichait la chaîne entière. Seul
le nom s'affiche ; les entités ne sont pas recopiées ailleurs (on n'affiche pas ce qu'on n'a pas vérifié).

Un sigle SEUL entre parenthèses (« SOCIETE GENERALE (SG) ») n'est pas une liste : il reste, jamais un nom amputé.
"""

from __future__ import annotations

import re

#: Une parenthèse finale qui contient au moins un « ; » (liste d'entités), refermée ou tronquée par le registre.
_ENTITY_LIST = re.compile(r"\s*\([^()]*;[^()]*\)?\s*$")


def display_company_name(raw: object) -> str:
    """Le nom affichable : la liste d'entités concaténées retirée ; tout le reste tel quel."""
    name = str(raw or "").strip()
    cleaned = _ENTITY_LIST.sub("", name).strip()
    return cleaned or name
