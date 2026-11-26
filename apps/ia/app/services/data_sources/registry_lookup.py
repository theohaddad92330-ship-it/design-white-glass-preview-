"""Lookup registre par SIREN — l'identité derrière un identifiant.

DECP ne publie que des IDENTIFIANTS (``acheteur_id``, ``titulaire_id_1`` : des
SIRET), jamais les raisons sociales. Un SIRET brut dans l'UI ne veut rien dire
pour un commercial : « qui a acheté » et surtout « à QUI » (le concurrent en
place) doivent être des NOMS.

C'est un lookup par identifiant EXACT, pas une désambiguïsation : on interroge
la même source libre et sans clé que le résolveur mono-entreprise
(``recherche-entreprises`` via :func:`search_companies`, déjà mise en cache) et
on ne retient que la ligne dont le SIREN correspond au chiffre près. Aucun
rapprochement approximatif, donc aucun risque d'attribuer un marché à la
mauvaise société.

Dégradation : identifiant illisible ou registre injoignable → ``None`` / nom
absent. On préfère taire le nom que d'en inventer un (règle CLAUDE.md).
"""

from __future__ import annotations

import asyncio
import logging
from collections.abc import Iterable

from app.services.data_sources.recherche_entreprises import search_companies

logger = logging.getLogger(__name__)

# Le registre est libre mais on ne le martèle pas.
_CONCURRENCY = 6


def to_siren(value: object) -> str | None:
    """SIREN à 9 chiffres depuis un SIREN (9) ou un SIRET (14). ``None`` si
    l'identifiant est trop court — on ne complète JAMAIS un identifiant partiel."""
    digits = "".join(ch for ch in str(value or "") if ch.isdigit())
    return digits[:9] if len(digits) >= 9 else None


async def identity_by_siren(siren: str, *, strict: bool = False) -> dict | None:
    """Ligne registre de CE SIREN exactement, ou ``None``.

    Renvoie le dict ``recherche-entreprises`` (name, nafCode, nafLabel, city,
    department, sizeClass, headcountTranche…). Le filtre sur le SIREN exact est
    ce qui rend le lookup sûr : la recherche plein-texte peut remonter des
    voisins, ils sont écartés.
    """
    wanted = to_siren(siren)
    if not wanted:
        return None
    try:
        rows = await search_companies(wanted, limit=5, strict=strict)
    except Exception as exc:  # noqa: BLE001 — un lookup libre ne casse jamais un run
        logger.warning("Registry lookup failed for SIREN %s: %s", wanted, exc)
        # #4617 — ``strict`` : un registre qui REFUSE n'est pas un registre qui ne connaît pas ce SIREN ;
        # l'appelant qui tranche (résolution d'employeur) reçoit l'échec. Défaut : ``None``, inchangé.
        if strict:
            raise
        return None
    for row in rows or []:
        if isinstance(row, dict) and to_siren(row.get("siren")) == wanted:
            return row
    return None


async def names_by_siren(sirens: Iterable[str]) -> dict[str, str]:
    """{SIREN: raison sociale} pour les SIREN résolus (les autres sont absents).

    Résolution concurrente bornée — utilisée pour nommer les titulaires d'un lot
    de marchés en une passe.
    """
    wanted = sorted({s for s in (to_siren(x) for x in sirens) if s})
    if not wanted:
        return {}
    semaphore = asyncio.Semaphore(_CONCURRENCY)

    async def _one(siren: str) -> tuple[str, str | None]:
        async with semaphore:
            row = await identity_by_siren(siren)
        name = str((row or {}).get("name") or "").strip()
        return siren, name or None

    return {siren: name for siren, name in await asyncio.gather(*(_one(s) for s in wanted)) if name}
