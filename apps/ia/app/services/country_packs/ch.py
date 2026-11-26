"""Country pack **Suisse (CH)** — Zefix, the federal central business-name index.

Registry source (VERIFIED, official OpenAPI 3.1 spec of the Federal Registry of
Commerce, fetched 2026-07-16 from
``https://www.zefix.admin.ch/ZefixPublicREST/v3/api-docs``):

* Base URL : ``https://www.zefix.admin.ch/ZefixPublicREST``
* Search   : ``POST /api/v1/company/search`` — body ``CompanySearchQuery``
             ``{name (required), canton, legalFormId, activeOnly, …}`` →
             array of ``CompanyShort`` ``{name, uid, chid, ehraid, legalSeat,
             legalForm{name:{de,fr,it,en}}, status(ACTIVE|CANCELLED|
             BEING_CANCELLED), sogcDate, deletionDate}``.
* Detail   : ``GET /api/v1/company/uid/{id}`` (also ``/chid/{id}``, ``/ehraid/{id}``)
             → ``CompanyFull`` (adds ``canton``, ``purpose``, ``address``,
             ``sogcPub`` [SHAB/FOSC gazette publications], ``zefixDetailWeb``,
             ``cantonalExcerptWeb``).
* Auth     : HTTP **Basic** (security scheme ``Zefix-Credentials``). The live API
             returns **401** without it. Registration is **free** at zefix.ch.

Identifier pivot: the **UID** ``CHE-XXX.XXX.XXX`` — the single Swiss identifier
linking the commercial register, VAT, social insurance, customs and statistics
(more integrated than the French SIREN). ``legalSeat`` is the commune; the canton
(only on ``CompanyFull``) is the FR/DE/IT linguistic-region axis.

Employment signals: the dominant Swiss job boards (jobs.ch, jobup.ch) expose **no
free public API** — documented ABSENCE, not invented. ``jobs`` stays ``[]`` until a
free source exists. Annual accounts are **not** publicly filed for most Swiss SMEs
(structural gap vs FR/BE) — the financial dossier is lighter by design.

No-op / graceful: without ``ZEFIX_API_USER`` **and** ``ZEFIX_API_PASSWORD`` the
client makes **no network call** and returns nothing (``None`` / empty) — never a
fabricated company. Any HTTP error degrades to the same empty value.

RGPD: Switzerland benefits from the EU **adequacy decision of 15 Jan 2024** and the
nFADP/revDSG (in force 1 Sept 2023); EU↔CH transfers are covered. Only public
commercial-register identity data is read (data minimisation).
"""

from __future__ import annotations

import logging
import os
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

_BASE = "https://www.zefix.admin.ch/ZefixPublicREST/api/v1"
_TIMEOUT_S = 10.0

# CHE-105.944.452 / CHE105944452 / CHE-105944452 — the Swiss UID in any spacing.
_UID_RE = re.compile(r"CHE[-\s]?\d{3}[.\s]?\d{3}[.\s]?\d{3}", re.IGNORECASE)


def _creds() -> tuple[str, str]:
    return (
        os.environ.get("ZEFIX_API_USER", "").strip(),
        os.environ.get("ZEFIX_API_PASSWORD", "").strip(),
    )


def _normalize_uid(raw: str) -> str:
    """``CHE-105.944.452`` → ``CHE105944452`` (the form the detail endpoint wants)."""
    return re.sub(r"[^0-9A-Za-z]", "", raw or "").upper()


def _format_uid(raw: str) -> str:
    """Canonical display UID ``CHE-XXX.XXX.XXX`` from any spacing (best-effort)."""
    digits = re.sub(r"\D", "", raw or "")
    if len(digits) == 9:
        return f"CHE-{digits[0:3]}.{digits[3:6]}.{digits[6:9]}"
    return (raw or "").strip().upper()


def _dfie_fr(value: object) -> str:
    """Pick the French label from a Zefix ``DFIEString`` ``{de,fr,it,en}`` (fallback en/de/it)."""
    if isinstance(value, dict):
        for lang in ("fr", "en", "de", "it"):
            v = value.get(lang)
            if isinstance(v, str) and v.strip():
                return v.strip()
    if isinstance(value, str):
        return value.strip()
    return ""


