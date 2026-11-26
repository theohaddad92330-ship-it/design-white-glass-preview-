"""Phase 1 — homonym resolution step (retour Théo p.10 / homonyme).

Ties the key-free candidate source (``recherche-entreprises``) to the
deterministic scorer (``homonym_disambiguation``): fetch the SIREN candidates for
a name, score them, and return a :class:`HomonymResolution` that either selects a
dominant entity or exposes the ambiguity for the UI to arbitrate.

``resolve_company_identity`` is the only I/O entry point.

  - A supplied ``siren`` (scope lock) short-circuits BEFORE any network call —
    the commercial already chose the perimeter, we respect it.
  - No key is required (recherche-entreprises is free) and every failure degrades
    to a ``none`` verdict — this step can never slow or break research.
"""

from __future__ import annotations

import logging

from app.services.data_sources.recherche_entreprises import search_companies
from app.services.homonym_disambiguation import (
    HomonymResolution,
    candidate_from_registry_row,
    disambiguate,
)

logger = logging.getLogger(__name__)

#: La projection registre → candidat vit dans ``homonym_disambiguation``, à côté
#: du barème qui la consomme. Elle était ici tant que ce module en était l'unique
#: appelant ; le sélecteur d'entreprise a besoin de la MÊME, et deux copies d'une
#: projection divergent au premier champ ajouté. Alias conservé : c'est le nom
#: sous lequel les tests de ce chemin la connaissent.
_to_candidate = candidate_from_registry_row


async def resolve_company_identity(
    company_name: str,
    *,
    siren: str | None = None,
    limit: int = 8,
    strict: bool = False,
    department: str | None = None,
) -> HomonymResolution:
    """Resolve ``company_name`` to a single SIREN, or expose its homonyms.

    Returns a :class:`HomonymResolution` (status locked / unique / selected /
    ambiguous / none). Soft-fails to a ``none`` verdict on any registry hiccup —
    never raises, so the caller can always attach it as transparency metadata.

    ``strict=True`` inverse ce contrat pour les appelants qui vont ÉCRIRE un
    verdict durable : un ``none`` né d'une panne de registre et un ``none`` né
    d'un registre qui a répondu « rien » sont deux faits opposés, et les
    confondre inscrit « cette société n'existe pas » sur une limite de débit.
    ``department`` (#4712) : le département de l'offre part à la RECHERCHE (le registre filtre par établissement) ;
    les candidats portent alors ``site_establishments``.

    Le défaut reste souple — le chemin d'analyse ne doit jamais tomber pour une
    source gratuite.
    """
    anchor = (siren or "").strip()
    if anchor:
        # Scope lock: honour the explicit choice, no candidate scan / network call.
        return disambiguate(company_name, [], siren_lock=anchor)

    try:
        kwargs = {"department": department} if department else {}
        raw = await search_companies(company_name, limit=limit, strict=strict, **kwargs)
    except Exception as exc:  # noqa: BLE001 — a free cross-check must never break research
        if strict:
            raise
        logger.warning("Homonym candidate fetch failed for %r (continuing): %s", company_name, exc)
        raw = []

    candidates = [_to_candidate(r) for r in raw if isinstance(r, dict) and r.get("siren")]
    return disambiguate(company_name, candidates)
