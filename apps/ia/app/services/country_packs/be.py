"""Country pack **Belgique (BE)** — KBO/BCE, the Crossroads Bank for Enterprises.

Registry source (VERIFIED live 2026-07-16 against the official free public portal
``kbopub.economie.fgov.be`` — no account, no key, FR/NL/DE/EN):

* Detail by number : ``GET /kbopub/toonondernemingps.html?ondernemingsnummer=<num>&lang=fr``
  → HTML page (``<td class="QL|RL">Label:</td><td>value</td>`` pairs): Numéro
  d'entreprise, Statut, Dénomination, Type d'entité, Forme légale, Adresse du
  siège, Nombre d'unités d'établissement (UE), Date de début.
* Name search    : ``GET /kbopub/zoeknaamfonetischform.html?searchWord=<name>&
  ondRP=true&filterEnkelActieve=true&actionNPRP=Rechercher&lang=fr`` → HTML result
  list of ``toonondernemingps.html?ondernemingsnummer=<num>`` links +
  ``<td class="benaming">name</td>``.

Identifier pivot: the **numéro d'entreprise / ondernemingsnummer** (10 digits,
``0xxx.xxx.xxx``) — the Belgian analogue of SIREN. Enterprise numbers begin with 0
or 1; establishment-unit (UE) numbers begin with 2 and are filtered out of name
resolution. Activity codes are NACE-BEL.

Beyond Public Search — verified 2026-07-16, documented but **not wired** (each would
need a credential the pack does not carry, or a query contract we could not verify
without an account; wiring an unverified endpoint would violate "jamais d'endpoint
inventé"):

* **KBO Open Data** — free daily bulk of all active entities (download + SFTP,
  registration to secure delivery). Bulk, not a per-company lookup ⇒ not the pack
  pattern.
* **Public Search Web Service** — the paid official API (50 €/2000 req).
* **Annual accounts — BNB / Central Balance Sheet Office**: free human consultation
  via the *Consult* app (``consult.cbso.nbb.be``, a JS SPA — not deterministically
  scrapeable). The *authentic-data* **web services** are free too **but require
  registration** (a ``CLIENT_ID`` issued after approval via
  ``developer.cbso.nbb.be``) and their OpenAPI endpoints sit behind that portal
  (unverifiable here). ⇒ would plug in behind an optional ``BNB_CBSO_CLIENT_ID``
  once the endpoint schema is confirmed.
* **Legal notices — Moniteur belge** (``ejustice.just.fgov.be/cgi_tsv_pub``): free,
  no account, publications per legal entity — but the machine query contract (params
  to search by enterprise number) is not documented and we could not verify a stable
  parseable endpoint. ⇒ ``legalSignals`` stays ``[]`` rather than guess a contract.

Employment signals — **VDAB (Flandre)** publishes an **official free REST API**
(``developer.vdab.be/openservices`` — GET/POST ``vacatures`` + ``vacatures/bulk``),
but it requires a **free subscription key** and its request/response schema lives
behind the developer portal (unverifiable without an account) ⇒ would plug in behind
an optional ``VDAB_API_KEY`` once the schema is confirmed. **Le Forem** (Wallonie)
and **Actiris** (Bruxelles) expose no comparable documented free API. So ``jobs``
stays ``[]`` here — a documented gate, never invented data.

No-op: the pack only ever runs when Belgium is the targeted country (enforced by
the pack registry — zero-flag policy, no env var). Public Search itself needs no
credential; any HTTP/parse error degrades to the empty value — never a fabricated
company. To respect the portal, ``ondNP`` (natural persons) is left off — only legal
entities are resolved.

RGPD: Belgium is an EU member — full GDPR, no cross-border transfer barrier. Only
public commercial-register identity data is read (data minimisation); natural
persons are excluded from the search.
"""

from __future__ import annotations

import html
import logging
import re

import httpx

from app.services import provider_cache
from app.services.country_packs.base import (
    CountryPack,
    CountrySignals,
    RegistryEntity,
    empty_signals,
    note_registry_failure,
)
from app.services.rate_limiter import throttle

logger = logging.getLogger(__name__)

_BASE = "https://kbopub.economie.fgov.be/kbopub"
_DETAIL = _BASE + "/toonondernemingps.html"
_SEARCH = _BASE + "/zoeknaamfonetischform.html"
_TIMEOUT_S = 12.0

_UA = "Mozilla/5.0 (compatible; BellumAI/1.0; +https://bellum-ai.com)"


def _digits(value: str) -> str:
    return re.sub(r"\D", "", value or "")


def _normalize_bce(value: str) -> str:
    """Normalise to a 10-digit enterprise number (pads a 9-digit form with a leading 0)."""
    d = _digits(value)
    if len(d) == 9:
        d = "0" + d
    return d


def _format_bce(value: str) -> str:
    """``0202239951`` → ``0202.239.951`` (display form)."""
    d = _normalize_bce(value)
    return f"{d[0:4]}.{d[4:7]}.{d[7:10]}" if len(d) == 10 else (value or "").strip()


