"""Country pack **États-Unis (US)** — SEC EDGAR, the federal securities-filings registry.

Registry sources (ALL VERIFIED LIVE 2026-07-16 — free, official, no key; the SEC
fair-access policy requires a **declared User-Agent** — the endpoints return **403**
without one — and caps traffic at **10 requests/second** ; policy + docs:
``https://www.sec.gov/about/webmaster-frequently-asked-questions`` and
``https://www.sec.gov/search-filings/edgar-application-programming-interfaces``):

* Ticker/name→CIK : ``GET https://www.sec.gov/files/company_tickers.json`` —
  ``{"0": {cik_str, ticker, title}, …}`` for every listed SEC registrant.
* Company profile : ``GET https://data.sec.gov/submissions/CIK##########.json``
  (10-digit zero-padded CIK) → ``{cik, name, entityType, sic, sicDescription,
  tickers, exchanges, ein, stateOfIncorporation(+Description), addresses{business},
  filings{recent{form[], filingDate[], primaryDocDescription[], …}}}``.
* Financial facts : ``GET https://data.sec.gov/api/xbrl/companyfacts/CIK…json``
  (XBRL us-gaap/dei concepts) — **WIRED** (re-verified live 2026-07-16 on EPAM
  ``CIK0001352010`` and Accenture ``CIK0001467373``): a factual mini financial
  profile (recent ANNUAL revenues + net income + shares outstanding, each with its
  10-K filing date) rendered as a « données financières SEC (10-K) » hit. Only
  tags actually present are read; a period is annual ONLY by real start→end
  duration (~1 year) — the payload tags quarterly periods ``form=10-K, fp=FY``
  too, so ``fp`` alone would fabricate a "yearly" figure from a quarter. Restated
  values (same period end refiled in later 10-Ks) dedup to the latest filing.
  Absent tag / no facts (404) ⇒ nothing — JAMAIS d'extrapolation.
* Full-text search : ``GET https://efts.sec.gov/LATEST/search-index?q=…&ciks=…``
  → ``hits.hits[]._id ("adsh:filename") + _source {display_names, ciks, file_date,
  file_type, form}`` — **WIRED** (re-verified live 2026-07-16, incl. ``ciks`` /
  ``forms`` / ``dateRange=custom&startdt&enddt`` params and the
  ``…/Archives/edgar/data/{cik}/{adsh}/{filename}`` document URL mapping): recent
  filings of the resolved registrant mentioning IT/digital/cyber phrases become
  dated signals sourced by the actual filing URL (one throttled request per
  phrase, additive hits + legal signals).
* Public detail page : ``https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany
  &CIK=##########`` (used as ``detailUrl`` / hit URL — verified 200; the
  ``&type=10-K`` variant anchors the financial-profile hit).

Identifier pivot: the **CIK** (Central Index Key, 10-digit zero-padded) — the SEC's
permanent registrant identifier, the closest US analogue of the French SIREN that is
actually public. The **EIN** (IRS tax id) is NOT public in the general case (EDGAR
exposes it only for filers); there is **no free national company registry**: company
law is state-level, and the 50 Secretary-of-State registries are fragmented with no
unified free API (Delaware = no API, paid verification; OpenCorporates aggregates
them but its API is restricted/commercial). ⇒ **documented limitation: this pack
resolves SEC registrants only** — essentially listed companies (+ registered debt
issuers). A private US company yields ``None`` — never a fabricated identity. A
future state-registry integration would slot in behind the same interface.

Ontology note: incorporation state ≠ operating HQ (the classic Delaware split —
e.g. EPAM Systems is Delaware-incorporated with its HQ in Newtown, PA). EDGAR gives
both (``stateOfIncorporation`` vs ``addresses.business``).

Legal signals: the ``filings.recent`` array of the submissions payload — dated
**8-K** (material events), 10-K/10-Q (annual/quarterly reports), DEF 14A (proxy) —
rides on the same single fetch, exactly like the Zefix SHAB/FOSC publications.

Employment signals: NO free per-company US job-postings API exists (Indeed and
LinkedIn retired/restrict their public job-search APIs; USAJOBS covers federal
government vacancies only). ``jobs`` stays ``[]`` — documented absence, never
invented. Public federal procurement (USAspending/SAM.gov, free APIs) is a
documented candidate for a later, separate signal source.

No-op / graceful: EDGAR needs no credential, so the ONLY gate is the pack registry
(country=US — enforced by ``get_active_pack``, exactly like the Belgian pack;
zero-flag policy, no env var). Any HTTP/parse error degrades to ``None``/empty — never a
fabricated company. ``SEC_EDGAR_USER_AGENT`` SHOULD be set by the operator to a
real contact (SEC asks for ``Sample Company Name AdminContact@example.com``);
without it a safe product default is sent.

Privacy / legal basis: **no GDPR equivalence** — the US has no federal omnibus
privacy law; the applicable regime is state privacy law (CCPA/CPRA in California
et al.), which regulates *consumer* data. This pack reads only public corporate
registry data (company identity, filings metadata) — no natural-person data — so
GDPR cross-border concerns for EU-based users are limited to data minimisation,
which the pack enforces by design. See ``COMPLIANCE.md``.
"""

