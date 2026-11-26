"""Country pack **Canada (CA)** — Canada's Business Registries (CBR / MRAS federated search).

Registry source (VERIFIED LIVE 2026-07-16 — free, official, **no key**):

* Search : ``GET https://ised-isde.canada.ca/cbr/srch/api/v1/search`` with params
  ``fq=keyword:{<name-or-number>} AND Status_State:Active``, ``lang=en|fr``,
  ``queryaction=fieldquery``, ``sortfield=score``, ``sortorder=desc``,
  ``pagesize=N``, ``page=0`` (**0-based** — ``paging.next`` proves it) →
  ``{totalResults, count, docs[], paging}``. Each doc:
  ``{Registry_Source, Jurisdiction (CC|QC|ON|BC|AB|…), MRAS_ID, Juri_ID,
  Company_Name, Entity_Type, MRAS_Entity_Type, City, Reg_office_province,
  Status_State, Status_Date, Date_Incorporated, BN?, hierarchy, score}``.
  The API base is the one the official SPA itself uses (read from its own
  ``/cbr-rec/config.js`` → ``window.SEARCH_API_URL``); the old
  ``searchapi.mrasservice.ca`` host no longer resolves. Searching by number works
  through the same ``keyword`` syntax (verified: NEQ ``1142478016`` → CGI INC.).
* Federal detail page : ``https://ised-isde.canada.ca/cc/lgcy/fdrlCrpDtls.html?
  corpId=<Juri_ID>&lang=eng`` for ``Jurisdiction == "CC"`` (Corporations Canada) —
  verified 200 (Open Text Corporation, corpId 18052956) and **PARSED** (re-verified
  2026-07-16): the page is server-rendered legacy JSP on the GC WET/Bootstrap
  template, whose label grid (``col-sm-3``/``col-sm-9`` rows — corporate name,
  status, corporation number, BN, governing legislation) and registered-office
  panel are stable, regex-parseable markup (same stdlib approach as the KBO pack).
  Parsed fields ENRICH the federal hit (full registered-office address, governing
  legislation) — graceful ``{}`` on any fetch/parse miss, ``Not Available`` values
  dropped, never a fabricated field.
* Results page (all jurisdictions) : ``https://ised-isde.canada.ca/cbr-rec/en/
  search/results?search=<query>&status=Active`` — verified 200; used as the hit /
  detail URL when no per-entity official page is verifiable for a province.

CBR federates **14 registries** (Corporations Canada + participating provinces —
Québec, Ontario, BC, Alberta, Saskatchewan, Manitoba, … observed as ``CC``/``QC``/
``ON``/``BC``/``AB`` in live results), so the **REQ Québec** and **Corporations
Canada** are both covered through this single endpoint — no per-province wiring.

Identifier pivot: jurisdiction-scoped ``Juri_ID`` — the **NEQ** (numéro
d'entreprise du Québec, 10 digits starting ``11``) for QC, the **federal
corporation number** for CC, the provincial corporation number elsewhere; plus the
CRA **BN** (Business Number, 9 digits + optional ``RC####`` program suffix) when
the source registry publishes it. A single group legitimately appears several
times (federal incorporation + extra-provincial registrations) — the
extra-provincial registration is NOT a separate company (same nuance as the Swiss
Zweigniederlassung).

Employment signals: **Job Bank / Guichet-Emplois** (jobbank.gc.ca) has NO free
self-serve API — its XML feed requires a signed agreement with ESDC, and the open
-data set (open.canada.ca, "Job Postings … National Job Bank") is a **monthly bulk
CSV**, not a per-company live lookup. ⇒ ``jobs`` stays ``[]`` — documented gate,
never invented. It would slot in behind an operator-supplied feed agreement.

No-op / graceful: CBR needs no credential, so the ONLY gate is the pack registry
(country=CA — enforced by ``get_active_pack``, exactly like the Belgian pack;
zero-flag policy, no env var). Any HTTP/parse error degrades to ``None``/empty — never a
fabricated company.

Privacy / legal basis: **PIPEDA** (federal Personal Information Protection and
Electronic Documents Act) — and Québec's Law 25 provincially. Canada benefits from
the EU **adequacy decision (2002, reaffirmed 15 Jan 2024)** for PIPEDA-covered
commercial organisations. Only public corporate-registry identity data is read —
data minimisation, no natural-person lookup. Bilingual market: EN default, FR-CA
mandatory in Québec (Charte de la langue française / Loi 96). See ``COMPLIANCE.md``.
"""

from __future__ import annotations

import html as html_lib
import logging
import re
from urllib.parse import quote

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