def _sogc_from_payload(company: dict) -> list[dict]:
    """SHAB/FOSC gazette publications from a ``CompanyFull.sogcPub`` array (dated
    legal signals). Empty when absent — never fabricated."""
    out: list[dict] = []
    for p in (company.get("sogcPub") or []):
        if not isinstance(p, dict):
            continue
        out.append(
            {
                "date": str(p.get("sogcDate") or "").strip(),
                "type": "SHAB/FOSC",
                "message": str(p.get("message") or "").strip()[:500],
            }
        )
    return out[:20]


def _entity_from_payload(company: dict) -> RegistryEntity:
    """Map a Zefix ``CompanyShort`` / ``CompanyFull`` JSON object → RegistryEntity."""
    uid_raw = str(company.get("uid") or "")
    legal_form = _dfie_fr((company.get("legalForm") or {}).get("name")) if isinstance(company.get("legalForm"), dict) else ""
    entity: RegistryEntity = {
        "source": "zefix",
        "country": "CH",
        "name": str(company.get("name") or "").strip(),
        "registryId": _format_uid(uid_raw),
        "registryIdLabel": "UID",
        "status": str(company.get("status") or "").strip(),
    }
    if legal_form:
        entity["legalForm"] = legal_form
    seat = str(company.get("legalSeat") or "").strip()
    if seat:
        entity["seat"] = seat
    canton = str(company.get("canton") or "").strip()
    if canton:
        entity["region"] = canton
    detail = str(company.get("zefixDetailWeb") or company.get("cantonalExcerptWeb") or "").strip()
    if detail:
        entity["detailUrl"] = detail
    return entity