from __future__ import annotations

import asyncio
import logging
import os
import re
from datetime import date, timedelta

import httpx

from app.services import provider_cache
from app.services.country_packs.base import (
    CountryPack,
    CountrySignals,
    RegistryEntity,
    dedup_hits,
    empty_signals,
    note_registry_failure,
)
from app.services.rate_limiter import throttle

logger = logging.getLogger(__name__)

_TICKERS_URL = "https://www.sec.gov/files/company_tickers.json"
_SUBMISSIONS_URL = "https://data.sec.gov/submissions/CIK{cik}.json"
_DETAIL_URL = "https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK={cik}"
_TENK_LIST_URL = "https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK={cik}&type=10-K"
_COMPANYFACTS_URL = "https://data.sec.gov/api/xbrl/companyfacts/CIK{cik}.json"
_FTS_URL = "https://efts.sec.gov/LATEST/search-index"
_FILING_URL = "https://www.sec.gov/Archives/edgar/data/{cik}/{adsh}/{filename}"
_TIMEOUT_S = 10.0
#: companyfacts payloads run multi-MB (EPAM ≈ 2.9 MB, Accenture ≈ 4.4 MB) — give
#: that single GET a wider per-request timeout than the pack default.
_FACTS_TIMEOUT_S = 20.0

#: IT/digital/cyber phrases searched INSIDE the resolved registrant's filings via
#: EDGAR full-text search — exact-phrase quoted, ONE throttled request per phrase.
#: Deliberately short: each entry costs a request against the shared SEC cap.
_FTS_IT_QUERIES: tuple[str, ...] = (
    '"digital transformation"',
    '"cybersecurity"',
    '"information technology"',
)
_FTS_FORMS = "8-K,10-K,10-Q"  # material events + annual/quarterly report sections
_FTS_LOOKBACK_DAYS = 730  # « dépôts récents » — server-side startdt/enddt window
_FTS_HITS_PER_QUERY = 2
_FTS_MAX_HITS = 5

#: XBRL revenue concepts, most-specific first. A registrant uses ONE of them per
#: era (EPAM moved from ``Revenues`` to the ASC-606 tag in 2018; Accenture still
#: files ``Revenues``) — the tag with the freshest annual value wins.
_REVENUE_TAGS = ("RevenueFromContractWithCustomerExcludingAssessedTax", "Revenues")
#: A real fiscal year lasts ~365 days. companyfacts tags QUARTERLY periods with
#: ``form=10-K, fp=FY`` too (verified on Accenture: Q4 revenue rides fp=FY), so
#: only the actual start→end duration separates annual from quarterly facts.
_ANNUAL_MIN_DAYS, _ANNUAL_MAX_DAYS = 330, 400

# "0001467373" / "1467373" / "CIK 1467373" / "CIK0001467373" — a CIK in any spacing.
_CIK_RE = re.compile(r"(?:CIK[\s:]*)?(\d{1,10})", re.IGNORECASE)

#: Material filing forms surfaced as dated legal signals (8-K = material corporate
#: events; 10-K/10-Q = annual/quarterly reports; 20-F/6-K = foreign private issuers;
#: DEF 14A = proxy). Ownership noise (Forms 3/4/5, SC 13G…) is left out.
_SIGNAL_FORMS = {"8-K", "10-K", "10-Q", "20-F", "6-K", "DEF 14A", "S-1"}


