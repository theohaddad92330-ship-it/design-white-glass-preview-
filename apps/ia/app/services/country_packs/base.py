"""Reusable **country-pack** framework — additive, on for its market, no-op for FR.

BellumAI is FR-first. A *country pack* bolts an extra, self-contained set of
public-registry + local-signal sources onto the research pipeline for ONE foreign
country, WITHOUT touching the French path. It is the direct sibling of the FR
``DataGateway.collect_fr_signals`` consolidation (recherche-entreprises + BOAMP +
France-Travail + BODACC behind one interface, graceful per-source failure,
additive dedup by URL): each pack exposes the same shape for its own country.

Hard invariants (mirroring CLAUDE.md "JAMAIS de données fictives"):

* **FR default untouched.** A pack contributes data ONLY when its non-FR country
  is explicitly targeted (zero-flag policy: no env flag — asking for the country
  IS the switch). ``country="FR"`` (the default) or an unregistered country ⇒
  every entry point here is a strict no-op: **no network call, no prompt change,
  nothing added**.
* **Additive.** A pack only ever APPENDS deduped hits to the web block and an
  optional vocabulary fragment to the prompt context. It never removes a French
  source and never rewrites the FR prompts.
* **Graceful per-source failure.** A missing credential (e.g. Zefix Basic auth
  for CH) or a provider outage degrades that source to its empty value (``None``
  / ``[]``) — never a fake, never an exception that sinks the run. Credential-free
  sources (KBO BE, SEC EDGAR US, CBR CA) always run for their market. Exactly the
  ``collect_fr_signals`` contract.

RGPD / legal basis per pack lives in each pack module's docstring and in
``COMPLIANCE.md`` next to this file. Summary: **CH** relies on the EU adequacy
decision for Switzerland (15 Jan 2024) + nFADP; **BE** is intra-EU (full GDPR).
Only official public registry data (legal identity, seat, status, public legal
notices) is collected — data minimisation, no transfer outside a covered regime.
"""

from __future__ import annotations

import logging
from abc import ABC, abstractmethod
from typing import Literal, NotRequired, TypedDict

import httpx

from app.middleware.correlation_id import get_correlation_id
from app.services.company_filters import reason_for_status
from app.services.source_health import record_degradation

logger = logging.getLogger(__name__)

# Default (untouched) country. A pack is never consulted for FR.
DEFAULT_COUNTRY = "FR"


def note_registry_failure(
    source: str, what: str, *, status: int | None = None, exc: BaseException | None = None
) -> None:
    """Dire qu'un registre pays n'a pas répondu — au lieu de le taire.

    « Graceful per-source failure » (l'invariant ci-dessus) dit bien que la
    source dégrade vers sa valeur vide. Il ne dit PAS que l'utilisateur doit
    l'ignorer, et c'est là que la famille ``country_packs`` s'est fait piéger :
    chaque échec rendait ``None`` / ``[]`` sans un mot, exactement la valeur d'un
    « aucune société de ce nom ». Le cas le plus net est Zefix (CH), qui
    s'authentifie en HTTP Basic : un **401 sur NOS identifiants** — clé expirée,
    mot de passe tourné — était rendu à l'écran comme une conclusion sur le
    registre suisse.

    La valeur de retour ne change pas (aucune donnée inventée, aucun défaut
    plausible) ; seule la TRACE est ajoutée, via le registre ``source_health``
    déjà consommé par le dossier. ``code`` reprend le vocabulaire partagé
    (``unauthorized``, ``rate_limited``…) pour que l'agrégation soit possible.
    """
    if status is not None:
        logger.warning("%s failed (status %s) — %s", source, status, what)
        record_degradation(
            get_correlation_id(),
            source=source,
            reason=f"{what}: HTTP {status}",
            code=reason_for_status(status),
        )
        return
    logger.warning("%s failed — %s: %s", source, what, exc)
    record_degradation(get_correlation_id(), source=source, reason=f"{what}: {exc}")


def normalize_country(country: str | None) -> str:
    """Normalise a country code to an upper-case 2-letter ISO-ish token.

    ``None`` / empty / unknown shapes fall back to :data:`DEFAULT_COUNTRY` (``FR``)
    so a malformed value can never accidentally activate a pack.
    """
    code = (country or "").strip().upper()
    return code if len(code) == 2 and code.isalpha() else DEFAULT_COUNTRY