def _is_enterprise_number(value: str) -> bool:
    """Enterprise numbers are 10 digits starting with 0 or 1 (2xxx = establishment unit)."""
    d = _normalize_bce(value)
    return len(d) == 10 and d[0] in {"0", "1"}


def _clean(fragment: str) -> str:
    """Strip tags/entities and collapse whitespace (incl. non-breaking spaces)."""
    text = re.sub(r"<[^>]+>", " ", fragment or "")
    return re.sub(r"\s+", " ", html.unescape(text).replace("\xa0", " ")).strip()


def _label_value(page: str, label: str) -> str:
    """Value of a ``<td class="QL|RL">label</td><td>value</td>`` pair (first match).

    Colon-tolerant: the label may be given with or without its trailing ``:``.
    """
    label = label.rstrip(":").strip()
    pattern = re.compile(
        r'<td\s+class="(?:QL|RL)">\s*' + re.escape(label) + r'\s*:?\s*</td>\s*<td[^>]*>(.*?)</td>',
        re.IGNORECASE | re.DOTALL,
    )
    m = pattern.search(page)
    return _clean(m.group(1)) if m else ""


def _detail_url(number: str, *, lang: str = "fr") -> str:
    return f"{_DETAIL}?ondernemingsnummer={_normalize_bce(number)}&lang={lang}"


def _parse_detail(page: str, number: str) -> RegistryEntity | None:
    """Parse a KBO detail HTML page → RegistryEntity. ``None`` if it has no name."""
    denomination = _label_value(page, "Dénomination:")
    # The dénomination cell repeats "NAME Dénomination en français, depuis …" — keep
    # the leading token before the first descriptive suffix.
    name = re.split(r"\s+Dénomination\b", denomination, maxsplit=1)[0].strip() or denomination
    if not name:
        return None
    entity: RegistryEntity = {
        "source": "kbo",
        "country": "BE",
        "name": name,
        "registryId": _format_bce(number),
        "registryIdLabel": "numéro BCE",
        "detailUrl": _detail_url(number),
    }
    status = _label_value(page, "Statut:")
    if status:
        entity["status"] = status
    legal_form = _label_value(page, "Forme légale")
    if legal_form:
        entity["legalForm"] = legal_form
    seat = _label_value(page, "Adresse du siège:")
    if seat:
        entity["seat"] = seat
    ue = _label_value(page, "Nombre d'unités d'établissement (UE):")
    ue_digits = _digits(ue.split(" ")[0]) if ue else ""
    if ue_digits:
        entity["establishments"] = int(ue_digits)
    return entity


def _parse_search_results(page: str) -> list[tuple[str, str]]:
    """Extract ``(enterprise_number, name)`` pairs from a name-search result page.

    Only enterprise numbers (0/1-prefixed) are kept; establishment-unit rows
    (2-prefixed) are dropped. First occurrence per number wins.
    """
    out: list[tuple[str, str]] = []
    seen: set[str] = set()
    for row in re.findall(r"<tr[^>]*>(.*?)</tr>", page, re.DOTALL):
        num = re.search(r"ondernemingsnummer=([0-9.]+)", row)
        name = re.search(r'class="benaming">([^<]+)<', row)
        if not num or not name:
            continue
        normalized = _normalize_bce(num.group(1))
        if not _is_enterprise_number(normalized) or normalized in seen:
            continue
        seen.add(normalized)
        out.append((normalized, _clean(name.group(1))))
    return out


def _best_match(rows: list[tuple[str, str]], query: str) -> str | None:
    """Pick the best enterprise number for ``query``: exact name > startswith > first."""
    if not rows:
        return None
    q = query.strip().lower()
    for number, name in rows:
        if name.lower() == q:
            return number
    for number, name in rows:
        if name.lower().startswith(q):
            return number
    return rows[0][0]