def _is_cik(value: str) -> bool:
    """True when ``value`` is (only) a CIK — bare digits or ``CIK``-prefixed."""
    return re.fullmatch(r"(?:CIK[\s:]*)?\d{1,10}", (value or "").strip(), re.IGNORECASE) is not None


def _normalize_cik(value: str) -> str:
    """Canonical 10-digit zero-padded CIK from any accepted shape (``""`` when not a CIK)."""
    cleaned = (value or "").strip()
    if not _is_cik(cleaned):
        return ""
    m = _CIK_RE.search(cleaned)
    return m.group(1).zfill(10) if m else ""


def _headers() -> dict[str, str]:
    """SEC fair-access headers. The operator SHOULD set ``SEC_EDGAR_USER_AGENT`` to a
    real declared contact (e.g. ``"Acme ops@acme.com"``); the product default keeps
    the pack functional (the SEC requirement is a *declared* UA, not a credential)."""
    ua = os.environ.get("SEC_EDGAR_USER_AGENT", "").strip() or "BellumAI/1.0 (+https://bellum-ai.com)"
    return {"User-Agent": ua, "Accept": "application/json"}


def _match_ticker_row(rows: list[dict], query: str) -> dict | None:
    """Best ``{cik_str, ticker, title}`` row for ``query``: exact ticker > exact
    title > title startswith > title contains (all case-insensitive)."""
    q = (query or "").strip()
    if not q or not rows:
        return None
    q_up, q_low = q.upper(), q.lower()
    for row in rows:
        if str(row.get("ticker") or "").upper() == q_up:
            return row
    titles = [(row, str(row.get("title") or "").lower()) for row in rows]
    for row, title in titles:
        if title == q_low:
            return row
    for row, title in titles:
        if title.startswith(q_low):
            return row
    for row, title in titles:
        if q_low in title:
            return row
    return None


def _entity_from_submissions(payload: dict) -> RegistryEntity | None:
    """Map a ``data.sec.gov/submissions`` JSON payload → :class:`RegistryEntity`."""
    name = str(payload.get("name") or "").strip()
    cik = _normalize_cik(str(payload.get("cik") or ""))
    if not name or not cik:
        return None
    entity: RegistryEntity = {
        "source": "sec_edgar",
        "country": "US",
        "name": name,
        "registryId": cik,
        "registryIdLabel": "CIK",
        "detailUrl": _DETAIL_URL.format(cik=cik),
    }
    inc = str(payload.get("stateOfIncorporationDescription") or payload.get("stateOfIncorporation") or "").strip()
    if inc:
        entity["region"] = inc  # state (or country) of incorporation — ≠ operating HQ
    biz = payload.get("addresses", {}).get("business") or {}
    seat = ", ".join(
        part
        for part in (
            str(biz.get("city") or "").strip(),
            str(biz.get("stateOrCountryDescription") or "").strip(),
        )
        if part
    )
    if seat:
        entity["seat"] = seat
    return entity


def _signals_from_submissions(payload: dict) -> list[dict]:
    """Dated legal signals from ``filings.recent`` (material forms only, cap 20).
    The recent arrays are parallel and sorted most-recent-first by the SEC."""
    recent = payload.get("filings", {}).get("recent") or {}
    forms = recent.get("form") or []
    dates = recent.get("filingDate") or []
    descs = recent.get("primaryDocDescription") or []
    out: list[dict] = []
    for i, form in enumerate(forms):
        if form not in _SIGNAL_FORMS:
            continue
        desc = str(descs[i] if i < len(descs) else "").strip()
        out.append(
            {
                "date": str(dates[i] if i < len(dates) else "").strip(),
                "type": f"SEC {form}",
                "message": desc[:500],
            }
        )
        if len(out) >= 20:
            break
    return out


