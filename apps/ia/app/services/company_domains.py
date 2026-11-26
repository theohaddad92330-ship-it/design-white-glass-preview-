"""DISCOVER-OFFRES (15/10) — le SITE d'une entreprise, rangé par SIREN dans le cache commun.

Le registre (Pappers / INSEE) ne porte pas de site. Une analyse, elle, le connaît : elle le range ici (un fait
PUBLIC de l'entreprise, jamais rien de propre à un espace) pour que Découvrir sache de quel domaine parle une
carte quand il demande le volume d'offres. Pas de site connu → ``None`` : Découvrir n'affiche alors AUCUNE ligne
de volume, il ne devine jamais un domaine depuis un nom.
"""

from __future__ import annotations

import re

from app.services import provider_cache
from app.services.data_sources.mantiks_volume import root_domain

_NAMESPACE = "company_domain"
#: Un site d'entreprise change rarement : 180 jours.
_TTL_S = 180 * 24 * 3600
_SIREN = re.compile(r"^\d{9}$")


def _key(siren: object) -> str:
    raw = str(siren or "").replace(" ", "")
    return f"siren:{raw}" if _SIREN.match(raw) else ""


async def remember(siren: object, website: object) -> None:
    key, domain = _key(siren), root_domain(website)
    if key and domain:
        await provider_cache.set_json(_NAMESPACE, key, {"domain": domain}, _TTL_S)


async def lookup(siren: object) -> str | None:
    key = _key(siren)
    hit = await provider_cache.get_json(_NAMESPACE, key) if key else None
    domain = hit.get("domain") if isinstance(hit, dict) else None
    return domain if isinstance(domain, str) and domain else None