class SwissPack(CountryPack):
    """Suisse — Zefix registry + local ontology. See module docstring."""

    code = "CH"
    identifier_label = "UID"
    country_name = "Suisse"
    languages = ("fr", "de", "it")
    registry_name = "Zefix (registre du commerce fédéral)"
    status = "live"

    def entity_ontology(self) -> dict:
        return {
            "identifier": "UID (CHE-XXX.XXX.XXX)",
            "legalForms": {
                "SA / AG": "société anonyme",
                "Sàrl / GmbH": "société à responsabilité limitée",
                "Zweigniederlassung / succursale": "établissement secondaire d'une entité",
                "Holding": "société de participation (à distinguer de l'opérationnelle)",
            },
            "regionalAxis": "canton",
            "note": (
                "Fragmentation cantonale : un même groupe peut avoir des entités "
                "dans plusieurs cantons, reliées par l'UID. La succursale "
                "(Zweigniederlassung) n'est pas une société distincte."
            ),
        }

    def local_vocabulary(self) -> dict:
        return {
            "country": "Suisse",
            "registry": "Zefix (registre du commerce fédéral)",
            "identifier": "UID (CHE-XXX.XXX.XXX)",
            "languages": ["fr", "de", "it"],
            "prompt_fragment": (
                "PAYS CIBLE : Suisse.\n"
                "- Registre officiel : Zefix (registre du commerce fédéral). "
                "Identifiant entreprise : UID (format CHE-XXX.XXX.XXX), qui relie "
                "registre du commerce, TVA et assurances sociales.\n"
                "- Formes juridiques : SA/AG, Sàrl/GmbH, succursale "
                "(Zweigniederlassung), holding (société de participation).\n"
                "- Organisation cantonale (26 cantons) : un même groupe peut avoir "
                "des entités dans plusieurs cantons, reliées par l'UID. Le canton du "
                "siège fixe la région linguistique.\n"
                "- Langues officielles FR/DE/IT : adapte les messages à la région "
                "linguistique du siège (ex. Genève/Vaud = FR, Zurich = DE, Tessin = IT).\n"
                "- Pas de dépôt public généralisé des comptes annuels : le volet "
                "financier est plus léger qu'en France (ne pas inventer de chiffres)."
            ),
        }

    async def registry_lookup(self, query: str, *, client: httpx.AsyncClient | None = None) -> RegistryEntity | None:
        raw = await self._resolve_raw_owned(query, client=client)
        return _entity_from_payload(raw) if raw else None

    async def collect_signals(
        self, company: str, *, ident: str | None = None, client: httpx.AsyncClient | None = None
    ) -> CountrySignals:
        out = empty_signals(self.code)
        raw = await self._resolve_raw_owned(ident or company, client=client)
        if not raw:
            return out
        entity = _entity_from_payload(raw)
        out["registry"] = entity
        # SHAB/FOSC gazette publications ride on the same CompanyFull payload (single
        # fetch — no second round-trip). Graceful: empty when absent.
        out["legalSignals"] = _sogc_from_payload(raw)
        detail_url = entity.get("detailUrl")
        if detail_url:
            desc_bits = [b for b in (entity.get("legalForm"), entity.get("seat"), entity.get("region"), entity.get("status")) if b]
            out["hits"] = [
                {
                    "title": f"{entity['name']} — {entity.get('registryId', '')} (Zefix)".strip(),
                    "url": detail_url,
                    "description": " · ".join(desc_bits)[:500],
                    "category": "other",
                    "source": "zefix",
                }
            ]
        # jobs: no free Swiss job-board API (jobs.ch/jobup.ch) — documented absence.
        return out

    async def _resolve_raw_owned(self, query: str, *, client: httpx.AsyncClient | None) -> dict | None:
        """Resolve ``query`` (UID or name) to a raw Zefix ``CompanyFull``/``CompanyShort``
        dict, owning-or-reusing the ``client``. NO network without creds/query."""
        user, password = _creds()
        cleaned = (query or "").strip()
        if not user or not password or not cleaned:
            return None  # no creds / empty ⇒ NO network, NO fabricated data
        owns = client is None
        http = client or httpx.AsyncClient(timeout=_TIMEOUT_S)
        try:
            return await self._resolve_raw(http, cleaned, (user, password))
        finally:
            if owns:
                await http.aclose()

    async def _resolve_raw(self, http: httpx.AsyncClient, query: str, auth: tuple[str, str]) -> dict | None:
        uid_match = _UID_RE.search(query)
        if uid_match:
            return await self._get_by_uid(http, _normalize_uid(uid_match.group(0)), auth)
        results = await self._search(http, query, auth)
        if not results:
            return None
        top = results[0]
        # Enrich the top CompanyShort with the CompanyFull detail (canton, purpose,
        # sogcPub, detail URL). A detail miss degrades to the short entity.
        uid = _normalize_uid(str(top.get("uid") or ""))
        if uid:
            full = await self._get_by_uid(http, uid, auth)
            if full is not None:
                return full
        return top

    async def _get_by_uid(self, http: httpx.AsyncClient, uid: str, auth: tuple[str, str]) -> dict | None:
        # SIG-C (11/10) — 30 j par UID (identifiant légal) ; une erreur rend None, jamais cachée.
        return await provider_cache.cached_json(
            "registry:ch_zefix", uid.strip(), lambda: self._fetch_by_uid(http, uid, auth), ttl=provider_cache.TTL_FIRMO
        )

    async def _fetch_by_uid(self, http: httpx.AsyncClient, uid: str, auth: tuple[str, str]) -> dict | None:
        try:
            async with throttle("zefix"):
                resp = await http.get(
                    f"{_BASE}/company/uid/{uid}", headers={"Accept": "application/json"}, auth=auth
                )
            if not resp.is_success:
                note_registry_failure("zefix", f"détail UID {uid}", status=resp.status_code)
                return None
            payload = resp.json()
        except Exception as exc:  # noqa: BLE001 — a source must never break research
            note_registry_failure("zefix", f"détail UID {uid}", exc=exc)
            return None
        # /company/uid returns a list (entities can share a UID historically).
        first = payload[0] if isinstance(payload, list) and payload else payload
        return first if isinstance(first, dict) and first.get("uid") else None

    async def _search(self, http: httpx.AsyncClient, name: str, auth: tuple[str, str]) -> list[dict]:
        try:
            async with throttle("zefix"):
                resp = await http.post(
                    f"{_BASE}/company/search",
                    json={"name": name, "activeOnly": True},
                    headers={"Accept": "application/json", "Content-Type": "application/json"},
                    auth=auth,
                )
            if not resp.is_success:
                # Zefix s'authentifie en HTTP Basic : un 401 ici parle de NOS
                # identifiants, pas du tissu économique suisse. Sans cette
                # ligne, les deux rendaient le même ``[]`` (cas nommé par #628).
                note_registry_failure("zefix", f"recherche {name!r}", status=resp.status_code)
                return []
            results = resp.json()
        except Exception as exc:  # noqa: BLE001
            note_registry_failure("zefix", f"recherche {name!r}", exc=exc)
            return []
        return [r for r in results if isinstance(r, dict)] if isinstance(results, list) else []