def _filing_url(fts_id: str, ciks: list) -> str:
    """EDGAR full-text-search ``_id`` (``adsh:filename``) + CIK → the public
    Archives document URL (verified live). ``""`` on any malformed shape — a
    signal is only surfaced with its REAL source URL, never a guessed one."""
    adsh, _, filename = (fts_id or "").partition(":")
    if not adsh or not filename or not ciks:
        return ""
    try:
        cik_short = str(int(str(ciks[0])))  # Archives paths use the unpadded CIK
    except (TypeError, ValueError):
        return ""
    return _FILING_URL.format(cik=cik_short, adsh=adsh.replace("-", ""), filename=filename)


def _fts_hits_from_payload(payload: object, label: str) -> list[dict]:
    """Web-block-ready hits from one EDGAR full-text-search response: each is a
    real filing DATED (``file_date``) and SOURCED (Archives document URL), tagged
    with the matched phrase. Malformed/empty payloads yield ``[]``. Payload
    (relevance) order is preserved — the caller merges and date-sorts."""
    raw = payload.get("hits", {}).get("hits") if isinstance(payload, dict) else None
    out: list[dict] = []
    for h in raw if isinstance(raw, list) else []:
        if not isinstance(h, dict):
            continue
        src = h.get("_source") or {}
        url = _filing_url(str(h.get("_id") or ""), src.get("ciks") or [])
        filed = str(src.get("file_date") or "").strip()
        form = str(src.get("form") or "").strip()
        if not url or not filed or not form:
            continue
        names = src.get("display_names") or []
        company = str(names[0]).strip() if names else ""
        file_type = str(src.get("file_type") or "").strip()
        desc_bits = [
            company,
            f"document {file_type}" if file_type and file_type != form else "",
            f"dépôt SEC mentionnant « {label} »",
        ]
        out.append(
            {
                "title": f"SEC {form} du {filed} — mention « {label} »",
                "url": url,
                "description": " · ".join(b for b in desc_bits if b)[:500],
                "category": "other",
                "source": "sec_edgar_fts",
                # extra keys consumed by the legal-signal mapping (harmless in hits)
                "date": filed,
                "type": f"SEC {form}",
            }
        )
    return out


def _annual_series(tag_payload: object, unit: str, n: int = 3) -> list[dict]:
    """Recent ANNUAL values of one XBRL concept: 10-K facts whose real start→end
    duration is ~1 year (see ``_ANNUAL_MIN_DAYS`` — ``fp=FY`` alone also tags
    quarters), deduped by period end keeping the latest-filed restatement,
    most-recent-first, capped at ``n``. Only facts actually present are returned."""
    entries = tag_payload.get("units", {}).get(unit) if isinstance(tag_payload, dict) else None
    by_end: dict[str, dict] = {}
    for v in entries if isinstance(entries, list) else []:
        if not isinstance(v, dict) or v.get("form") != "10-K" or v.get("val") is None:
            continue
        start, end = str(v.get("start") or ""), str(v.get("end") or "")
        if not start or not end:
            continue
        try:
            days = (date.fromisoformat(end) - date.fromisoformat(start)).days
        except ValueError:
            continue
        if not _ANNUAL_MIN_DAYS <= days <= _ANNUAL_MAX_DAYS:
            continue
        prev = by_end.get(end)
        if prev is None or str(v.get("filed") or "") > str(prev.get("filed") or ""):
            by_end[end] = v
    latest = sorted(by_end.values(), key=lambda v: str(v["end"]), reverse=True)[:n]
    return [{"end": str(v["end"]), "val": v["val"], "filed": str(v.get("filed") or "")} for v in latest]


def _financial_profile_from_companyfacts(payload: object) -> dict | None:
    """Factual mini financial profile from an XBRL companyfacts payload — ONLY the
    concepts actually present (annual revenues, annual net income, latest shares
    outstanding), each value carried with its period end + filing date. ``None``
    when nothing usable exists — absent = rien, JAMAIS d'extrapolation."""
    facts = payload.get("facts") if isinstance(payload, dict) else None
    if not isinstance(facts, dict):
        return None
    gaap = facts.get("us-gaap") or {}
    dei = facts.get("dei") or {}
    profile: dict = {}
    revenues: list[dict] = []
    for tag in _REVENUE_TAGS:
        series = _annual_series(gaap.get(tag), "USD")
        if series and (not revenues or series[0]["end"] > revenues[0]["end"]):
            revenues = series  # the tag with the freshest annual value wins
    if revenues:
        profile["revenues"] = revenues
    net_income = _annual_series(gaap.get("NetIncomeLoss"), "USD")
    if net_income:
        profile["netIncome"] = net_income
    shares_tag = dei.get("EntityCommonStockSharesOutstanding")
    shares_entries = shares_tag.get("units", {}).get("shares") if isinstance(shares_tag, dict) else None
    shares = [
        v
        for v in (shares_entries if isinstance(shares_entries, list) else [])
        if isinstance(v, dict) and v.get("val") is not None and v.get("end")
    ]
    if shares:
        latest = max(shares, key=lambda v: (str(v["end"]), str(v.get("filed") or "")))
        profile["sharesOutstanding"] = {
            "end": str(latest["end"]),
            "val": latest["val"],
            "filed": str(latest.get("filed") or ""),
        }
    return profile or None