class RegistryEntity(TypedDict, total=False):
    """A normalized, cross-country legal identity resolved from a public registry.

    Only the fields a given registry actually exposes are filled; the rest are
    omitted (``total=False``). ``registryId`` is the national pivot identifier
    (Swiss UID / Belgian BCE number) — the analogue of the French SIREN. It is
    returned in the analysis result (flat ``registryId``/``registryCountry`` +
    the full entity under ``countryRegistry`` — see
    ``phase1_research._registry_identity_overlay``); the API canonicalises and
    persists it on ``accounts.registry_id`` / ``registry_country`` and dedups the
    workspace's canonical account on it (migration 1785860000000) — the
    cross-border twin of the SIREN dedup.
    """

    source: str  # provider name, e.g. "zefix" / "kbo"
    country: str  # "CH" / "BE"
    name: str
    registryId: str  # national identifier (UID CHE-xxx / BCE 0xxx.xxx.xxx)
    registryIdLabel: str  # human label, e.g. "UID" / "numéro BCE"
    legalForm: str
    seat: str  # commune / city of the registered office
    region: str  # canton (CH) / région linguistique (BE)
    status: str  # active / cancelled / …
    establishments: int  # number of establishments / unités d'établissement
    detailUrl: str  # official public detail page (used as the dedup key for hits)
    #: #4016 L13a — ``"documented"`` when the identity comes from a source wired on
    #: its DOCUMENTED contract, not yet verified on a real production instance
    #: (the screen shows a badge). Absent ⇒ verified source.
    contract: str


class CountrySignals(TypedDict):
    """Consolidated output of a pack — same spirit as ``collect_fr_signals``.

    ``hits`` is the ADDITIVE web-block payload: a list of ``{title, url,
    description, category, source}`` dicts (deduped by URL) ready to be appended to
    the Brave block, exactly like the Data Gateway search hits.
    """

    country: str
    registry: RegistryEntity | None
    jobs: list[dict]
    legalSignals: list[dict]
    hits: list[dict]
    #: Optional structured financial snapshot a pack MAY resolve from its registry
    #: (currently the US/SEC pack: annual revenues + net income dated by 10-K
    #: filing, CIK + filing link, dated full-text filings). Absent by default —
    #: the pipeline persists it verbatim under ``raw_analysis.us_sec_financials``
    #: (see ``phase1_research._us_sec_financials_overlay``). Present-only, sourced,
    #: JAMAIS inventé.
    secFinancials: NotRequired[dict]


def empty_signals(country: str) -> CountrySignals:
    """A fully-empty :class:`CountrySignals` — the no-op / graceful-failure value."""
    return {"country": country, "registry": None, "jobs": [], "legalSignals": [], "hits": []}


def dedup_hits(hits: list[dict]) -> list[dict]:
    """Dedup a hit list by ``url`` (first occurrence wins); drops url-less hits."""
    seen: set[str] = set()
    out: list[dict] = []
    for h in hits:
        url = (h.get("url") or "").strip()
        if not url or url in seen:
            continue
        seen.add(url)
        out.append(h)
    return out


#: Maturity of a country pack (drives ``list_supported_countries`` + the UI badge):
#:
#: * ``live``    — registry resolution is wired against a VERIFIED free endpoint
#:                 (identity resolves online). CH, BE, US, CA — and LU since 11/10/2026
#:                 on a DOCUMENTED (not yet verified) contract, see :data:`ContractStatus`.
#: * ``beta``    — usable (prompt vocabulary + entity ontology are injected) but
#:                 registry resolution is DEGRADED: no free structured endpoint
#:                 exists for that country, so ``registry_lookup`` returns ``None``
#:                 with zero network. The pack still makes the prompt country-aware.
#:                 See the pack module docstring for exactly what is / isn't free.
#:                 No pack is ``beta`` since 11/10/2026 (LU left it, #4016 L13a).
#: * ``planned`` — a reserved country code with no implementation yet (never here
#:                 today; documented so the taxonomy is closed).
PackStatus = Literal["live", "beta", "planned"]

#: #4016 L13a (DÉCISION LOUIS 11/10/2026) — the state of the pack's registry CONTRACT,
#: orthogonal to :data:`PackStatus`:
#:
#: * ``verified``   — the endpoint and its response shape were verified on a real
#:                    instance (CH Zefix, BE KBO, US EDGAR, CA CBR).
#: * ``documented`` — wired on the provider's PUBLIC DOCUMENTATION, not yet
#:                    verified on a real production instance. Renversement partiel et
#:                    daté de « un contrat d'API non vérifiable ne se devine pas » :
#:                    a DOCUMENTED contract is not a guessed one. The screen shows a
#:                    badge, and nothing billed rides on it (no credit debit) until
#:                    it is verified — ``contractDebitsCredits`` in ``@bellum/contracts``.
ContractStatus = Literal["verified", "documented"]


class CountryPackMeta(TypedDict):
    """Static, **network-free** description of a pack — the row shape returned by
    :func:`~app.services.country_packs.list_supported_countries`. Pure metadata: it
    never triggers a lookup, so it is safe to enumerate for a settings screen.
    """

    code: str  # ISO-ish 2-letter code, e.g. "CH"
    country: str  # human name, e.g. "Suisse"
    languages: list[str]  # business/registry languages, ISO-639-1, e.g. ["fr", "de", "it"]
    registry: str  # official registry name, e.g. "Zefix"
    identifierLabel: str  # national identifier label, e.g. "UID"
    status: PackStatus  # live | beta | planned
    contract: ContractStatus  # verified | documented (#4016 L13a)