_SEARCH_URL = "https://ised-isde.canada.ca/cbr/srch/api/v1/search"
_FED_DETAIL_URL = "https://ised-isde.canada.ca/cc/lgcy/fdrlCrpDtls.html?corpId={corp_id}&lang=eng"
_RESULTS_URL = "https://ised-isde.canada.ca/cbr-rec/en/search/results?search={query}&status=Active"
_TIMEOUT_S = 10.0


def _is_bn(value: str) -> bool:
    """True for a CRA Business Number — 9 digits, optional ``RC####`` program suffix."""
    return re.fullmatch(r"\d{9}(?:RC\d{4})?", (value or "").strip(), re.IGNORECASE) is not None


def _is_neq(value: str) -> bool:
    """True for a Québec NEQ — 10 digits starting ``11`` (registre des entreprises)."""
    return re.fullmatch(r"11\d{8}", (value or "").strip()) is not None


def _normalize_name(value: str) -> str:
    """Case/punctuation-insensitive company-name key for matching."""
    return re.sub(r"[^a-z0-9]+", " ", (value or "").lower()).strip()


def _best_match(docs: list[dict], query: str) -> dict | None:
    """Best CBR doc for ``query``: exact normalized name > startswith > first (docs
    arrive score-sorted, so 'first' is the API's own best guess)."""
    if not docs:
        return None
    q = _normalize_name(query)
    names = [(doc, _normalize_name(str(doc.get("Company_Name") or ""))) for doc in docs]
    for doc, name in names:
        if name == q:
            return doc
    for doc, name in names:
        if name.startswith(q):
            return doc
    return docs[0]


def _entity_from_doc(doc: dict) -> RegistryEntity | None:
    """Map a CBR search doc → :class:`RegistryEntity`."""
    name = str(doc.get("Company_Name") or "").strip()
    juri_id = str(doc.get("Juri_ID") or "").strip()
    if not name or not juri_id:
        return None
    jurisdiction = str(doc.get("Jurisdiction") or "").strip()
    entity: RegistryEntity = {
        "source": "cbr",
        "country": "CA",
        "name": name,
        "registryId": juri_id,
        "registryIdLabel": "numéro d'entreprise",
    }
    legal_form = str(doc.get("Entity_Type") or "").strip()
    if legal_form:
        entity["legalForm"] = legal_form
    seat = ", ".join(
        part for part in (str(doc.get("City") or "").strip(), str(doc.get("Reg_office_province") or "").strip()) if part
    )
    if seat:
        entity["seat"] = seat
    if jurisdiction:
        entity["region"] = jurisdiction  # CC = fédéral (Corporations Canada), sinon province
    status = str(doc.get("Status_State") or "").strip()
    if status:
        entity["status"] = status
    if jurisdiction == "CC":
        entity["detailUrl"] = _FED_DETAIL_URL.format(corp_id=quote(juri_id, safe=""))
    else:
        entity["detailUrl"] = _RESULTS_URL.format(query=quote(name, safe=""))
    return entity


def _strip_tags(fragment: str) -> str:
    """Tag-free, entity-decoded, whitespace-collapsed text of an HTML fragment."""
    text = re.sub(r"<[^>]+>", " ", fragment or "")
    return re.sub(r"\s+", " ", html_lib.unescape(text).replace("\xa0", " ")).strip()


#: Label grid of the federal detail page (GC WET/Bootstrap template): a
#: ``col-sm-3`` bold label next to its ``col-sm-9`` value. Class attributes vary
#: only in internal spacing on the live page — hence the lenient ``[^"]*``.
_DETAIL_ROW_RE = re.compile(
    r'<div class="col-sm-3[^"]*"[^>]*>\s*<b>([^<]+?)\s*:?\s*</b>\s*</div>\s*'
    r'<div class="col-sm-9[^"]*"[^>]*>(.*?)</div>',
    re.DOTALL,
)

#: Registered-office panel: heading span → panel body → first address column.
_OFFICE_RE = re.compile(
    r'<span class="h2">Registered office address</span>.*?'
    r'<section class="panel-body">.*?<div class="col-sm-8">(.*?)</div>',
    re.DOTALL,
)

#: Page label → normalized field key. Only these five are read — anything else
#: on the page (directors, ISC…) is deliberately left alone (data minimisation).
_DETAIL_FIELDS = {
    "Corporate name": "corporateName",
    "Status": "status",
    "Corporation number": "corporationNumber",
    "Business number (BN)": "businessNumber",
    "Governing legislation": "governingLegislation",
}