def _format_musd(val: object) -> str:
    """``4690540000`` → ``"4 691 M$"`` (French-style thousands spacing)."""
    try:
        millions = float(val) / 1e6  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return ""
    return f"{millions:,.0f} M$".replace(",", " ")


def _format_count(val: object) -> str:
    try:
        return f"{int(val):,}".replace(",", " ")  # type: ignore[arg-type]
    except (TypeError, ValueError):
        return ""


def _financial_hit(profile: dict, cik: str, name: str) -> dict:
    """The « données financières SEC (10-K) » web-block hit — every figure is a
    recorded XBRL fact rendered with its fiscal-period end and the 10-K filing
    date; sections simply disappear when their concept is absent."""
    bits: list[str] = []
    revenues = profile.get("revenues") or []
    if revenues:
        seq = " · ".join(f"{_format_musd(r['val'])} (exercice clos {r['end']})" for r in revenues)
        bits.append(f"CA annuel : {seq}")
    net_income = profile.get("netIncome") or []
    if net_income:
        bits.append(f"résultat net : {_format_musd(net_income[0]['val'])} ({net_income[0]['end']})")
    shares = profile.get("sharesOutstanding")
    if shares:
        bits.append(f"actions en circulation : {_format_count(shares['val'])} (au {shares['end']})")
    filed = next((r["filed"] for r in revenues if r.get("filed")), "") or next(
        (r["filed"] for r in net_income if r.get("filed")), ""
    )
    header = "Données financières SEC (XBRL 10-K" + (f", déposé le {filed}" if filed else "") + ")"
    return {
        "title": f"{name} — données financières SEC (10-K)",
        "url": _TENK_LIST_URL.format(cik=cik),
        "description": (header + " — " + " ; ".join(bits))[:500],
        "category": "other",
        "source": "sec_edgar_xbrl",
    }


def _sec_financials_payload(profile: dict | None, fts_hits: list[dict], cik: str) -> dict | None:
    """Structured, persistable SEC/EDGAR financial snapshot — the same recorded
    XBRL 10-K facts rendered in :func:`_financial_hit` (annual revenues + net
    income, each dated by its filing; latest shares outstanding) PLUS the dated
    full-text-search filings, shaped for ``raw_analysis.us_sec_financials`` so the
    account « Financiers SEC (US) » block can show them (they were injected into
    the prompt but never persisted).

    camelCase keys (the API ``toSnakeCaseKeys`` pass snakes them at the persistence
    boundary). Present-only: each section is dropped when its concept is absent.
    ``None`` when neither a financial fact nor a dated filing exists — absent =
    rien, JAMAIS d'extrapolation."""
    prof = profile or {}
    revenues = list(prof.get("revenues") or [])
    net_income = list(prof.get("netIncome") or [])
    shares = prof.get("sharesOutstanding")
    filings = [
        {
            "form": (h.get("type") or "").removeprefix("SEC ").strip(),
            "date": h["date"],
            "title": h.get("title") or "",
            "url": h["url"],
        }
        for h in fts_hits
        if h.get("url") and h.get("date")
    ]
    if not (revenues or net_income or shares or filings):
        return None
    payload: dict = {
        "cik": cik,
        "filingUrl": _TENK_LIST_URL.format(cik=cik),
        "detailUrl": _DETAIL_URL.format(cik=cik),
    }
    if revenues:
        payload["revenues"] = revenues
    if net_income:
        payload["netIncome"] = net_income
    if shares:
        payload["sharesOutstanding"] = shares
    if filings:
        payload["filings"] = filings
    return payload


