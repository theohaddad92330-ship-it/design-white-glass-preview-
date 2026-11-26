"""Country packs — reusable, additive foreign-country add-ons (on for their market).

The pipeline talks to exactly one function, :func:`collect_country_signals`, and
one gate, :func:`get_active_pack`. Both are strict no-ops for the default French
path: unless a NON-FR registered country is targeted, nothing runs — no network
call, no fabricated data, FR behaviour byte-identical. Zero-flag policy: asking
for the country IS the switch; a credential (Zefix Basic auth for CH) only gates
the sources that require it — the credential-free parts of a pack always run.

Registered packs (active whenever their country is targeted):

* ``CH`` — Suisse / Zefix (creds ``ZEFIX_API_USER/PASSWORD`` pour le registre) — status ``live`` — see :mod:`.ch`
* ``BE`` — Belgique / KBO (aucune clé) — status ``live`` — see :mod:`.be`
* ``LU`` — Luxembourg / RCS via GLEIF (aucune clé) — status ``live``, contrat ``documented`` (#4016 L13a, 11/10/2026) — see :mod:`.lu`
* ``US`` — États-Unis / SEC EDGAR (aucune clé) — status ``live`` — see :mod:`.us`
* ``CA`` — Canada / CBR-MRAS (aucune clé) — status ``live`` — see :mod:`.ca`
* ``DE`` / ``GB`` / ``ES`` — Allemagne / Royaume-Uni / Espagne (#4736, lot G) — status ``beta``,
  contrat ``documented`` : vocabulaire + ontologie, registre dégradé (zéro réseau) — see :mod:`.de`, :mod:`.gb`, :mod:`.es`

Adding a country = one new :class:`~.base.CountryPack` subclass + one registry
entry (+ ``COMPLIANCE.md`` section + golden accounts + tests). The full
step-by-step checklist is in ``README.md`` next to this module; the per-country
RGPD basis is in ``COMPLIANCE.md``. :func:`list_supported_countries` enumerates the
registry (network-free) for a UI / settings screen.
"""

from __future__ import annotations

import logging

from app.services.country_packs.base import (
    DEFAULT_COUNTRY,
    CountryPack,
    CountryPackMeta,
    CountrySignals,
    PackStatus,
    RegistryEntity,
    empty_signals,
    normalize_country,
)
from app.services.country_packs.be import BelgianPack
from app.services.country_packs.ca import CanadaPack
from app.services.country_packs.ch import SwissPack
from app.services.country_packs.de import GermanPack
from app.services.country_packs.es import SpanishPack
from app.services.country_packs.gb import BritishPack
from app.services.country_packs.lu import LuxembourgPack
from app.services.country_packs.us import UsPack

logger = logging.getLogger(__name__)

#: One pack instance per supported country code (packs are stateless).
COUNTRY_PACKS: dict[str, CountryPack] = {
    SwissPack.code: SwissPack(),
    BelgianPack.code: BelgianPack(),
    LuxembourgPack.code: LuxembourgPack(),
    UsPack.code: UsPack(),
    CanadaPack.code: CanadaPack(),
    GermanPack.code: GermanPack(),
    BritishPack.code: BritishPack(),
    SpanishPack.code: SpanishPack(),
}


def list_supported_countries() -> list[CountryPackMeta]:
    """Network-free metadata for every registered pack, sorted by country code.

    Deterministic (stable order, no I/O, no env read) — safe to expose on a
    settings screen. Every registered pack is active for its market (zero-flag
    policy); per-source credentials only gate the sources that need them.
    """
    return [COUNTRY_PACKS[code].metadata() for code in sorted(COUNTRY_PACKS)]


def get_active_pack(country: str | None) -> CountryPack | None:
    """The pack to use for ``country``, or ``None`` when nothing should run.

    Returns a pack ONLY when the country is a registered non-FR country. ``FR``
    (default) or an unknown country ⇒ ``None`` ⇒ the caller does nothing (no task,
    no network, no prompt change). Zero-flag policy: targeting the country IS the
    switch — no env flag.
    """
    code = normalize_country(country)
    if code == DEFAULT_COUNTRY:
        return None
    return COUNTRY_PACKS.get(code)


async def suggest_registry_entities(
    country: str | None,
    query: str,
    *,
    limit: int = 5,
) -> list[RegistryEntity]:
    """Autocomplete suggestions for ``query`` in ``country`` — the search-bar
    entry point, delegating to the active pack's :meth:`~.base.CountryPack.suggest`.

    Strict no-op (``[]``, zero network) for the FR default and any unregistered
    country — the French autocomplete keeps using recherche-entreprises, this is
    only ever consulted for a NON-FR market. Never raises: an unexpected pack
    error degrades to ``[]`` so a flaky registry can never surface as a 5xx on a
    typing UX, and no suggestion is ever fabricated.
    """
    pack = get_active_pack(country)
    if pack is None:
        return []
    try:
        return await pack.suggest(query, limit=limit)
    except Exception as exc:  # noqa: BLE001 — a country pack must never break autocomplete
        logger.warning("country pack %s suggest failed for %r (continuing): %s", country, query, exc)
        return []


async def collect_country_signals(
    country: str | None,
    company: str,
    *,
    ident: str | None = None,
) -> CountrySignals:
    """Consolidated signals for ``company`` in ``country`` — the ONE pipeline entry.

    Strict no-op (returns :func:`empty_signals`, zero network) unless
    :func:`get_active_pack` yields a pack. Never raises: an unexpected pack error
    degrades to empty so it can never break research.
    """
    code = normalize_country(country)
    pack = get_active_pack(code)
    if pack is None:
        return empty_signals(code)
    try:
        return await pack.collect_signals(company, ident=ident)
    except Exception as exc:  # noqa: BLE001 — a country pack must never break research
        logger.warning("country pack %s failed for %r (continuing): %s", code, company, exc)
        return empty_signals(code)


__all__ = [
    "COUNTRY_PACKS",
    "CountryPack",
    "CountryPackMeta",
    "CountrySignals",
    "PackStatus",
    "RegistryEntity",
    "collect_country_signals",
    "empty_signals",
    "get_active_pack",
    "list_supported_countries",
    "normalize_country",
    "suggest_registry_entities",
]
