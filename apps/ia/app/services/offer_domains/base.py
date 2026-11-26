"""Reusable **offer-domain pack** framework — pluggable, default untouched.

PDF6 §1 : « Bellum ne doit pas être enfermé dans le vocabulaire IT/data —
raisonner par périmètres métiers (finance, supply chain, produit, design,
PMO, RH…) puis se spécialiser via le contexte utilisateur. »

An *offer-domain pack* describes ONE business domain the seller (the ESN /
consulting firm) sells into: its perimeter vocabulary, the signal families
worth hunting, and example plays. It is the direct sibling of the country-pack
framework (``app/services/country_packs``) applied to the PROMPT LENS instead
of data sources: pure static data, zero network, one registry, one gate.

Hard invariants (mirroring the country packs + the Drive #9 dé-silo):

* **Default untouched.** The default domain is ``esn_it`` — the live product.
  A pack drives the prompts ONLY when the seller profile explicitly carries a
  registered NON-default ``offerDomain``. ``esn_it``, an absent field or an
  unknown value ⇒ :func:`~app.services.offer_domains.get_offer_domain_pack`
  returns ``None`` ⇒ the caller (``domain_focus.resolve_domain_focus``) keeps
  the exact historical resolution — rendered prompts stay **byte-identical**
  (locked by ``tests/test_offer_domains.py`` against the committed goldens).
* **Pure data.** A pack never performs I/O and never reads env vars. Its output
  is deterministic — safe to hash into the prompt-registry fingerprint.
* **No invented sales methodology.** ``live`` packs carry vocabulary curated
  for their domain; ``scaffold`` packs derive a generic lens from the seller's
  own declared offers and document the TODO — they never ship half-curated
  content that *looks* expert but isn't.

Full doc (how to add a domain, what each field drives): ``agent_docs/offer-domains.md``.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any, Literal, TypedDict

#: Default (untouched) domain — the live ESN/IT product. A pack is never
#: consulted for it: the historical ``domain_focus`` resolution applies.
DEFAULT_OFFER_DOMAIN = "esn_it"

#: Maturity of a domain pack (drives the UI badge + expectations):
#:
#: * ``live``     — perimeter vocabulary / signal families / plays curated for
#:                  the domain (esn_it, generic, finance).
#: * ``scaffold`` — registered and selectable, but the lens is DERIVED from the
#:                  seller's own offers (generic behaviour with the domain's
#:                  label). The curated content is a documented TODO in the
#:                  pack module (supply_chain, product_design, pmo, rh).
DomainStatus = Literal["live", "scaffold"]


class OfferDomainMeta(TypedDict):
    """Static, pure-data description of a pack — safe to enumerate for a UI."""

    code: str  # stable identifier, e.g. "finance" (persisted in esn_profiles.offer_domain)
    label_fr: str  # human label, e.g. "Finance"
    label_en: str  # human label, e.g. "Finance"
    status: DomainStatus


class OfferDomainPack(ABC):
    """Interface every offer-domain pack implements — the single extension point.

    A pack is pure prompt/reasoning data for one business domain. Instances are
    cheap and stateless; the module-level ``OFFER_DOMAIN_PACKS`` registry
    (``app/services/offer_domains/__init__.py``) holds one per domain.

    **To add a domain** you subclass this, set the four class attributes,
    implement the four abstract methods, register the instance and extend the
    contracts enum (``packages/contracts/src/schemas/onboarding.ts`` —
    ``OFFER_DOMAINS``). Checklist in ``agent_docs/offer-domains.md``.
    """

    # ── Static class-level identity (pure data) ───────────────────────────────
    #: Stable code, e.g. "finance". Persisted in ``esn_profiles.offer_domain``.
    code: str
    #: French human label, e.g. "Finance".
    label_fr: str
    #: English human label, e.g. "Finance".
    label_en: str
    #: Maturity — see :data:`DomainStatus`.
    status: DomainStatus

    def metadata(self) -> OfferDomainMeta:
        """Static :class:`OfferDomainMeta` — derived from the class attributes."""
        return {
            "code": self.code,
            "label_fr": self.label_fr,
            "label_en": self.label_en,
            "status": self.status,
        }

    @abstractmethod
    def perimeters(self) -> tuple[str, ...]:
        """Business perimeters of the domain (the org units / functions a seller
        in this domain targets), e.g. finance → DAF, contrôle de gestion,
        trésorerie… Pure vocabulary — consumed by the prompt domain brief."""

    @abstractmethod
    def signal_families(self) -> tuple[str, ...]:
        """Families of PUBLIC buy signals relevant to the domain (what to hunt
        in the sources), each with its business reading. Feeds the signal grid
        of ``bellum_signals`` and the domain brief."""

    @abstractmethod
    def play_examples(self) -> tuple[str, ...]:
        """Example plays / attack angles typical of the domain — calibration
        vocabulary for ``bellum_strategy`` (never a mandate; the model still
        selects plays from the account's REAL signals)."""

    @abstractmethod
    def domain_focus(self, profile_data: dict[str, Any]) -> dict[str, str]:
        """The full domain lens dict ``resolve_domain_focus`` returns when this
        pack is active — same keys as the historical IT lens (``label``,
        ``label_long``, ``system_label``, ``budget_signal``,
        ``tech_entity_directive``, ``sell_examples``) plus the block keys
        (``signal_grid``, ``challenge_label``, ``play_examples_inline``,
        ``domain_brief``). ``profile_data`` lets a pack specialise on the
        seller's own declared offers. Deterministic, never raises."""


def normalize_offer_domain(value: Any) -> str:
    """Normalise a raw ``offerDomain`` value to a lower-case token.

    ``None`` / empty / non-string shapes fall back to
    :data:`DEFAULT_OFFER_DOMAIN` so a malformed value can never activate a pack
    — exactly the ``normalize_country`` contract of the country packs.
    """
    if not isinstance(value, str):
        return DEFAULT_OFFER_DOMAIN
    token = value.strip().lower()
    return token or DEFAULT_OFFER_DOMAIN


def clean_offers(profile_data: dict[str, Any]) -> list[str]:
    """The seller's declared offers, tolerant of the two key spellings used
    across the pipeline (``offers``) and the profiler (``core_offers``)."""
    raw = profile_data.get("offers") or profile_data.get("core_offers") or []
    return [str(o).strip() for o in raw if str(o).strip()]


def build_domain_brief(
    *,
    label: str,
    perimeters: tuple[str, ...],
    signal_families: tuple[str, ...],
    play_examples: tuple[str, ...],
) -> str:
    """Render the ``domain_brief`` prompt block for an ACTIVE (non-default) pack.

    Injected verbatim at the end of the MISSION section of the research/contacts
    system prompts. The default path uses ``""`` instead — appending an empty
    string keeps the default prompts byte-identical by construction.
    """
    lines = [
        "",
        "",
        f"===== DOMAINE D'OFFRE : {label.upper()} =====",
        "Tu raisonnes dans le domaine d'offre du vendeur, PAS dans un prisme IT presume.",
        f"Perimetres metiers a cibler chez le compte : {', '.join(perimeters)}.",
        "Familles de signaux a chercher en priorite :",
        *[f"- {family}" for family in signal_families],
        f"Exemples de plays typiques du domaine (calibration, jamais une liste imposee) : {' ; '.join(play_examples)}.",
    ]
    return "\n".join(lines)