class UsPack(CountryPack):
    """États-Unis — SEC EDGAR (sociétés cotées) + local ontology. See module docstring."""

    code = "US"
    identifier_label = "CIK"
    country_name = "États-Unis"
    languages = ("en",)
    registry_name = "SEC EDGAR (registre fédéral des sociétés cotées)"
    status = "live"

    def entity_ontology(self) -> dict:
        return {
            "identifier": "CIK (SEC, 10 chiffres — sociétés cotées) ; EIN fiscal NON public",
            "legalForms": {
                "Inc. / Corp. (C-Corp)": "société par actions (l'équivalent SA)",
                "LLC": "limited liability company (fréquente pour filiales/opérations)",
                "LP / LLP": "limited (liability) partnership",
                "Delaware entity": (
                    "état d'immatriculation ≠ siège opérationnel : la majorité des "
                    "groupes s'immatriculent au Delaware, le siège réel est ailleurs"
                ),
            },
            "regionalAxis": "État (state of incorporation vs siège opérationnel)",
            "note": (
                "Pas de registre national des sociétés : le droit des sociétés est "
                "étatique (50 registres de Secretaries of State, fragmentés, sans API "
                "gratuite unifiée). SEC EDGAR ne couvre que les sociétés enregistrées "
                "auprès de la SEC (cotées + émetteurs de dette) : une société privée "
                "n'y apparaît pas. L'EIN (identifiant fiscal IRS) n'est pas public — "
                "ne jamais l'inventer."
            ),
        }

    def local_vocabulary(self) -> dict:
        return {
            "country": "États-Unis",
            "registry": "SEC EDGAR (registre fédéral des dépôts boursiers)",
            "identifier": "CIK (10 chiffres, ex. 0001352010)",
            "languages": ["en"],
            "prompt_fragment": (
                "PAYS CIBLE : États-Unis.\n"
                "- Registre exploitable : SEC EDGAR (dépôts des sociétés cotées et "
                "émetteurs enregistrés). Identifiant : CIK (10 chiffres). ⚠️ EDGAR ne "
                "couvre PAS les sociétés privées ; il n'existe aucun registre national "
                "gratuit (50 registres d'État fragmentés). L'EIN fiscal n'est pas "
                "public — ne jamais inventer d'identifiant.\n"
                "- Formes juridiques : Inc./Corp. (C-Corp), LLC, LP/LLP. État "
                "d'immatriculation (souvent Delaware) ≠ siège opérationnel : cibler le "
                "siège réel (operating HQ), pas l'adresse d'immatriculation.\n"
                "- Signaux datés : dépôts SEC — 8-K (événements matériels : M&A, "
                "dirigeants, restructurations), 10-K/10-Q (rapports annuels/"
                "trimestriels), DEF 14A (assemblée). Citer le formulaire + la date.\n"
                "- Culture d'achat IT : contrats cadres MSA (Master Service Agreement) "
                "+ SOW (Statement of Work) par mission ; RFP/RFI formalisés ; le "
                "procurement/vendor management est un passage obligé aux côtés du "
                "sponsor métier. Staffing : W-2 (salarié), C2C (corp-to-corp) et 1099 "
                "(indépendant) structurent le marché de la prestation IT.\n"
                "- Rédiger les messages en anglais américain (direct, orienté valeur "
                "chiffrée) ; décideurs typiques : CIO/CTO/CISO, VP Engineering, "
                "Head of Procurement."
            ),
        }

    async def registry_lookup(self, query: str, *, client: httpx.AsyncClient | None = None) -> RegistryEntity | None:
        raw = await self._resolve_raw_owned(query, client=client)
        return _entity_from_submissions(raw) if raw else None

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
            raw = await self._resolve_raw(http, cleaned)
            if not raw:
                return out
            entity = _entity_from_submissions(raw)
            if entity is None:
                return out
            out["registry"] = entity
            # Material SEC filings ride on the same submissions payload (single fetch).
            out["legalSignals"] = _signals_from_submissions(raw)
            desc_bits = [
                str(raw.get("sicDescription") or "").strip(),
                entity.get("seat", ""),
                f"inc. {entity['region']}" if entity.get("region") else "",
                " / ".join(str(t) for t in (raw.get("tickers") or [])[:2]),
            ]
            hits: list[dict] = [
                {
                    "title": f"{entity['name']} — CIK {entity['registryId']} (SEC EDGAR)",
                    "url": entity["detailUrl"],
                    "description": " · ".join(b for b in desc_bits if b)[:500],
                    "category": "other",
                    "source": "sec_edgar",
                }
            ]
            # Depth sources, concurrent + individually graceful: XBRL companyfacts
            # (factual financial profile) and full-text search (dated IT/digital
            # mentions sourced by their filing URL). Either failing/empty simply
            # contributes nothing — the identity hit above always survives.
            cik = entity["registryId"]
            profile, fts_hits = await asyncio.gather(
                self._financial_profile(http, cik),
                self._fts_it_signals(http, cik),
            )
            if profile:
                hits.append(_financial_hit(profile, cik, entity["name"]))
            hits.extend(fts_hits)
            out["hits"] = dedup_hits(hits)
            # PERSISTED financial snapshot (constat #540 volet A: injected into the
            # prompt but invisible on the account) — the pipeline lifts it into
            # ``raw_analysis.us_sec_financials``. Absent ⇒ key omitted (nothing added).
            fin = _sec_financials_payload(profile, fts_hits, cik)
            if fin:
                out["secFinancials"] = fin
            # FTS filings double as DATED legal signals, sourced by the filing URL.
            out["legalSignals"].extend(
                {"date": h["date"], "type": h["type"], "message": h["title"], "url": h["url"]} for h in fts_hits
            )
            # jobs: no free per-company US job-postings API — documented absence.
            return out
        finally:
            if owns:
                await http.aclose()

    async def _resolve_raw_owned(self, query: str, *, client: httpx.AsyncClient | None) -> dict | None:
        """Resolve ``query`` (CIK, ticker or company name) to a raw submissions dict,
        owning-or-reusing the ``client``. NO network on an empty query."""
        cleaned = (query or "").strip()
        if not cleaned:
            return None
        owns = client is None
        http = client or httpx.AsyncClient(timeout=_TIMEOUT_S)
        try:
            return await self._resolve_raw(http, cleaned)
        finally:
            if owns:
                await http.aclose()

    async def _resolve_raw(self, http: httpx.AsyncClient, cleaned: str) -> dict | None:
        """CIK / ticker / name → raw submissions dict on a caller-owned client."""
        cik = _normalize_cik(cleaned) or await self._find_cik(http, cleaned)
        if not cik:
            return None
        return await self._get_submissions(http, cik)

    async def _financial_profile(self, http: httpx.AsyncClient, cik: str) -> dict | None:
        """SIG-C (11/10) — le profil financier (petit, déjà extrait) se cache 30 j
        par CIK ; jamais le ``companyfacts`` brut (plusieurs Mo). ``None`` jamais caché."""
        return await provider_cache.cached_json(
            "registry:us_sec_financials",
            cik.strip(),
            lambda: self._fetch_financial_profile(http, cik),
            ttl=provider_cache.TTL_FIRMO,
        )

    async def _fetch_financial_profile(self, http: httpx.AsyncClient, cik: str) -> dict | None:
        """XBRL companyfacts → factual financial profile. ``None`` on ANY miss —
        404 (no XBRL facts for this filer), HTTP/parse error, or no usable tag."""
        try:
            async with throttle("sec_edgar"):
                resp = await http.get(_COMPANYFACTS_URL.format(cik=cik), headers=_headers(), timeout=_FACTS_TIMEOUT_S)
            if not resp.is_success:
                # 404 = ce déposant n'a pas de faits XBRL. C'est une ABSENCE
                # documentée, pas un incident : la signaler serait le bug
                # symétrique (excuser un vrai vide par une panne imaginaire).
                if resp.status_code != 404:
                    note_registry_failure("sec_edgar", f"companyfacts CIK {cik}", status=resp.status_code)
                return None
            payload = resp.json()
        except Exception as exc:  # noqa: BLE001 — a source must never break research
            note_registry_failure("sec_edgar", f"companyfacts CIK {cik}", exc=exc)
            return None
        return _financial_profile_from_companyfacts(payload)

    async def _fts_it_signals(self, http: httpx.AsyncClient, cik: str) -> list[dict]:
        """EDGAR full-text search of the registrant's recent filings for the
        IT/digital/cyber phrases — one throttled request per phrase, each failure
        degrading to ``[]``. Queries run SEQUENTIALLY on purpose: efts.sec.gov
        500s intermittently under concurrent bursts (observed live 2026-07-16),
        and one lost query silently costs real signals. Merged hits are
        URL-deduped, date-sorted, capped."""
        window_end = date.today()
        window_start = window_end - timedelta(days=_FTS_LOOKBACK_DAYS)
        merged_input: list[dict] = []
        for phrase in _FTS_IT_QUERIES:
            params = {
                "q": phrase,
                "ciks": cik,
                "forms": _FTS_FORMS,
                "dateRange": "custom",
                "startdt": window_start.isoformat(),
                "enddt": window_end.isoformat(),
            }
            try:
                async with throttle("sec_edgar"):
                    resp = await http.get(_FTS_URL, params=params, headers=_headers())
                if not resp.is_success:
                    note_registry_failure(
                        "sec_edgar", f"recherche plein-texte {phrase!r} (CIK {cik})", status=resp.status_code
                    )
                    continue
                payload = resp.json()
            except Exception as exc:  # noqa: BLE001 — a source must never break research
                note_registry_failure(
                    "sec_edgar", f"recherche plein-texte {phrase!r} (CIK {cik})", exc=exc
                )
                continue
            merged_input.extend(_fts_hits_from_payload(payload, phrase.strip('"'))[:_FTS_HITS_PER_QUERY])
        merged = dedup_hits(merged_input)
        merged.sort(key=lambda h: str(h.get("date") or ""), reverse=True)
        return merged[:_FTS_MAX_HITS]

    async def _find_cik(self, http: httpx.AsyncClient, query: str) -> str:
        """Ticker/name → CIK via the official ``company_tickers.json`` mapping.
        ``""`` on miss/error — a non-SEC-registrant resolves to nothing (documented
        EDGAR limitation), never to a fabricated identifier."""
        try:
            async with throttle("sec_edgar"):
                resp = await http.get(_TICKERS_URL, headers=_headers())
            if not resp.is_success:
                # La SEC répond 403 sur User-Agent absent ou débit excessif. Ce
                # 403 devenait « cette société n'a pas de dépôt SEC » — une
                # affirmation forte, et fausse, sur une société cotée.
                note_registry_failure("sec_edgar", "table company_tickers", status=resp.status_code)
                return ""
            payload = resp.json()
        except Exception as exc:  # noqa: BLE001 — a source must never break research
            note_registry_failure("sec_edgar", "table company_tickers", exc=exc)
            return ""
        rows = list(payload.values()) if isinstance(payload, dict) else []
        row = _match_ticker_row([r for r in rows if isinstance(r, dict)], query)
        return str(row["cik_str"]).zfill(10) if row and row.get("cik_str") is not None else ""

    async def _get_submissions(self, http: httpx.AsyncClient, cik: str) -> dict | None:
        # SIG-C (11/10) — par CIK, mais au tier des SIGNAUX (7 j), pas 30 j : ce flux
        # porte aussi les dépôts datés que le pack lit comme signaux légaux.
        return await provider_cache.cached_json(
            "registry:us_sec_submissions",
            cik.strip(),
            lambda: self._fetch_submissions(http, cik),
            ttl=provider_cache.TTL_SIGNALS,
        )

    async def _fetch_submissions(self, http: httpx.AsyncClient, cik: str) -> dict | None:
        try:
            async with throttle("sec_edgar"):
                resp = await http.get(_SUBMISSIONS_URL.format(cik=cik), headers=_headers())
            if not resp.is_success:
                note_registry_failure("sec_edgar", f"submissions CIK {cik}", status=resp.status_code)
                return None
            payload = resp.json()
        except Exception as exc:  # noqa: BLE001
            note_registry_failure("sec_edgar", f"submissions CIK {cik}", exc=exc)
            return None
        return payload if isinstance(payload, dict) and payload.get("cik") is not None else None
