"""Offer-domain packs — pluggable domain lenses (default ``esn_it`` untouched).

The prompt layer talks to exactly one gate, :func:`get_offer_domain_pack`
(consumed by ``domain_focus.resolve_domain_focus`` / ``looks_like_it_esn``).
It returns a pack ONLY for an explicitly-selected, registered, NON-default
domain. ``esn_it`` (the default), an absent ``offerDomain`` or an unknown
value ⇒ ``None`` ⇒ the historical resolution applies — rendered prompts stay
byte-identical (locked by ``tests/test_offer_domains.py``).

Registered domains (selectable in the seller profile — « Domaine d'offre ») :

* ``esn_it``         — Services IT/ESN (défaut, produit live) — ``live`` — :mod:`.esn_it`
* ``generic``        — Générique multi-domaines (offres du vendeur = prisme) — ``live`` — :mod:`.generic`
* ``finance``        — Fonction finance (DAF) — ``live`` — :mod:`.finance`
* ``supply_chain``   — Supply chain & opérations — ``scaffold`` (TODO curation) — :mod:`.supply_chain`
* ``product_design`` — Produit & design — ``scaffold`` (TODO curation) — :mod:`.product_design`
* ``pmo``            — PMO & transformation — ``scaffold`` (TODO curation) — :mod:`.pmo`
* ``rh``             — Ressources humaines — ``scaffold`` (TODO curation) — :mod:`.rh`
* ``ia``              — Data Science / ML / GenAI — ``live`` — :mod:`.ia` (#2633.1)
* ``cyber``           — Cybersécurité (CISO, IAM, GRC, SOC) — ``live`` — :mod:`.cyber` (#3186.3)
* ``hse``             — Environnement & HSE (QHSE, ICPE, conformité) — ``live`` — :mod:`.hse` (#3186.5)

Adding a domain = one :class:`~.base.OfferDomainPack` subclass + one registry
entry + the contracts enum (``OFFER_DOMAINS`` in
``packages/contracts/src/schemas/onboarding.ts``) + i18n labels. Full
checklist in ``agent_docs/offer-domains.md``.
"""

from __future__ import annotations

from app.services.offer_domains.base import (
    DEFAULT_OFFER_DOMAIN,
    DomainStatus,
    OfferDomainMeta,
    OfferDomainPack,
    normalize_offer_domain,
)
from app.services.offer_domains.cyber import CyberPack
from app.services.offer_domains.esn_it import EsnItPack
from app.services.offer_domains.finance import FinancePack
from app.services.offer_domains.generic import GenericPack
from app.services.offer_domains.hse import HsePack
from app.services.offer_domains.ia import IaPack
from app.services.offer_domains.industrial_engineering import IndustrialEngineeringPack
from app.services.offer_domains.pmo import PmoPack
from app.services.offer_domains.product_design import ProductDesignPack
from app.services.offer_domains.rh import RhPack
from app.services.offer_domains.supply_chain import SupplyChainPack

#: One pack instance per registered domain code (packs are stateless).
OFFER_DOMAIN_PACKS: dict[str, OfferDomainPack] = {
    EsnItPack.code: EsnItPack(),
    GenericPack.code: GenericPack(),
    FinancePack.code: FinancePack(),
    SupplyChainPack.code: SupplyChainPack(),
    ProductDesignPack.code: ProductDesignPack(),
    PmoPack.code: PmoPack(),
    RhPack.code: RhPack(),
    IndustrialEngineeringPack.code: IndustrialEngineeringPack(),
    IaPack.code: IaPack(),
    CyberPack.code: CyberPack(),
    HsePack.code: HsePack(),
}


def list_offer_domains() -> list[OfferDomainMeta]:
    """Pure-data metadata for every registered domain, default first then
    alphabetical. Deterministic (no I/O, no env read) — safe for a UI."""
    rest = sorted(code for code in OFFER_DOMAIN_PACKS if code != DEFAULT_OFFER_DOMAIN)
    return [OFFER_DOMAIN_PACKS[code].metadata() for code in (DEFAULT_OFFER_DOMAIN, *rest)]


def get_offer_domain_pack(offer_domain: str | None) -> OfferDomainPack | None:
    """The pack to use for ``offer_domain``, or ``None`` when the historical
    default resolution should apply.

    Returns a pack ONLY for a registered NON-default domain. ``esn_it`` (the
    default), ``None`` / empty or an unknown value ⇒ ``None`` ⇒ the caller keeps
    the exact historical behaviour (byte-identical prompts). Zero-flag policy:
    selecting the domain IS the switch — no env flag.
    """
    code = normalize_offer_domain(offer_domain)
    if code == DEFAULT_OFFER_DOMAIN:
        return None
    return OFFER_DOMAIN_PACKS.get(code)


__all__ = [
    "DEFAULT_OFFER_DOMAIN",
    "DomainStatus",
    "OFFER_DOMAIN_PACKS",
    "OfferDomainMeta",
    "OfferDomainPack",
    "get_offer_domain_pack",
    "list_offer_domains",
    "normalize_offer_domain",
]