class BelgianPack(CountryPack):
    """Belgique — KBO/BCE Public Search + local ontology. See module docstring."""

    code = "BE"
    identifier_label = "numéro BCE"
    country_name = "Belgique"
    languages = ("fr", "nl", "de")
    registry_name = "BCE / KBO (Banque-Carrefour des Entreprises)"
    status = "live"

    def entity_ontology(self) -> dict:
        return {
            "identifier": "numéro d'entreprise BCE (0xxx.xxx.xxx)",
            "activityCodes": "NACE-BEL",
            "legalForms": {
                "SA / NV": "société anonyme",
                "SRL / BV": "société à responsabilité limitée (ex-SPRL)",
                "Holding": "société de participation (à distinguer de l'opérationnelle)",
                "ASBL / VZW": "association sans but lucratif (souvent hors cible ESN)",
            },
            "regionalAxis": "région linguistique (Wallonie FR / Flandre NL / Bruxelles bilingue)",
            "note": (
                "Unités d'établissement (UE, n° commençant par 2) = sites, pas des "
                "entités juridiques distinctes. Segmentation linguistique FR/NL "
                "obligatoire pour les messages."
            ),
        }

    def local_vocabulary(self) -> dict:
        return {
            "country": "Belgique",
            "registry": "BCE / KBO (Banque-Carrefour des Entreprises)",
            "identifier": "numéro d'entreprise (0xxx.xxx.xxx)",
            "languages": ["fr", "nl"],
            "prompt_fragment": (
                "PAYS CIBLE : Belgique.\n"
                "- Registre officiel : BCE/KBO (Banque-Carrefour des Entreprises). "
                "Identifiant : numéro d'entreprise (10 chiffres, 0xxx.xxx.xxx). "
                "Codes d'activité : NACE-BEL.\n"
                "- Formes juridiques : SA/NV, SRL/BV (ex-SPRL), holding, ASBL/VZW.\n"
                "- Comptes annuels publics : Centrale des bilans de la BNB (à citer si "
                "connus, jamais inventés). Annonces légales : Moniteur belge.\n"
                "- Marché bilingue FR/NL (+ DE à l'est) : adapte messages et titres à "
                "la région linguistique — Wallonie (FR), Flandre (NL), Bruxelles "
                "(bilingue). Proximité culturelle FR forte côté Wallonie/Bruxelles."
            ),
        }

    async def registry_lookup(self, query: str, *, client: httpx.AsyncClient | None = None) -> RegistryEntity | None:
        cleaned = (query or "").strip()
        if not cleaned:
            return None  # empty ⇒ NO network, NO fabricated data
        owns = client is None
        http = client or httpx.AsyncClient(timeout=_TIMEOUT_S, headers={"User-Agent": _UA})
        try:
            if _is_enterprise_number(cleaned):
                return await self._lookup_by_number(http, _normalize_bce(cleaned))
            number = await self._resolve_name(http, cleaned)
            return await self._lookup_by_number(http, number) if number else None
        finally:
            if owns:
                await http.aclose()

    async def _lookup_by_number(self, http: httpx.AsyncClient, number: str) -> RegistryEntity | None:
        # SIG-C (11/10) — 30 j par numéro BCE (identifiant légal) ; une erreur rend None, jamais cachée.
        return await provider_cache.cached_json(
            "registry:be_kbo", number, lambda: self._fetch_by_number(http, number), ttl=provider_cache.TTL_FIRMO
        )

    async def _fetch_by_number(self, http: httpx.AsyncClient, number: str) -> RegistryEntity | None:
        try:
            async with throttle("kbo"):
                resp = await http.get(_detail_url(number), follow_redirects=True)
            if not resp.is_success:
                note_registry_failure("kbo", f"détail {number}", status=resp.status_code)
                return None
            page = resp.text
        except Exception as exc:  # noqa: BLE001 — a source must never break research
            note_registry_failure("kbo", f"détail {number}", exc=exc)
            return None
        return _parse_detail(page, number)

    async def _resolve_name(self, http: httpx.AsyncClient, name: str) -> str | None:
        params = {
            "searchWord": name,
            "_oudeBenaming": "on",
            "ondRP": "true",  # legal entities only (natural persons excluded — GDPR)
            "_ondRP": "on",
            "filterEnkelActieve": "true",
            "_filterEnkelActieve": "on",
            "actionNPRP": "Rechercher",
            "lang": "fr",
        }
        try:
            async with throttle("kbo"):
                resp = await http.get(_SEARCH, params=params, follow_redirects=True)
            if not resp.is_success:
                # KBO est public/sans clé : le 429 (budget par IP) est le mode
                # d'échec le plus probable, et il ressemblait trait pour trait à
                # « aucune entreprise belge de ce nom ».
                note_registry_failure("kbo", f"recherche {name!r}", status=resp.status_code)
                return None
            page = resp.text
        except Exception as exc:  # noqa: BLE001
            note_registry_failure("kbo", f"recherche {name!r}", exc=exc)
            return None
        return _best_match(_parse_search_results(page), name)

    async def collect_signals(
        self, company: str, *, ident: str | None = None, client: httpx.AsyncClient | None = None
    ) -> CountrySignals:
        out = empty_signals(self.code)
        cleaned = (company or "").strip()
        if not cleaned:
            return out
        entity = await self.registry_lookup(ident or cleaned, client=client)
        if entity is None:
            return out
        out["registry"] = entity
        desc_bits = [b for b in (entity.get("legalForm"), entity.get("seat"), entity.get("status")) if b]
        out["hits"] = [
            {
                "title": f"{entity['name']} — {entity.get('registryId', '')} (BCE/KBO)".strip(),
                "url": entity["detailUrl"],
                "description": " · ".join(desc_bits)[:500],
                "category": "other",
                "source": "kbo",
            }
        ]
        # jobs / legalSignals: no free structured API (VDAB/Forem/Actiris, Moniteur
        # belge) — documented absence, left empty rather than invented.
        return out