class CountryPack(ABC):
    """Interface every country pack implements — the single extension point.

    A pack is a pure add-on: identity resolution + local signal collection +
    local ontology/vocabulary for one country. Instances are cheap and stateless;
    the module-level :data:`COUNTRY_PACKS` registry holds one per country.

    **To add a country** you subclass this, set the six class attributes below,
    implement the four abstract methods, register the instance in ``COUNTRY_PACKS``
    and add a ``COMPLIANCE.md`` section + golden accounts. The full checklist lives
    in ``README.md`` next to this module.
    """

    # ── Static class-level identity (pure data — no network) ──────────────────
    #: ISO-ish 2-letter country code, e.g. "CH".
    code: str
    #: Human label of the national identifier, e.g. "UID" / "numéro BCE".
    identifier_label: str
    #: Human country name, e.g. "Suisse".
    country_name: str
    #: Business/registry languages (ISO-639-1), e.g. ``("fr", "de", "it")``.
    languages: tuple[str, ...]
    #: Official registry name, e.g. "Zefix".
    registry_name: str
    #: Maturity of the pack — see :data:`PackStatus`.
    status: PackStatus
    #: #4016 L13a — the registry contract state, see :data:`ContractStatus`.
    contract: ContractStatus = "verified"

    def metadata(self) -> CountryPackMeta:
        """Static, network-free :class:`CountryPackMeta` for this pack.

        Concrete (not abstract): derived purely from the six class attributes, so
        a subclass gets it for free. Powers :func:`list_supported_countries`.
        """
        return {
            "code": self.code,
            "country": self.country_name,
            "languages": list(self.languages),
            "registry": self.registry_name,
            "identifierLabel": self.identifier_label,
            "status": self.status,
            "contract": self.contract,
        }

    @abstractmethod
    def entity_ontology(self) -> dict:
        """Static local entity ontology (legal forms, holding vs operating,
        regional axis). Consumed by the prompt vocabulary and downstream filtering.
        Pure data — never a network call."""

    @abstractmethod
    def local_vocabulary(self) -> dict:
        """Static local vocabulary for prompt adaptation: official registry name,
        identifier label, business language(s), and a ready-to-inject
        ``prompt_fragment`` string. Pure data — never a network call."""

    @abstractmethod
    async def registry_lookup(self, query: str, *, client: httpx.AsyncClient | None = None) -> RegistryEntity | None:
        """Resolve a company name **or** national identifier to a
        :class:`RegistryEntity`. ``None`` when unresolved or on any error
        (graceful). Makes NO network call when a required credential is missing
        (e.g. Zefix Basic auth for CH). An optional shared ``client`` is threaded
        through every request (a caller can reuse one pool; tests inject a mock)."""

    async def suggest(
        self, query: str, *, limit: int = 5, client: httpx.AsyncClient | None = None
    ) -> list[RegistryEntity]:
        """Autocomplete suggestions for ``query`` — the search-bar analogue of
        the run's registry resolution, so the country selector never re-implements
        (nor re-throttles) a pack's provider.

        Default: wraps :meth:`registry_lookup` into a single-element list (the
        pack's best match), ``[]`` when nothing resolves. A pack whose provider
        exposes a native multi-result name search MAY override this to return a
        few candidates; the guarantees are identical either way — a missing
        credential / degraded registry yields ``[]`` (no network, no fabricated
        suggestion). Never raises: an unexpected error degrades to ``[]``."""
        entity = await self.registry_lookup(query, client=client)
        return [entity] if entity else []

    @abstractmethod
    async def collect_signals(
        self, company: str, *, ident: str | None = None, client: httpx.AsyncClient | None = None
    ) -> CountrySignals:
        """Consolidated country signals for ``company`` (optionally anchored on a
        known national ``ident``), with graceful per-source failure and additive,
        URL-deduped ``hits``. Returns :func:`empty_signals` when a required
        credential is missing — no network call. Optional shared ``client`` as
        above."""


class DegradedCountryPack(CountryPack):
    """Base d'un pack ``beta`` : vocabulaire + ontologie, registre DÉGRADÉ.

    Aucun endpoint libre, structuré et vérifiable ne résout « nom → identifiant »
    pour ce pays : ``registry_lookup`` / ``suggest`` / ``collect_signals`` ne font
    **aucun appel réseau** et rendent leur valeur vide (``None`` / ``[]`` /
    :func:`empty_signals`) — jamais une société inventée. Le contrat est
    ``documented`` : le badge s'allume et rien de facturé n'en dépend
    (``contractDebitsCredits``). Le jour où une source libre est vérifiée, le pack
    surcharge ces trois méthodes sans toucher au reste.
    """

    status: PackStatus = "beta"
    contract: ContractStatus = "documented"

    async def registry_lookup(self, query: str, *, client: httpx.AsyncClient | None = None) -> RegistryEntity | None:
        return None

    async def collect_signals(
        self, company: str, *, ident: str | None = None, client: httpx.AsyncClient | None = None
    ) -> CountrySignals:
        return empty_signals(self.code)