def _parse_federal_detail(page: str) -> dict:
    """Clean fields off a Corporations Canada federal detail page (see module
    docstring). Only labels in ``_DETAIL_FIELDS`` + the registered-office address
    are read; empty / ``Not Available`` values are dropped — ``{}`` on any
    non-matching document, never a fabricated field."""
    out: dict = {}
    for m in _DETAIL_ROW_RE.finditer(page or ""):
        key = _DETAIL_FIELDS.get(" ".join(m.group(1).split()))
        if not key:
            continue
        value = _strip_tags(m.group(2))
        if not value or value.lower() == "not available":
            continue
        out[key] = value
    office = _OFFICE_RE.search(page or "")
    if office:
        address = _strip_tags(re.sub(r"<br\s*/?>", ", ", office.group(1)))
        address = re.sub(r"\s*,\s*", ", ", address).strip(" ,")
        if address:
            out["registeredOffice"] = address
    return out


class CanadaPack(CountryPack):
    """Canada — CBR/MRAS federated registry search + local ontology. See module docstring."""

    code = "CA"
    identifier_label = "numéro d'entreprise"
    country_name = "Canada"
    languages = ("en", "fr")
    registry_name = "Registres d'entreprises du Canada (CBR / MRAS)"
    status = "live"

    def entity_ontology(self) -> dict:
        return {
            "identifier": (
                "Juri_ID par juridiction : NEQ Québec (10 chiffres commençant par 11), "
                "n° de société fédérale (Corporations Canada), n° provincial ; "
                "+ BN fiscal ARC (9 chiffres, suffixe RC####) quand publié"
            ),
            "legalForms": {
                "Corporation (Inc./Ltée)": "société par actions — LCSA fédérale (CBCA) ou loi provinciale (OBCA Ontario, LSAQ Québec…)",
                "Extra-provincial corporation": (
                    "immatriculation d'une société existante dans une autre province — "
                    "PAS une société distincte (analogie succursale/Zweigniederlassung)"
                ),
                "Partnership / société de personnes": "générale ou en commandite (LP)",
                "ULC": "unlimited liability company (AB/BC/NS, montages fiscaux transfrontaliers)",
            },
            "regionalAxis": "juridiction (fédéral CC vs provinces — QC/ON/BC/AB…)",
            "note": (
                "Double niveau fédéral/provincial : un même groupe apparaît plusieurs "
                "fois dans le registre fédéré (constitution fédérale + immatriculations "
                "extra-provinciales) — dédupliquer par le siège réel. Marché bilingue : "
                "EN par défaut, FR-CA obligatoire au Québec (Loi 96/OQLF) — un "
                "commercial visant Montréal écrit en français."
            ),
        }

    def local_vocabulary(self) -> dict:
        return {
            "country": "Canada",
            "registry": "Registres d'entreprises du Canada (CBR / MRAS, recherche fédérée)",
            "identifier": "numéro d'entreprise (NEQ Québec / n° fédéral / n° provincial ; BN fiscal)",
            "languages": ["en", "fr"],
            "prompt_fragment": (
                "PAYS CIBLE : Canada.\n"
                "- Registre officiel : Registres d'entreprises du Canada (recherche "
                "fédérée CBR/MRAS — Corporations Canada + registres provinciaux dont le "
                "REQ Québec). Identifiants : NEQ au Québec (10 chiffres commençant par "
                "11, ex. 1142478016), numéro de société fédérale (Corporations Canada), "
                "numéro provincial ; BN fiscal de l'ARC (9 chiffres) quand publié.\n"
                "- Double niveau fédéral/provincial : une même société peut être "
                "constituée au fédéral (LCSA/CBCA) ET immatriculée dans plusieurs "
                "provinces (extra-provincial) — ce ne sont PAS des sociétés distinctes ; "
                "cibler le siège réel.\n"
                "- Formes juridiques : Corporation (Inc./Ltée, fédérale ou provinciale), "
                "société de personnes (LP), ULC.\n"
                "- Marché bilingue : anglais par défaut ; au Québec le français est la "
                "langue des affaires (Loi 96) — messages FR-CA pour un décideur "
                "québécois, EN ailleurs (Toronto, Vancouver, Calgary).\n"
                "- Pas de dépôt public généralisé des comptes des sociétés fermées : ne "
                "pas inventer de chiffres financiers (sociétés cotées : SEDAR+).\n"
                "- Signaux d'achat : appels d'offres publics fédéraux sur CanadaBuys "
                "(AchatsCanada) et SEAO au Québec ; citer la source et la date."
            ),
        }

    async def registry_lookup(self, query: str, *, client: httpx.AsyncClient | None = None) -> RegistryEntity | None:
        doc = await self._resolve_doc_owned(query, client=client)
        return _entity_from_doc(doc) if doc else None

    async def collect_signals(
        self, company: str, *, ident: str | None = None, client: httpx.AsyncClient | None = None
    ) -> CountrySignals:
        out = empty_signals(self.code)
        cleaned = (ident or company or "").strip()
        if not cleaned:
            return out
        owns = client is None
        http = client or httpx.AsyncClient(timeout=_TIMEOUT_S)
        try:
            docs = await self._search(http, cleaned)
            doc = _best_match(docs, cleaned)
            if not doc:
                return out
            entity = _entity_from_doc(doc)
            if entity is None:
                return out
            out["registry"] = entity
            # Federal (CC) entities have a verified per-entity official page —
            # parse it for the full registered-office address + governing
            # legislation (graceful {} on any miss; provinces have no such page).
            detail = await self._federal_detail(http, entity) if entity.get("region") == "CC" else {}
            incorporated = str(doc.get("Date_Incorporated") or "").strip()
            bn = str(doc.get("BN") or "").strip()
            if not (bn and _is_bn(bn)):
                detail_bn = str(detail.get("businessNumber") or "").strip()
                bn = detail_bn if _is_bn(detail_bn) else ""
            legislation = str(detail.get("governingLegislation") or "").strip()
            office = str(detail.get("registeredOffice") or "").strip()
            desc_bits = [
                entity.get("legalForm", ""),
                entity.get("seat", ""),
                entity.get("status", ""),
                f"constituée le {incorporated}" if incorporated else "",
                f"BN {bn}" if bn else "",
                f"législation : {legislation}" if legislation else "",
                f"siège social : {office}" if office else "",
            ]
            out["hits"] = [
                {
                    "title": (
                        f"{entity['name']} — {entity['registryId']} ({entity.get('region', 'CA')}, registre canadien)"
                    ),
                    "url": entity["detailUrl"],
                    "description": " · ".join(b for b in desc_bits if b)[:500],
                    "category": "other",
                    "source": "cbr",
                }
            ]
            # legalSignals: the CBR search doc carries no dated legal notices; provincial
            # gazettes have no verified free per-company endpoint — documented absence.
            # jobs: Job Bank XML feed is agreement-gated; open data is monthly bulk —
            # documented absence, never invented.
            return out
        finally:
            if owns:
                await http.aclose()

    async def _federal_detail(self, http: httpx.AsyncClient, entity: RegistryEntity) -> dict:
        """Fetch + parse the Corporations Canada detail page of a federal entity.
        ``{}`` on any HTTP/parse miss — the extra depth never sinks the pack.

        SIG-C (11/10) — 30 j par numéro de société (identifiant légal) ; ``{}``
        (erreur ou page vide) n'est jamais caché."""
        return await provider_cache.cached_json(
            "registry:ca_cbr",
            str(entity.get("registryId") or "").strip(),
            lambda: self._fetch_federal_detail(http, entity),
            ttl=provider_cache.TTL_FIRMO,
        )

    async def _fetch_federal_detail(self, http: httpx.AsyncClient, entity: RegistryEntity) -> dict:
        url = entity.get("detailUrl") or ""
        if not url:
            return {}
        try:
            async with throttle("cbr"):
                resp = await http.get(url, headers={"Accept": "text/html"})
            if not resp.is_success:
                note_registry_failure("cbr", f"détail fédéral {url}", status=resp.status_code)
                return {}
            return _parse_federal_detail(resp.text)
        except Exception as exc:  # noqa: BLE001 — a source must never break research
            note_registry_failure("cbr", f"détail fédéral {url}", exc=exc)
            return {}

    async def _resolve_doc_owned(self, query: str, *, client: httpx.AsyncClient | None) -> dict | None:
        """Resolve ``query`` (name, NEQ, corporation number…) to the best raw CBR doc,
        owning-or-reusing the ``client``. NO network on an empty query."""
        cleaned = (query or "").strip()
        if not cleaned:
            return None
        owns = client is None
        http = client or httpx.AsyncClient(timeout=_TIMEOUT_S)
        try:
            docs = await self._search(http, cleaned)
            return _best_match(docs, cleaned)
        finally:
            if owns:
                await http.aclose()

    async def _search(self, http: httpx.AsyncClient, query: str) -> list[dict]:
        params = {
            "fq": f"keyword:{{{query}}} AND Status_State:Active",
            "lang": "en",
            "queryaction": "fieldquery",
            "sortfield": "score",
            "sortorder": "desc",
            "pagesize": "10",
            "page": "0",  # 0-based (paging.next == "page=1" on the first page)
        }
        try:
            async with throttle("cbr"):
                resp = await http.get(_SEARCH_URL, params=params, headers={"Accept": "application/json"})
            if not resp.is_success:
                note_registry_failure("cbr", f"recherche {query!r}", status=resp.status_code)
                return []
            payload = resp.json()
        except Exception as exc:  # noqa: BLE001 — a source must never break research
            note_registry_failure("cbr", f"recherche {query!r}", exc=exc)
            return []
        docs = payload.get("docs") if isinstance(payload, dict) else None
        return [d for d in docs if isinstance(d, dict)] if isinstance(docs, list) else []
