"""Apollo.io client — People Search (free) + People Match (paid).

All public functions return typed Pydantic models (``ApolloSearchHit`` /
``ApolloEnrichmentResult``); no `dict` leaks across the module boundary.

Raw Apollo JSON shapes are described as ``TypedDict`` for static checking
only — they exist to document what we read from the API and to give type
checkers something to bite on without paying for runtime validation we
don't need on every field.
"""

from __future__ import annotations

import hashlib
import json
import logging
import os
import re
import time
from enum import Enum
from typing import Any, NotRequired, TypedDict, cast, get_args

import httpx

from app.models.contacts import (
    ApolloEducationEntry,
    ApolloEmailStatus,
    ApolloEmploymentEntry,
    ApolloEnrichmentResult,
    ApolloPhoneNumber,
    ApolloSearchHit,
    RevealPhoneResponse,
)
from app.services import cost_ledger, provider_cache
from app.services.current_position import pick_current_position
from app.services.company_filters import DegradeReason, reason_for_status
from app.services.data_sources._http_pool import get_shared_client
from app.services.distributed_rate_limiter import get_client, redis_url
from app.services.rate_limiter import back_off_provider, retry_after_header, throttle
from app.services.salesql import enrich_person as salesql_enrich_person
from app.services.salesql import is_enabled as salesql_is_enabled

logger = logging.getLogger(__name__)

# People Search: requires a Apollo "master" API key (paid plan). Free plans
# get a 403 with code API_INACCESSIBLE — the contacts pipeline falls back to
# Brave+Claude when this happens.
# Doc: https://docs.apollo.io/reference/people-api-search
APOLLO_SEARCH_URL = "https://api.apollo.io/api/v1/mixed_people/api_search"

# People Match: 1 credit / revealed email. Works on standard API keys.
# Doc: https://docs.apollo.io/reference/people-enrichment
APOLLO_ENRICH_URL = "https://api.apollo.io/api/v1/people/match"
# LOT (15/10) DATA-A point 8 — jusqu'à 10 personnes par appel (même crédit par personne, 10× moins d'appels).
APOLLO_BULK_MATCH_URL = "https://api.apollo.io/api/v1/people/bulk_match"
BULK_MATCH_BATCH = 10

_VALID_EMAIL_STATUSES: frozenset[str] = frozenset(get_args(ApolloEmailStatus))

# Per-request read/connect budget of one Apollo call. Unchanged (30 s) — it is the
# CASCADE that needed a ceiling, not the individual call.
HTTP_TIMEOUT_S = 30.0

# ── Budget de temps de la cascade d'enrichissement ───────────────────────────
# ``enrich_person_with_fallback`` est entièrement séquentielle : People-Match →
# People-Search → élargissement d'org → SalesQL, soit jusqu'à ~10 appels dont
# chacun peut d'abord faire la queue derrière le throttle Apollo partagé par tout
# le cluster (``APOLLO_MAX_WAIT`` = 30 s par appel). Non bornée, elle atteignait
# le plafond de 60 s du client API — et le bouton « Enrichir » restait filé sans
# rien dire. Le budget arrête les legs OPTIONNELS (jamais le premier) et le
# résultat le signale (``truncated``) : une recherche interrompue n'est PAS une
# absence de données, et l'API ne doit pas l'écrire comme telle.
DEFAULT_ENRICH_BUDGET_S = 25.0

# Variantes d'org tentées au plus par l'élargissement (Path 2b). Chacune coûte 1
# recherche + 1 reveal ; au-delà de 2, on s'éloigne de la marque d'origine et le
# taux de match s'écroule — on payait 4 appels pour presque jamais un contact.
_BROADEN_MAX = 2


def _monotonic() -> float:
    """Horloge de la cascade — indirection volontaire : les tests injectent une
    horloge déterministe plutôt que de dormir."""
    return time.monotonic()


def _enrich_budget_s() -> float:
    """Budget de la cascade, en secondes. ``ENRICH_CASCADE_BUDGET_S`` pour tuner
    sans redéploiement ; une valeur non numérique, nulle ou négative retombe sur
    le défaut (avec un warning) — un réglage cassé ne doit pas mutiler
    l'enrichissement en silence, même mode de sûreté que le rate limiter."""
    raw = os.environ.get("ENRICH_CASCADE_BUDGET_S")
    if raw is None or raw == "":
        return DEFAULT_ENRICH_BUDGET_S
    try:
        value = float(raw)
    except ValueError:
        logger.warning(
            "invalid ENRICH_CASCADE_BUDGET_S=%r, using default %.0fs", raw, DEFAULT_ENRICH_BUDGET_S
        )
        return DEFAULT_ENRICH_BUDGET_S
    if value <= 0:
        logger.warning(
            "ENRICH_CASCADE_BUDGET_S=%r would disable the enrich cascade, using default %.0fs",
            raw,
            DEFAULT_ENRICH_BUDGET_S,
        )
        return DEFAULT_ENRICH_BUDGET_S
    return value


DEFAULT_TITLES: list[str] = [
    "DSI",
    "CTO",
    "Directeur Informatique",
    "Directeur des Systèmes d'Information",
    "Head of Data",
    "Directeur Digital",
    "Directeur IT",
    "Chief Data Officer",
    "VP Engineering",
    "Directeur Technique",
    "Responsable Infrastructure",
    "Directeur Achats IT",
    "Head of Engineering",
    "RSSI",
    "Chief Information Officer",
]


# ─── Apollo wire shapes (TypedDicts — static doc, no runtime validation) ────


class ApolloOrgRaw(TypedDict, total=False):
    name: str


class ApolloPhoneNumberRaw(TypedDict, total=False):
    type: str
    sanitized_number: str
    raw_number: str
    status: str


class ApolloPersonRaw(TypedDict, total=False):
    """Subset of Apollo's `person` shape we actually read. ``total=False`` —
    Apollo omits keys it has no value for."""

    first_name: str
    last_name: str
    # Search tier only: the surname masked as "Mo***y" (and `last_name` absent).
    last_name_obfuscated: str
    title: str
    organization: ApolloOrgRaw
    organization_name: str
    linkedin_url: str
    twitter_url: str
    github_url: str
    facebook_url: str
    photo_url: str
    city: str
    state: str
    country: str
    email: str
    email_status: str
    personal_emails: list[str]
    phone_numbers: list[ApolloPhoneNumberRaw]
    sanitized_phone: str
    seniority: str
    headline: str
    departments: list[str]
    subdepartments: list[str]
    functions: list[str]
    employment_history: list[dict[str, Any]]
    education: list[dict[str, Any]]
    # Free-tier availability flags (booleans): an email/phone exists to reveal.
    has_email: bool
    # Not a boolean on the wire: "Yes" or "Maybe: please request direct dial via
    # people/bulk_match". See ``_has_direct_phone``.
    has_direct_phone: str


class ApolloPaginationRaw(TypedDict, total=False):
    total_entries: int
    total_pages: int
    page: int


class ApolloSearchResponseRaw(TypedDict, total=False):
    people: list[ApolloPersonRaw]
    pagination: ApolloPaginationRaw
    # `mixed_people/api_search` returns the total at the top level, not nested
    # under `pagination` (which that endpoint omits entirely).
    total_entries: int


class ApolloEnrichResponseRaw(TypedDict, total=False):
    person: ApolloPersonRaw | None


class ApolloSearchPayload(TypedDict):
    page: int
    per_page: int
    # Optional: a seniority-band search (whole management layer) sends
    # ``person_seniorities`` and NO ``person_titles`` — a title list would AND with
    # the bands and re-narrow a deliberately wide search back to a handful.
    person_titles: NotRequired[list[str]]
    # Org scope, strongest first. ``organization_ids`` is Apollo's own org id — an
    # exact filter (no fuzzy matching). ``q_organization_domains_list`` scopes by
    # the employer's registrable domain. ``q_organization_name`` is the legacy
    # fuzzy name match — kept last, and NEVER a messy entity label (retour Théo
    # P0: « TF1 PUB » / « TF1+ (plateforme streaming) » scoped nothing → 0 hits).
    # At least one must be present; each is opt-in so callers send only what they
    # hold. Doc: https://docs.apollo.io/reference/people-api-search
    organization_ids: NotRequired[list[str]]
    q_organization_domains_list: NotRequired[list[str]]
    q_organization_name: NotRequired[str]
    # #2727 — recherche libre par NOM (« Marion Sagnard »), pas par organisation :
    # seul champ de ce contrat qui ne scope pas sur une entreprise. Utilisé par
    # `search_people_by_name` UNIQUEMENT — jamais combiné à `person_titles`, une
    # recherche de PERSONNE cible un nom, pas un rôle.
    q_keywords: NotRequired[str]
    # S6 re-run scope — opt-in. person_locations narrows by geography (écarte
    # l'offshore), person_seniorities by seniority band. Absent = wide search.
    person_locations: NotRequired[list[str]]
    person_seniorities: NotRequired[list[str]]
    # LOT (15/10) DATA-A point 5 — exclusions de titres (stage, alternance, assistant) et statut
    # d'e-mail voulu : l'un et l'autre réduisent le bruit payé, jamais le périmètre d'organisation.
    person_not_titles: NotRequired[list[str]]
    contact_email_status: NotRequired[list[str]]


class ApolloEnrichByIdPayload(TypedDict):
    id: str
    reveal_personal_emails: bool


class ApolloEnrichByLinkedInPayload(TypedDict):
    linkedin_url: str
    reveal_personal_emails: bool


class ApolloEnrichByNamePayload(TypedDict):
    first_name: str
    last_name: NotRequired[str]
    organization_name: str
    reveal_personal_emails: bool


ApolloEnrichPayload = (
    ApolloEnrichByIdPayload | ApolloEnrichByLinkedInPayload | ApolloEnrichByNamePayload
)


# ─── Errors ──────────────────────────────────────────────────────────────────


class ApolloError(Exception):
    """Base class for Apollo-side failures we want callers to distinguish."""


class ApolloPlanError(ApolloError):
    """The Apollo plan / API key cannot reach the requested endpoint.

    Triggered by Apollo's HTTP 403 + ``error_code: "API_INACCESSIBLE"``. The
    caller should surface a "upgrade Apollo plan or use a master API key"
    message rather than treating it as a transient backend error.

    Carries ``reason = unauthorized``: our credential is not ENTITLED to reach
    the endpoint (the Basic plan has no REST People-Match access — the observed
    production cause, distinct from an exhausted quota: the account had 214/2500
    credits left). « quota_exceeded » would tell the seller to wait for a refill
    that will never come; « unauthorized » points at the fix — the plan/key —
    which is server-side, so no credit is ever charged.
    """

    reason = DegradeReason.UNAUTHORIZED


class ApolloUnavailableError(ApolloError, ValueError):
    """Apollo could not answer — missing key, rejected token, throttle, 5xx, transport.

    Mirrors :class:`~app.services.pappers.models.PappersUnavailableError` (#628):
    carries the HTTP ``status``, a machine-readable ``reason`` from the shared
    :class:`DegradeReason` vocabulary, and a ``body`` excerpt. The reason is what
    lets the product say « la clé est refusée » rather than « personne trouvée » —
    two facts with opposite repairs that used to render identically.

    Subclasses ``ValueError`` deliberately. Every pre-existing ``except ValueError``
    around an Apollo call keeps catching it unchanged, so the typed reason is a
    pure addition: no call site changes behaviour, only the ones that opt in by
    catching the narrower type gain the cause.
    """

    def __init__(self, status: int, reason: str, body: str = "", context: str = "") -> None:
        where = f" ({context})" if context else ""
        detail = f" — {body.strip()[:160]}" if body.strip() else ""
        # status 0 = we never reached Apollo (no key, transport failure).
        at = f" [HTTP {status}]" if status else ""
        super().__init__(f"Apollo {reason}{at}{where}{detail}")
        self.status = status
        self.reason = reason
        self.body = body


class ApolloSearchStatus(str, Enum):
    """Typed outcome of :func:`search_people_with_status`.

    The naked ``search_people`` returns just the contacts list and swallows
    every failure mode as "empty" — which makes the ``ContactHunterAgent``
    unable to tell ``0 contacts found`` from ``Apollo is down``. This enum
    surfaces the distinction so the agent can emit the right
    :class:`AgentEnvelope` status.
    """

    OK = "ok"  # ≥ 1 contact returned
    EMPTY = "empty"  # API succeeded but returned 0 contacts
    UNCONFIGURED = "unconfigured"  # APOLLO_API_KEY missing
    AUTH_FAILED = "auth_failed"  # 401/403 (non-plan) → terminal
    PLAN_BLOCKED = "plan_blocked"  # 403 + API_INACCESSIBLE → terminal
    RATE_LIMITED = "rate_limited"  # 429 → recoverable
    DOWN = "down"  # 5xx, network errors → recoverable


def _is_plan_inaccessible(body_text: str) -> bool:
    """Heuristic match on Apollo's plan-gating error body — cheap string check
    rather than parsing JSON for a single literal."""
    return "API_INACCESSIBLE" in body_text


def _categorize_http_failure(status_code: int, body: str) -> ApolloSearchStatus:
    """Map a non-2xx Apollo response to a typed status."""
    if status_code == 403 and _is_plan_inaccessible(body):
        return ApolloSearchStatus.PLAN_BLOCKED
    if status_code in (401, 403):
        return ApolloSearchStatus.AUTH_FAILED
    if status_code == 429:
        return ApolloSearchStatus.RATE_LIMITED
    if 500 <= status_code < 600:
        return ApolloSearchStatus.DOWN
    # Other 4xx (400 / 404 / 422 …) — treat as DOWN so the agent decides:
    # for now we map to DOWN (recoverable) since malformed requests are
    # rare in prod and a retry surfaces them faster than a hard fail.
    return ApolloSearchStatus.DOWN


# ─── Headers / auth ──────────────────────────────────────────────────────────


def _get_api_key() -> str:
    api_key = os.environ.get("APOLLO_API_KEY", "")
    if not api_key:
        # Verbose, structured: easy to grep + Sentry-friendly via the logger transport.
        logger.error(
            "Apollo configuration error: APOLLO_API_KEY missing",
            extra={"provider": "apollo", "stage": "config"},
        )
        raise ApolloUnavailableError(
            0, DegradeReason.MISSING_API_KEY, "APOLLO_API_KEY environment variable is not set"
        )
    logger.debug(
        "Apollo API key loaded (len=%d, prefix=%s***)",
        len(api_key),
        api_key[:4],
    )
    return api_key


def _make_headers(api_key: str) -> httpx.Headers:
    """Apollo accepts ``x-api-key`` auth — no Bearer, no OAuth."""
    return httpx.Headers({
        "x-api-key": api_key,
        "Content-Type": "application/json",
    })


# ─── Extraction helpers (raw Apollo person → typed pieces) ───────────────────


def _extract_org_name(person: ApolloPersonRaw) -> str:
    org = person.get("organization")
    if isinstance(org, dict):
        return org.get("name", "") or ""
    return person.get("organization_name", "") or ""


def _extract_org_field(person: ApolloPersonRaw, key: str) -> str:
    """#4928.1 — ``organization.id`` / ``organization.primary_domain`` quand Apollo les publie, sinon vide (inconnu)."""
    org = person.get("organization")
    value = org.get(key) if isinstance(org, dict) else None
    if key == "id" and not value:
        value = person.get("organization_id")
    return str(value or "").strip()


def _extract_phone(person: ApolloPersonRaw) -> str:
    """Direct phone first, then any sanitized number on the record."""
    phones = person.get("phone_numbers") or []
    if isinstance(phones, list) and phones:
        direct = [p for p in phones if isinstance(p, dict) and p.get("type") == "direct"]
        if direct:
            return direct[0].get("sanitized_number", "") or ""
        first = phones[0]
        if isinstance(first, dict):
            return first.get("sanitized_number", "") or ""
    return person.get("sanitized_phone", "") or ""


def _is_locked_email(email: str) -> bool:
    """Apollo's placeholder for « matched, but your plan can't reveal this ».

    On a plan without email reveal (Apollo Basic), People-Match still returns the
    person — with ``email = "email_not_unlocked@domain.com"``. It is NOT an
    address: surfacing it would persist a garbage email AND bill a credit for a
    reveal that never happened (the production debit on a plan that can't reveal).
    Treated as no-email so the match honestly reports « no reachable channel ».
    """
    return email.lower().startswith("email_not_unlocked@")


def _extract_email(person: ApolloPersonRaw) -> str:
    """Primary email first, then fall back to the revealed ``personal_emails[]``.

    With ``reveal_personal_emails=true``, Apollo sometimes leaves ``email``
    blank and surfaces the revealed address only in ``personal_emails``.

    Apollo's locked-email placeholder is filtered on both paths — it is a plan
    limitation dressed as an address, never a real one.
    """
    email = (person.get("email") or "").strip()
    if email and not _is_locked_email(email):
        return email
    personal = person.get("personal_emails")
    if isinstance(personal, list):
        for candidate in personal:
            if isinstance(candidate, str) and candidate.strip() and not _is_locked_email(candidate.strip()):
                return candidate.strip()
    return ""


def _coerce_email_status(raw: Any) -> ApolloEmailStatus | None:
    """Apollo occasionally emits values outside our enum (e.g. ``"likely"``);
    fall to ``None`` instead of leaking an unknown literal."""
    if isinstance(raw, str) and raw in _VALID_EMAIL_STATUSES:
        return cast(ApolloEmailStatus, raw)
    return None


def _str_list(raw: Any) -> list[str]:
    """Apollo emits ``departments`` / ``functions`` as string arrays; keep the
    non-empty ones, bounded so a pathological payload can't bloat raw_data."""
    if not isinstance(raw, list):
        return []
    return [s for s in (str(x).strip() for x in raw if x) if s][:8]


def _employment_history(raw: Any) -> list[dict[str, Any]]:
    """Trim Apollo's ``employment_history`` to the career path that matters for
    a sales dossier: role title, organisation, whether it's current.

    Kept as the light ``{title, organization, current}`` shape carried on the
    People-Search seed (``apolloDetails``). The richer People-Match career path
    (with dates) is built by :func:`_employment_entries`."""
    if not isinstance(raw, list):
        return []
    out: list[dict[str, Any]] = []
    for item in raw[:6]:
        if not isinstance(item, dict):
            continue
        title = (item.get("title") or "").strip()
        org = (item.get("organization_name") or "").strip()
        if not title and not org:
            continue
        entry: dict[str, Any] = {"title": title or None, "organization": org or None, "current": bool(item.get("current"))}
        # #4928.1 — l'id de l'organisation de l'expérience (règle (d) du garde d'employeur), présent seulement.
        if _str(item.get("organization_id")):
            entry["organization_id"] = _str(item.get("organization_id"))
        # #4465 — les dates (présentes seulement) : sans elles on ne peut dire quelle expérience est la plus récente.
        for key in ("start_date", "end_date"):
            value = _str(item.get(key))
            if value:
                entry[key] = value
        out.append(entry)
    return out


def _str(raw: Any) -> str | None:
    """Trim a raw scalar to a non-empty string, else ``None`` (present-only)."""
    if raw is None:
        return None
    s = str(raw).strip()
    return s or None


def _employment_entries(raw: Any) -> list[ApolloEmploymentEntry]:
    """Full career path from Apollo's ``employment_history`` — organisation,
    title, dates, current flag. Sorted recent-first (current roles, then latest
    ``start_date``). Present-only + bounded so a pathological payload can't bloat
    the persisted JSONB."""
    if not isinstance(raw, list):
        return []
    entries: list[ApolloEmploymentEntry] = []
    for item in raw:
        if not isinstance(item, dict):
            continue
        org = _str(item.get("organization_name"))
        title = _str(item.get("title"))
        if not org and not title:
            continue
        entries.append(
            ApolloEmploymentEntry(
                organization_name=org,
                title=title,
                start_date=_str(item.get("start_date")),
                end_date=_str(item.get("end_date")),
                current=bool(item.get("current")),
            )
        )
    # Recent-first: current roles first, then by start_date descending.
    entries.sort(key=lambda e: (e.current, e.start_date or ""), reverse=True)
    return entries[:12]


def _education_entries(raw: Any) -> list[ApolloEducationEntry]:
    """School + diploma from Apollo's ``education`` (when present). Apollo names
    the school under ``school_name`` / ``organization_name`` / ``school`` and the
    field under ``field_of_study`` / ``major`` depending on the record — read
    them defensively. Present-only + bounded."""
    if not isinstance(raw, list):
        return []
    out: list[ApolloEducationEntry] = []
    for item in raw:
        if not isinstance(item, dict):
            continue
        school = _str(item.get("school_name") or item.get("organization_name") or item.get("school"))
        degree = _str(item.get("degree"))
        field = _str(item.get("field_of_study") or item.get("major"))
        if not school and not degree and not field:
            continue
        out.append(
            ApolloEducationEntry(
                school=school,
                degree=degree,
                field_of_study=field,
                start_date=_str(item.get("start_date")),
                end_date=_str(item.get("end_date")),
            )
        )
    return out[:8]


def _phone_entries(raw: Any) -> list[ApolloPhoneNumber]:
    """Full list of numbers with their type + reachability status (the single
    best number is still surfaced separately by :func:`_extract_phone`)."""
    if not isinstance(raw, list):
        return []
    out: list[ApolloPhoneNumber] = []
    for item in raw:
        if not isinstance(item, dict):
            continue
        number = _str(item.get("sanitized_number") or item.get("raw_number"))
        if not number:
            continue
        out.append(ApolloPhoneNumber(number=number, type=_str(item.get("type")), status=_str(item.get("status"))))
    return out[:6]


def _additional_emails(person: ApolloPersonRaw, primary: str) -> list[str]:
    """Revealed ``personal_emails[]`` minus the one already surfaced as the
    primary ``email`` (case-insensitive dedupe). Present-only + bounded."""
    raw = person.get("personal_emails")
    if not isinstance(raw, list):
        return []
    seen = {primary.strip().lower()} if primary else set()
    out: list[str] = []
    for candidate in raw:
        if not isinstance(candidate, str):
            continue
        value = candidate.strip()
        if value and value.lower() not in seen:
            seen.add(value.lower())
            out.append(value)
    return out[:5]


def _search_hit_employment(candidate: ApolloSearchHit) -> list[ApolloEmploymentEntry]:
    """Remap a People-Search hit's light ``employment_history`` dicts
    (``{title, organization, current}``) into the rich career-path shape, so a
    plan-blocked People-Match fallback still surfaces the candidate's history."""
    out: list[ApolloEmploymentEntry] = []
    for item in candidate.employment_history:
        if not isinstance(item, dict):
            continue
        title = _str(item.get("title"))
        org = _str(item.get("organization"))
        if not title and not org:
            continue
        out.append(
            ApolloEmploymentEntry(
                organization_name=org,
                title=title,
                start_date=_str(item.get("start_date")),
                end_date=_str(item.get("end_date")),
                current=bool(item.get("current")),
            )
        )
    return out[:12]


def _to_search_hit(person: ApolloPersonRaw) -> ApolloSearchHit:
    return ApolloSearchHit(
        id=person.get("id", "") or "",
        first_name=person.get("first_name", "") or "",
        last_name=person.get("last_name", "") or "",
        # The search tier ships the surname masked ("Mo***y") and no `last_name`
        # at all. Carried as-is so the dossier can say "Séverine M." rather than
        # "Séverine" — and never expanded into a guess.
        last_name_obfuscated=person.get("last_name_obfuscated", "") or "",
        title=person.get("title", "") or "",
        organization_name=_extract_org_name(person),
        organization_id=_extract_org_field(person, "id"),
        organization_domain=_extract_org_field(person, "primary_domain"),
        linkedin_url=person.get("linkedin_url", "") or "",
        photo_url=person.get("photo_url", "") or "",
        city=person.get("city", "") or "",
        state=person.get("state", "") or "",
        country=person.get("country", "") or "",
        seniority=person.get("seniority", "") or "",
        headline=person.get("headline", "") or "",
        departments=_str_list(person.get("departments")),
        functions=_str_list(person.get("functions")),
        employment_history=_employment_history(person.get("employment_history")),
        # Availability flags Apollo returns on the free search tier — the ONLY
        # email/phone signal at this stage (the values stay locked until a paid
        # People-Match). Lets us target credits at contacts that actually have one.
        has_email=bool(person.get("has_email")),
        has_phone=_has_direct_phone(person.get("has_direct_phone")),
    )


def _has_direct_phone(raw: object) -> bool:
    """Does Apollo hold a direct dial for this person?

    ``has_direct_phone`` is NOT a boolean: Apollo answers ``"Yes"`` or
    ``"Maybe: please request direct dial via people/bulk_match"``. A plain
    ``bool()`` made both true — "maybe" then counted as a promised phone number,
    which is the one thing this flag exists to rule out (it gates whether a
    contact is reachable at all, and where a People-Match credit is worth
    spending). Only an explicit yes counts; anything else is "we don't know".
    """
    if isinstance(raw, bool):
        return raw
    if isinstance(raw, str):
        return raw.strip().lower() == "yes"
    return False


def _current_title(provider_title: object, history: object, employer: str) -> str | None:
    """#4465 — la fonction = l'expérience EN COURS chez l'employeur ; faute de pouvoir la dire, le titre du fournisseur."""
    picked = pick_current_position(_history_dicts(history), employer)
    if picked:
        return _str(picked.get("title"))
    return _str(provider_title)


def _history_dicts(history: object) -> list[dict[str, Any]]:
    if not isinstance(history, list):
        return []
    return [{**item, "organization": item.get("organization_name")} for item in history if isinstance(item, dict)]


def _to_enrichment_result(person: ApolloPersonRaw) -> ApolloEnrichmentResult:
    primary_email = _extract_email(person)
    return ApolloEnrichmentResult(
        matched=True,
        first_name=person.get("first_name") or None,
        last_name=person.get("last_name") or None,
        email=primary_email or None,
        email_status=_coerce_email_status(person.get("email_status")),
        phone=_extract_phone(person) or None,
        linkedin_url=person.get("linkedin_url") or None,
        title=_current_title(person.get("title"), person.get("employment_history"), _extract_org_name(person)),
        organization_name=_extract_org_name(person) or None,
        city=person.get("city") or None,
        country=person.get("country") or None,
        # Photo réelle — champ gratuit du même appel payé. Absent = None.
        photo_url=person.get("photo_url") or None,
        # Rich, factual profile from the SAME paid payload. Present-only.
        headline=_str(person.get("headline")),
        seniority=_str(person.get("seniority")),
        state=_str(person.get("state")),
        twitter_url=_str(person.get("twitter_url")),
        github_url=_str(person.get("github_url")),
        facebook_url=_str(person.get("facebook_url")),
        departments=_str_list(person.get("departments")),
        subdepartments=_str_list(person.get("subdepartments")),
        functions=_str_list(person.get("functions")),
        employment_history=_employment_entries(person.get("employment_history")),
        education=_education_entries(person.get("education")),
        personal_emails=_additional_emails(person, primary_email),
        phone_numbers=_phone_entries(person.get("phone_numbers")),
    )


# ─── People Search (free) ────────────────────────────────────────────────────


# Apollo's People-Search caps `per_page` at 100. Using the cap means a
# single page covers most accounts; the worst case (very common titles at
# a multi-entity group) still resolves in <5 paginated calls.
APOLLO_SEARCH_PER_PAGE = 100

# Hard safety cap on the pagination loop. The loop breaks naturally on
# ``page * per_page >= total`` so a small company (50 decision-makers)
# stops after 1 call — this value only matters for accounts so deep that
# Apollo keeps returning more than the cap × per_page rows. 50 pages =
# 5000 contacts max, which already exceeds anything Claude Phase 3 can
# usefully classify; bumping further would just inflate latency.
APOLLO_SEARCH_MAX_PAGES = 50

# #2543.1/#2543.2 — sous ce nombre de contacts, l'ancre d'organisation SUIVANTE
# (plus faible) est tentée plutôt que de s'arrêter là. Même valeur que le seuil
# de repli Brave+Claude de phase2_contacts.py (``_MIN_CONTACTS_BEFORE_FALLBACK``,
# défaut 5) — même raison : ARQUUS s'arrête à EXACTEMENT 5 (comptage du
# 18/09/2026 sur les 35 comptes de l'espace de Louis), donc la comparaison doit
# être inclusive des deux côtés.
_ORG_ANCHOR_FALLBACK_MIN = 5

# CEDRIC-FIX C.2 — SAFRAN AIRCRAFT ENGINES : l'ancre id rendait 18 personnes, donc
# > ``_ORG_ANCHOR_FALLBACK_MIN`` et la boucle s'arrêtait là, alors que le
# fournisseur en connaît ~90 pour ce groupe (l'ancre id désigne souvent l'ENTITÉ,
# le domaine ou le nom, davantage). Sous ce seuil « maigre », l'ancre EXACTE suivante
# (id → domaine) est tentée et les jeux FUSIONNENT. Au-dessus : aucune requête de plus,
# le coût d'un compte normalement servi ne bouge pas. UN seul réglage (GA-26) : c'est
# aussi le seuil de l'élargissement par bande de séniorité de ``phase2_contacts``
# (``CONTACTS_MIN_BEFORE_WIDENING``, défaut 25 — médiane 50 / p25 14 mesurés le 28/08).
ORG_ANCHOR_THIN_BELOW = int(os.getenv("CONTACTS_MIN_BEFORE_WIDENING", "25"))


def hit_identity(hit: ApolloSearchHit) -> str:
    """La clé qui dit « c'est la même personne », de la plus sûre à la plus faible.

    L'id Apollo d'abord : c'est le SEUL identifiant stable une fois le nom de
    famille masqué par la formule gratuite. Puis l'URL LinkedIn. Le repli
    nom+fonction n'est qu'un repli — deux homonymes au même poste dans la même
    société n'existent pas, deux lignes sans id ni LinkedIn si.
    """
    if hit.id.strip():
        return f"id:{hit.id.strip().lower()}"
    if hit.linkedin_url.strip():
        return f"li:{hit.linkedin_url.strip().rstrip('/').lower()}"
    return f"n:{hit.first_name.strip().lower()}|{hit.last_name.strip().lower()}|{hit.title.strip().lower()}"


def merge_hits(first: list[ApolloSearchHit], extra: list[ApolloSearchHit]) -> list[ApolloSearchHit]:
    """Ajoute ``extra`` à ``first`` sans jamais dupliquer quelqu'un.

    L'ordre de ``first`` est conservé : le classement aval en dépend. Une personne
    déjà connue n'est PAS remplacée par sa version ancrée.
    """
    seen = {hit_identity(h) for h in first}
    merged = list(first)
    for hit in extra:
        key = hit_identity(hit)
        if key in seen:
            continue
        seen.add(key)
        merged.append(hit)
    return merged


# LOT (15/10) DATA-A point 5 — titres EXCLUS de toute recherche de décideurs (stagiaires, alternants,
# assistants : jamais l'interlocuteur d'une vente ESN). Surchargeable : ``APOLLO_SEARCH_NOT_TITLES``
# (liste séparée par des virgules ; ``off`` = rien exclu, requête byte-identique à l'ancienne).
_DEFAULT_NOT_TITLES = ("stage", "alternance", "assistant")


def _not_titles() -> list[str]:
    raw = os.getenv("APOLLO_SEARCH_NOT_TITLES")
    if raw is None:
        return list(_DEFAULT_NOT_TITLES)
    if raw.strip().lower() in {"off", "0", "false", "no", ""}:
        return []
    return [t.strip() for t in raw.split(",") if t.strip()]


def _wanted_email_statuses() -> list[str]:
    """``APOLLO_SEARCH_EMAIL_STATUS`` (ex. ``verified,likely to engage``) : vide/absent = non envoyé.
    Pas de défaut deviné — filtrer sur le statut d'e-mail réduit le vivier, c'est un choix de plan."""
    return [t.strip() for t in os.getenv("APOLLO_SEARCH_EMAIL_STATUS", "").split(",") if t.strip()]


# CACHE-API / DATA-A point 5 (Louis 15/10) : la recherche de personnes est payante (1 crédit par page).
# Cache COMMUN à tous les espaces, 30 j, clé = organisation (id | domaine | nom) + titres + séniorités
# (+ zones et profondeur, qui changent le résultat). Redis SEUL : la liste porte des noms, jamais de
# table durable ; l'effacement RGPD (c67) purge ``apollo:search:*`` en bloc (API, ``purgePerson``).
_SEARCH_CACHE_TTL_S = int(os.getenv("APOLLO_SEARCH_CACHE_TTL_S", str(provider_cache.TTL_CONTACT)))
_SEARCH_FAMILY = "contact:apollo_search"


def _search_cache_key(
    company_name: str,
    person_titles: list[str] | None,
    max_pages: int,
    locations: list[str] | None,
    seniorities: list[str] | None,
    organization_ids: list[str] | None,
    organization_domains: list[str] | None,
    exhaust_anchors: bool = False,
) -> str:
    def norm(values: list[str] | None) -> list[str]:
        return sorted({v.strip().lower() for v in (values or []) if v and v.strip()})

    extra: dict[str, object] = {"exhaust": True} if exhaust_anchors else {}  # #4923.9 — absent = clés d'avant, à l'octet près
    basis = json.dumps(
        {
            **extra,
            "ids": norm(organization_ids),
            "domains": norm(organization_domains),
            "name": (company_name or "").strip().lower(),
            "titles": norm(person_titles),
            "seniorities": norm(seniorities),
            "locations": norm(locations),
            "pages": max_pages,
            # CEDRIC-FIX C.2 — v2 : la recherche fusionne désormais les ancres exactes d'un
            # compte maigre. Les listes de 30 j écrites AVANT ne sont plus relues, si bien que
            # « Agrandir la recherche » rattrape les comptes déjà analysés sans rejeu de masse.
            "v": 2,
            "not_titles": norm(_not_titles()),
            "email_status": norm(_wanted_email_statuses()),
        },
        sort_keys=True,
    )
    return "apollo:search:" + hashlib.sha256(basis.encode("utf-8")).hexdigest()


async def search_people_with_status(
    company_name: str,
    person_titles: list[str] | None = None,
    max_pages: int = APOLLO_SEARCH_MAX_PAGES,
    http_client: httpx.AsyncClient | None = None,
    locations: list[str] | None = None,
    seniorities: list[str] | None = None,
    organization_ids: list[str] | None = None,
    organization_domains: list[str] | None = None,
    exhaust_anchors: bool = False,
) -> tuple[list[ApolloSearchHit], ApolloSearchStatus, int | None]:
    """Cached wrapper over :func:`_search_people_uncached` (cache commun 30 j, Redis seul).
    Seul un résultat ``OK`` non vide est écrit : une panne ou un vide se retente."""
    key = _search_cache_key(
        company_name,
        person_titles,
        max_pages,
        locations,
        seniorities,
        organization_ids,
        organization_domains,
        exhaust_anchors,
    )
    r = await _enrich_cache_redis() if not provider_cache.caching_disabled() else None
    if r is not None:
        try:
            raw = await r.get(key)
            if raw:
                cached = json.loads(raw)
                provider_cache.log_call(_SEARCH_FAMILY, hit=True)
                return (
                    [ApolloSearchHit.model_validate(c) for c in cached["contacts"]],
                    ApolloSearchStatus(cached["status"]),
                    cached.get("total"),
                )
        except Exception as exc:  # noqa: BLE001 — best-effort
            logger.debug("Apollo search cache get failed: %s", exc)
    provider_cache.log_call(_SEARCH_FAMILY, hit=False)
    contacts, status, total = await _search_people_uncached(
        company_name,
        person_titles,
        max_pages,
        http_client,
        locations,
        seniorities,
        organization_ids,
        organization_domains,
        exhaust_anchors,
    )
    if r is not None and contacts and status == ApolloSearchStatus.OK:
        try:
            await r.set(
                key,
                json.dumps(
                    {"contacts": [c.model_dump(mode="json") for c in contacts], "status": status.value, "total": total}
                ),
                ex=_SEARCH_CACHE_TTL_S,
            )
        except Exception as exc:  # noqa: BLE001 — best-effort
            logger.debug("Apollo search cache set failed: %s", exc)
    return contacts, status, total


async def _search_people_uncached(
    company_name: str,
    person_titles: list[str] | None = None,
    max_pages: int = APOLLO_SEARCH_MAX_PAGES,
    http_client: httpx.AsyncClient | None = None,
    locations: list[str] | None = None,
    seniorities: list[str] | None = None,
    organization_ids: list[str] | None = None,
    organization_domains: list[str] | None = None,
    exhaust_anchors: bool = False,
) -> tuple[list[ApolloSearchHit], ApolloSearchStatus, int | None]:
    """Same as :func:`search_people` but also returns a typed health status
    and the population the source itself announced.

    Allows callers to distinguish ``Apollo returned 0 contacts`` from
    ``Apollo is unreachable`` — a distinction the old swallow-everything
    contract silently lost. ``search_people`` keeps the legacy signature
    for callers that don't care about the status.

    # #2543.1 — org scope precedence is ENFORCED here, not merely documented.
    ``organization_ids`` (Apollo's own id, exact) → ``organization_domains``
    (employer domain) → ``company_name`` (fuzzy name). Apollo ANDs whichever
    anchors a single REQUEST carries (``search_past_employees`` already relies
    on this fact — it sends the domain ALONE on purpose, see its docstring), so
    sending all three together doesn't narrow to "people at this org", it
    narrows to the intersection of three matches on the SAME request, which can
    be emptier than any anchor alone — exactly the failure mode of a
    composite/registry company name (« ARQUUS (VOLVO GROUP…, RENAULT TRUCKS
    DEFENSE…) ») riding along with a resolved id/domain. This function tries
    ONE anchor per request, strongest first, and only tries the next (weaker)
    one when the current best has ``_ORG_ANCHOR_FALLBACK_MIN`` contacts or
    fewer — the repli a name-only-scoped account (ARQUUS: exactly 5) needs.
    """
    try:
        api_key = _get_api_key()
    except ValueError:
        return [], ApolloSearchStatus.UNCONFIGURED, None

    titles = [t for t in (person_titles or []) if t and t.strip()]
    # Fall back to the built-in IT decider list ONLY when the caller passed no
    # targeting at all (no titles AND no seniorities). A seniority-band search
    # (titles empty + seniorities set) is a deliberate WIDE search — the whole
    # management layer of the account — and must NOT be re-narrowed by
    # DEFAULT_TITLES, or "hundreds of directors at SNCF" collapse back to ~10.
    if not titles and not seniorities:
        titles = DEFAULT_TITLES
    org_name = (company_name or "").strip()
    not_titles = _not_titles()
    email_statuses = _wanted_email_statuses()
    org_ids = [i for i in (organization_ids or []) if i and i.strip()]
    org_domains = [d.strip() for d in (organization_domains or []) if d and d.strip()]

    # #2543.1 — une ancre par tentative, dans l'ordre de précédence. Une liste
    # (pas un `elif`) : chaque ancre DISPONIBLE devient une tentative séparée,
    # essayée dans l'ordre, jamais combinée dans la même requête.
    anchor_attempts: list[tuple[list[str], list[str], str]] = []
    if org_ids:
        anchor_attempts.append((org_ids, [], ""))
    if org_domains:
        anchor_attempts.append(([], org_domains, ""))
    if org_name:
        anchor_attempts.append(([], [], org_name))
    if not anchor_attempts:
        # Aucune ancre du tout : recherche non scopée, comportement historique.
        anchor_attempts.append(([], [], ""))

    client = http_client or httpx.AsyncClient(timeout=HTTP_TIMEOUT_S)
    should_close = http_client is None
    started = time.monotonic()

    best_contacts: list[ApolloSearchHit] = []
    best_status: ApolloSearchStatus = ApolloSearchStatus.EMPTY
    best_total_entries: int | None = None

    try:
        for attempt_org_ids, attempt_org_domains, attempt_org_name in anchor_attempts:
            contacts: list[ApolloSearchHit] = []
            pages_fetched = 0
            last_status: int | None = None
            final_status: ApolloSearchStatus = ApolloSearchStatus.EMPTY
            # #2543.4 — la population que la source ANNONCE pour cette
            # tentative, pas seulement ce qu'on en a retenu.
            total_entries: int | None = None
            logger.info(
                "Apollo search start company=%r org_ids=%d org_domains=%d titles=%d max_pages=%d per_page=%d",
                attempt_org_name or "-",
                len(attempt_org_ids),
                len(attempt_org_domains),
                len(titles),
                max_pages,
                APOLLO_SEARCH_PER_PAGE,
            )

            for page in range(1, max_pages + 1):
                payload: ApolloSearchPayload = {
                    "page": page,
                    "per_page": APOLLO_SEARCH_PER_PAGE,
                }
                # Title filter omitted on a wide seniority-band search (titles == []).
                if titles:
                    payload["person_titles"] = titles
                # #2543.1 — UNE seule ancre d'org par requête : celle assignée à
                # cette tentative, jamais les trois ensemble (Apollo les ANDe).
                if attempt_org_ids:
                    payload["organization_ids"] = attempt_org_ids
                elif attempt_org_domains:
                    payload["q_organization_domains_list"] = attempt_org_domains
                elif attempt_org_name:
                    payload["q_organization_name"] = attempt_org_name
                # S6 scope — only sent when the caller narrows the search.
                if locations:
                    payload["person_locations"] = locations
                if seniorities:
                    payload["person_seniorities"] = seniorities
                # LOT (15/10) DATA-A point 5 — bruit exclu à la source (pas de stage/alternance/assistant).
                if not_titles:
                    payload["person_not_titles"] = not_titles
                if email_statuses:
                    payload["contact_email_status"] = email_statuses

                page_started = time.monotonic()
                try:
                    # Registre de coûts (D19) : un appel parti = un crédit Apollo
                    # consommé, qu'il trouve quelqu'un ou non.
                    cost_ledger.record("apollo", "request", units=1)
                    async with throttle("apollo"):
                        res = await client.post(
                            APOLLO_SEARCH_URL,
                            json=payload,
                            headers=_make_headers(api_key),
                        )
                except (httpx.TransportError, httpx.TimeoutException) as exc:
                    # Network-level failure — recoverable. Surface as DOWN so the
                    # agent decides retry policy.
                    logger.warning(
                        "Apollo search network error: company=%r page=%d exc=%s",
                        company_name,
                        page,
                        exc,
                    )
                    final_status = ApolloSearchStatus.DOWN
                    break

                page_ms = int((time.monotonic() - page_started) * 1000)
                last_status = res.status_code

                if not res.is_success:
                    final_status = _categorize_http_failure(res.status_code, res.text)
                    if final_status == ApolloSearchStatus.RATE_LIMITED:
                        # Le jeton acquis ne dit rien du débit RÉEL qu'Apollo accepte —
                        # le seul retour d'information d'un 429 est le refroidissement.
                        back_off_provider("apollo", retry_after_header(res))
                    if final_status == ApolloSearchStatus.PLAN_BLOCKED:
                        logger.warning(
                            "Apollo search blocked by plan: company=%r — falling back. "
                            "Use a master API key or upgrade the Apollo plan.",
                            company_name,
                        )
                    else:
                        logger.error(
                            "Apollo search error: company=%r page=%d status=%d duration_ms=%d body=%s",
                            company_name,
                            page,
                            res.status_code,
                            page_ms,
                            res.text[:500],
                        )
                    break

                try:
                    data = cast(ApolloSearchResponseRaw, res.json())
                except ValueError:
                    # 200 with a non-JSON body (CDN/proxy interstitial, truncated
                    # payload) — degrade to DOWN + fallback instead of letting a
                    # JSONDecodeError bubble up as a retryable 500.
                    logger.error(
                        "Apollo search: 200 but non-JSON body company=%r page=%d body=%s",
                        company_name,
                        page,
                        res.text[:200],
                    )
                    final_status = ApolloSearchStatus.DOWN
                    break
                people = data.get("people") or []
                # `mixed_people/api_search` puts `total_entries` at the top level and
                # ships no `pagination` object; other/older search shapes nest it
                # under `pagination`. Read the top level first, fall back to nested,
                # default 0 — never let a missing/None value reach the `>=` compare
                # below (would TypeError and 500 the whole contacts pipeline).
                total = (
                    data.get("total_entries")
                    or (data.get("pagination") or {}).get("total_entries", 0)
                    or 0
                )
                # #2543.4 — gardé, pas seulement journalisé.
                total_entries = total

                logger.debug(
                    "Apollo search page company=%r page=%d returned=%d total=%d duration_ms=%d",
                    company_name,
                    page,
                    len(people),
                    total,
                    page_ms,
                )

                if not people:
                    break

                for person in people:
                    contacts.append(_to_search_hit(person))
                pages_fetched = page

                if page * APOLLO_SEARCH_PER_PAGE >= total:
                    break
            else:
                # Loop exhausted without an early break — pagination filled max_pages.
                pass

            # If we never hit a failure branch, success is determined by contact count.
            if final_status == ApolloSearchStatus.EMPTY and contacts:
                final_status = ApolloSearchStatus.OK

            duration_ms = int((time.monotonic() - started) * 1000)
            logger.info(
                "Apollo search done company=%r contacts=%d pages=%d status=%s "
                "search_status=%s duration_ms=%d",
                company_name,
                len(contacts),
                pages_fetched,
                last_status,
                final_status.value,
                duration_ms,
            )

            # CEDRIC-FIX C.2 — deux ancres EXACTES (id / domaine) qui rendent chacune
            # un jeu maigre se COMPLÈTENT : on garde le plus grand comme base et on y
            # ajoute ce que l'autre a de plus. L'ancre par nom (floue) reste « la
            # meilleure gagne » : fusionner un rapprochement flou importerait des
            # homonymes.
            exact_attempt = bool(attempt_org_ids or attempt_org_domains)
            if exhaust_anchors:
                # #4923.9 — passes « rôles de tête » : CHAQUE ancre disponible est
                # interrogée et les jeux fusionnent (AXA France ≠ AXA Group Operations ≠
                # AXA XL : le Head of Data du groupe n'est pas dans l'entité de l'id). Le
                # contact trouvé par le seul NOM reste « employeur non vérifié » (#3911.1).
                if not exact_attempt:
                    contacts = [c.model_copy(update={"employer_unverified": True}) for c in contacts]
                if contacts:
                    best_contacts = merge_hits(best_contacts, contacts)
                    best_status = ApolloSearchStatus.OK
                    best_total_entries = max(best_total_entries or 0, total_entries or 0) or None
                elif not best_contacts and final_status not in (ApolloSearchStatus.EMPTY, ApolloSearchStatus.OK):
                    best_status, best_total_entries = final_status, total_entries
                continue
            if exact_attempt and best_contacts and contacts and len(best_contacts) < ORG_ANCHOR_THIN_BELOW:
                base, other = (contacts, best_contacts) if len(contacts) > len(best_contacts) else (best_contacts, contacts)
                merged = merge_hits(base, other)
                if len(merged) > len(best_contacts):
                    best_contacts = merged
                    best_status = final_status if len(contacts) > len(best_contacts) else best_status
                    if total_entries is not None and (best_total_entries or 0) < total_entries:
                        best_total_entries = total_entries
            elif len(contacts) > len(best_contacts):
                best_contacts, best_status, best_total_entries = contacts, final_status, total_entries
                # #3911.1 — cette tentative n'avait pas d'ancre EXACTE (id
                # Apollo / domaine), seulement le nom en texte libre : marque
                # chaque contact gagné comme employeur non vérifié (deux
                # entités homonymes passeraient toutes les deux ce nom).
                if not attempt_org_ids and not attempt_org_domains:
                    best_contacts = [c.model_copy(update={"employer_unverified": True}) for c in best_contacts]
            elif (
                not best_contacts
                and best_status == ApolloSearchStatus.EMPTY
                and final_status not in (ApolloSearchStatus.EMPTY, ApolloSearchStatus.OK)
            ):
                # #2543.3 — aucune tentative n'a encore rien trouvé : garde le
                # signal d'échec TYPÉ plutôt que de le laisser s'effacer
                # derrière un EMPTY par défaut. Une ancre plus faible peut
                # encore réussir ensuite (repli ordonné).
                best_status, best_total_entries = final_status, total_entries

            # Ancre déjà suffisante : inutile de dépenser un appel de plus sur
            # une ancre plus faible (#2543.1 — le repli est ORDONNÉ, pas
            # systématique).
            if len(best_contacts) >= max(ORG_ANCHOR_THIN_BELOW, _ORG_ANCHOR_FALLBACK_MIN + 1):
                break
    finally:
        if should_close:
            await client.aclose()

    return best_contacts, best_status, best_total_entries


async def search_people_by_name(
    *,
    full_name: str,
    organization_name: str | None = None,
    max_results: int = 20,
    http_client: httpx.AsyncClient | None = None,
) -> tuple[list[ApolloSearchHit], ApolloSearchStatus]:
    """#2727 — « je tape un nom, je vois les homonymes, je choisis ».

    Découvrir ne cherchait que des ORGANISATIONS ; ``search_people`` /
    ``search_people_with_status`` exigent tous les deux une ancre d'entreprise.
    Cette fonction cherche par NOM, via le tier GRATUIT de People-Search
    (``q_keywords``) — jamais ``person_titles`` : une recherche de personne
    cible un nom précis, pas une bande de rôles (le repli ``DEFAULT_TITLES``
    des recherches d'organisation écarterait Marion Sagnard, RH, au profit des
    décideurs IT). ``organization_name`` reste facultatif ; renseigné, c'est
    précisément ce qui distingue deux homonymes d'entreprises différentes.

    UNE seule page (``max_results``) et AUCUN repli d'ancre : au-delà, la bonne
    réponse est d'affiner le nom ou l'entreprise, pas de payer une deuxième
    requête pour une liste que plus personne ne lit. Le reveal (email/téléphone)
    reste un geste séparé et payant, inchangé — voir ``enrich_person``.
    """
    try:
        api_key = _get_api_key()
    except ValueError:
        return [], ApolloSearchStatus.UNCONFIGURED

    name = full_name.strip()
    if not name:
        return [], ApolloSearchStatus.EMPTY

    payload: ApolloSearchPayload = {
        "page": 1,
        "per_page": max_results,
        "q_keywords": name,
    }
    org = (organization_name or "").strip()
    if org:
        payload["q_organization_name"] = org

    client = http_client or httpx.AsyncClient(timeout=HTTP_TIMEOUT_S)
    should_close = http_client is None
    try:
        try:
            # Registre de coûts (D19) : un appel parti = un crédit Apollo
            # consommé, qu'il trouve quelqu'un ou non — même discipline que
            # `search_people_with_status`.
            cost_ledger.record("apollo", "request", units=1)
            async with throttle("apollo"):
                res = await client.post(APOLLO_SEARCH_URL, json=payload, headers=_make_headers(api_key))
        except (httpx.TransportError, httpx.TimeoutException) as exc:
            logger.warning("Apollo name search network error: name=%r exc=%s", name, exc)
            return [], ApolloSearchStatus.DOWN

        if not res.is_success:
            status = _categorize_http_failure(res.status_code, res.text)
            if status == ApolloSearchStatus.RATE_LIMITED:
                back_off_provider("apollo", retry_after_header(res))
            logger.warning(
                "Apollo name search error: name=%r status=%d body=%s", name, res.status_code, res.text[:500]
            )
            return [], status

        try:
            data = cast(ApolloSearchResponseRaw, res.json())
        except ValueError:
            logger.error("Apollo name search: 200 but non-JSON body name=%r body=%s", name, res.text[:200])
            return [], ApolloSearchStatus.DOWN

        people = data.get("people") or []
        hits = [_to_search_hit(person) for person in people]
        return hits, (ApolloSearchStatus.OK if hits else ApolloSearchStatus.EMPTY)
    finally:
        if should_close:
            await client.aclose()


class SearchOutcome:
    """#2543.5a — optional out-param for :func:`search_people`.

    ``search_people`` must keep returning a bare ``list[ApolloSearchHit]`` —
    every existing caller AND every existing test mock (``return_value=[...]``,
    a strict ``call_args.kwargs ==`` comparison) depends on that exact
    contract. But the typed status + announced population that
    :func:`search_people_with_status` already computes were being logged and
    discarded right there (#2543.5, point 1). This object is how a caller that
    knows to look can read them back — filled by ``search_people`` right after
    the SAME underlying call (no second Apollo request, no extra cost), left
    at its defaults when the caller passes none, or when ``search_people``
    itself is mocked out in a test. Absent (``None``) means "not measured",
    never a guessed ``ApolloSearchStatus.OK`` (GA-18/19).
    """

    def __init__(self) -> None:
        self.status: ApolloSearchStatus | None = None
        self.total_entries: int | None = None


async def search_people(
    company_name: str,
    person_titles: list[str] | None = None,
    max_pages: int = APOLLO_SEARCH_MAX_PAGES,
    http_client: httpx.AsyncClient | None = None,
    locations: list[str] | None = None,
    seniorities: list[str] | None = None,
    organization_ids: list[str] | None = None,
    organization_domains: list[str] | None = None,
    outcome: SearchOutcome | None = None,
    exhaust_anchors: bool = False,
) -> list[ApolloSearchHit]:
    """Search people at a company via Apollo People Search (free).

    Legacy thin wrapper around :func:`search_people_with_status` that drops the
    status indicator FOR THE STATUSES A CALLER CAN SAFELY TREAT AS "0 people at
    this company" (``EMPTY``) or "no paid access, the Brave+Claude fallback is
    the intended path" (``PLAN_BLOCKED`` — free-plan accounts hit this
    routinely; the contacts pipeline is built to degrade through it). Existing
    callers (``phase2_contacts.py``) that only care about the contact list keep
    working unchanged for those two cases.

    # #2543.3 — every OTHER failure status (``UNCONFIGURED``, ``AUTH_FAILED``,
    # ``RATE_LIMITED``, ``DOWN``) used to collapse into the same bare ``[]`` —
    # "Apollo is unreachable" became indistinguishable from "this company has
    # nobody", and the coverage funnel had no way to tell a 429/timeout from a
    # genuine zero. Those statuses now raise :class:`ApolloUnavailableError`
    # (a ``ValueError`` — every existing ``except ValueError`` around a search
    # call keeps working, and ``phase2_contacts.py``'s existing
    # ``apollo_health=SourceHealth.DOWN`` envelope path — already written,
    # never fed a real signal — now receives one).  New callers that want the
    # status as DATA instead of an exception should call
    # ``search_people_with_status`` directly.
    """
    if not os.environ.get("APOLLO_API_KEY"):
        # Backward-compat: the legacy contract raises here so callers that
        # only catch ValueError keep working.
        _get_api_key()  # raises ValueError
    contacts, status, total_entries = await search_people_with_status(
        company_name=company_name,
        person_titles=person_titles,
        max_pages=max_pages,
        http_client=http_client,
        locations=locations,
        seniorities=seniorities,
        organization_ids=organization_ids,
        organization_domains=organization_domains,
        exhaust_anchors=exhaust_anchors,
    )
    if outcome is not None:
        # #2543.5a — rempli quel que soit le dénouement (retour ou levée
        # ci-dessous) : un appelant qui capture l'exception doit pouvoir lire
        # POURQUOI, pas seulement que ça a échoué.
        outcome.status = status
        outcome.total_entries = total_entries
    if status in (
        ApolloSearchStatus.UNCONFIGURED,
        ApolloSearchStatus.AUTH_FAILED,
        ApolloSearchStatus.RATE_LIMITED,
        ApolloSearchStatus.DOWN,
    ):
        raise ApolloUnavailableError(
            0,
            status.value,
            "",
            context=f"search {company_name!r}",
        )
    return contacts


# ─── People Search, passe PAST-EMPLOYER (#1611.6) ────────────────────────────

#: Combien de pages la passe past-employer demande à Apollo. UNE page = UNE
#: requête facturée au registre de coûts (D19) et 100 personnes — assez pour
#: qu'une destination atteigne le seuil de trois occurrences du bloc agrégé.
#: `0` = **no-op STRICT** : aucun appel réseau, aucun coût, liste vide.
REVERSE_PROSPECT_SEARCH_PAGES_ENV = "REVERSE_PROSPECT_SEARCH_PAGES"
REVERSE_PROSPECT_SEARCH_PAGES_DEFAULT = 1


def reverse_prospect_search_pages() -> int:
    """Le nombre de pages de la passe past-employer, borné à [0, 5].

    Illisible ⇒ le défaut, jamais une erreur : un réglage de coût mal tapé ne
    doit pas faire tomber une analyse.
    """
    raw = os.environ.get(REVERSE_PROSPECT_SEARCH_PAGES_ENV, "").strip()
    if not raw:
        return REVERSE_PROSPECT_SEARCH_PAGES_DEFAULT
    try:
        pages = int(raw)
    except ValueError:
        return REVERSE_PROSPECT_SEARCH_PAGES_DEFAULT
    return max(0, min(pages, 5))


async def search_past_employees(
    organization_domains: list[str],
    person_titles: list[str] | None = None,
    seniorities: list[str] | None = None,
    http_client: httpx.AsyncClient | None = None,
) -> list[ApolloSearchHit]:
    """Les personnes dont le DOMAINE d'employeur — actuel **ou passé** — est
    celui du compte. C'est la passe qui alimente la prospection inversée.

    ─────────────────────────────────────────────────────────────────────────
    POURQUOI CETTE FONCTION EXISTE
    ─────────────────────────────────────────────────────────────────────────
    ``reverse_prospecting.find_reverse_prospects`` ne peut tagger quelqu'un que
    s'il a un passage PASSÉ chez la cible et un employeur ACTUEL ailleurs. Or
    la recherche du dossier est ancrée sur le NOM de la société
    (``q_organization_name``), qui désigne l'employeur COURANT : tout ce
    qu'elle rend travaille encore là, donc le filtre écartait 100 % du pool et
    le bloc « Ce que Bellum observe dans les trajectoires » (#1611.6) ne
    pouvait **jamais** s'allumer. Un docstring promettait pourtant une
    ``apollo.search_past_employees`` — elle n'a jamais été écrite (vérifié le
    11/09/2026 : zéro occurrence hors commentaire). Du code juste que personne
    ne NOURRIT.

    ─────────────────────────────────────────────────────────────────────────
    LE CONTRAT, ET POURQUOI IL NE SE DEVINE PAS
    ─────────────────────────────────────────────────────────────────────────
    Le SEUL paramètre qu'Apollo documente comme couvrant un employeur passé est
    ``q_organization_domains_list`` : « The domain name for the person's
    employer. This can be the current employer **or a previous employer** »
    (docs.apollo.io, People Search). Il n'existe **aucun**
    ``person_past_organization_ids`` documenté — on ne l'invente donc pas.

    D'où la règle de cette passe : **le domaine PART SEUL**. Ni
    ``company_name`` ni ``organization_ids`` ne l'accompagnent — Apollo ANDe
    ses ancres, et l'une ou l'autre re-restreindrait aux salariés ACTUELS,
    c'est-à-dire exactement le pool qui ne contient aucun ex-collaborateur.

    ⚠️ Le risque est BORNÉ par construction. Si le contrat ne se comporte pas
    comme il est documenté, la passe rend des salariés actuels, que
    ``is_reverse_prospect`` écarte tous : la liste est VIDE et le bloc se tait.
    Une passe qui échoue produit un SILENCE, jamais une entreprise fausse.

    Sans domaine, aucun appel : le nom seul ne sait pas chercher un passé.
    """
    domains = [d.strip() for d in (organization_domains or []) if d and d.strip()]
    pages = reverse_prospect_search_pages()
    if not domains or pages == 0:
        return []
    contacts, _status, _total_entries = await search_people_with_status(
        # Le nom est VOLONTAIREMENT vide — voir le docstring. Le laisser passer
        # est la seule façon de casser cette fonction sans qu'aucun test ne le
        # voie : elle rendrait des salariés actuels et donc zéro prospect.
        company_name="",
        person_titles=person_titles,
        max_pages=pages,
        http_client=http_client,
        locations=None,
        seniorities=seniorities,
        organization_ids=None,
        organization_domains=domains,
    )
    return contacts


# ─── People Match (paid: email reveal) ───────────────────────────────────────


def _build_enrich_payload(
    *,
    apollo_id: str | None = None,
    linkedin_url: str | None,
    first_name: str | None,
    last_name: str | None,
    organization_name: str | None,
) -> ApolloEnrichPayload:
    """Match priority: Apollo id first (the only key that survives the search tier
    obfuscating the last name), then LinkedIn URL, then name+org.

    ``last_name`` is optional: a mononym / unsplittable ``full_name`` still
    yields a usable ``first_name + organization_name`` key (Apollo fuzzy-matches
    it). It is omitted from the payload when absent rather than sent empty.

    Always asks Apollo to reveal personal emails. Phone reveal is *not*
    requested here — E1 (#3698) : it is a SEPARATE call, `request_phone_reveal`.
    """
    if apollo_id:
        return ApolloEnrichByIdPayload(
            id=apollo_id,
            reveal_personal_emails=True,
        )
    if linkedin_url:
        return ApolloEnrichByLinkedInPayload(
            linkedin_url=linkedin_url,
            reveal_personal_emails=True,
        )
    if first_name and organization_name:
        payload = ApolloEnrichByNamePayload(
            first_name=first_name,
            organization_name=organization_name,
            reveal_personal_emails=True,
        )
        if last_name:
            payload["last_name"] = last_name
        return payload
    raise ValueError(
        "Apollo enrich requires a match key: apollo_id OR linkedin_url OR (first_name + organization_name)"
    )


def _empty_result() -> ApolloEnrichmentResult:
    return ApolloEnrichmentResult(matched=False)


# ── People-Match cache ──────────────────────────────────────────────────────────
# A successful People-Match costs 1 Apollo credit and is slow. Cache MATCHED
# results (keyed on the strongest identity) so re-analyses / re-runs don't
# re-spend credits or re-wait. Redis-backed, best-effort, TTL-bounded (RGPD: only
# what Apollo already returned, and it expires). Misses/errors are NOT cached
# (Apollo data improves over time; an error isn't a real "no match").
#
# ⚠️ DÉLIBÉRÉMENT sans étage Postgres durable (lot 16, câble 3 / GA-323 —
# arbitrage de Louis le 12/09/2026, revenu en arrière après une première
# implémentation). Cette entrée est un e-mail et un téléphone d'une PERSONNE
# identifiée — pas de la donnée d'entreprise. ``source_cache.py`` documente
# une règle « PUBLIC data ONLY … NEVER user or CRM data » : un Postgres
# durable, partagé par tous les workers/déploiements, PROLONGE la rétention
# de cette donnée personnelle dans les faits, même si le TTL nominal et la
# clé restent identiques à ceux de Redis — Redis s'évince, Postgres non. On
# ne prolonge pas la rétention de données personnelles pour économiser un
# crédit Apollo ; l'économie sur l'organisation (``apollo_org.py``) reste
# acquise, celle-ci se paierait en posture RGPD. Ne pas « compléter » ce
# fichier avec un ``source_cache.get/put`` sans relecture RGPD explicite.
# CACHE-API (Louis 15/10) : 30 j (``CACHE_TTL_CONTACT_S``) — un crédit par personne, jamais deux
# fois dans le mois. Toujours Redis SEUL (cf. ⚠️ ci-dessus). Une personne effacée (c67) est purgée
# de ce cache par l'API à l'effacement (``person-contact-cache.ts``, même dérivation de clé).
_ENRICH_CACHE_TTL_S = int(os.getenv("APOLLO_ENRICH_CACHE_TTL_S", str(provider_cache.TTL_CONTACT)))


_CONTACT_FAMILY = "contact:apollo"


def _enrich_cache_key(
    linkedin_url: str | None,
    first_name: str | None,
    last_name: str | None,
    organization_name: str | None,
    apollo_id: str | None = None,
) -> str | None:
    if apollo_id and apollo_id.strip():
        basis = "id:" + apollo_id.strip().lower()
    elif linkedin_url and linkedin_url.strip():
        basis = "li:" + provider_cache.linkedin_identity(linkedin_url)
    elif first_name and last_name and organization_name:
        basis = f"no:{first_name}|{last_name}|{organization_name}".strip().lower()
    else:
        return None
    return "apollo:enrich:" + hashlib.sha256(basis.encode("utf-8")).hexdigest()


async def _enrich_cache_redis():
    """Pooled redis client, or None when caching is unavailable (best-effort)."""
    url = redis_url()
    if not url:
        return None
    try:
        return await get_client(url)
    except Exception as exc:  # noqa: BLE001 — RedisUnavailable + any error: cache is best-effort
        logger.debug("Apollo enrich cache: Redis unavailable (%s) — caching off", exc)
        return None


async def enrich_person(
    *,
    apollo_id: str | None = None,
    linkedin_url: str | None = None,
    first_name: str | None = None,
    last_name: str | None = None,
    organization_name: str | None = None,
    http_client: httpx.AsyncClient | None = None,
) -> ApolloEnrichmentResult:
    """Cached wrapper over the paid Apollo People-Match. Serves a cached matched
    result when available; otherwise calls Apollo and caches a real match. Misses
    and errors are never cached. Any Redis issue falls through to a live call."""
    key = _enrich_cache_key(linkedin_url, first_name, last_name, organization_name, apollo_id)
    if key:
        r = await _enrich_cache_redis()
        if r is not None:
            try:
                raw = await r.get(key)
                if raw:
                    provider_cache.log_call(_CONTACT_FAMILY, hit=True)
                    return ApolloEnrichmentResult.model_validate_json(raw)
            except Exception as exc:  # noqa: BLE001 — best-effort
                logger.debug("Apollo enrich cache get failed: %s", exc)
    if key:
        provider_cache.log_call(_CONTACT_FAMILY, hit=False)
    result = await _enrich_person_uncached(
        apollo_id=apollo_id,
        linkedin_url=linkedin_url,
        first_name=first_name,
        last_name=last_name,
        organization_name=organization_name,
        http_client=http_client,
    )
    if key and result.matched:
        r = await _enrich_cache_redis()
        if r is not None:
            try:
                await r.set(key, result.model_dump_json(), ex=_ENRICH_CACHE_TTL_S)
            except Exception as exc:  # noqa: BLE001 — best-effort
                logger.debug("Apollo enrich cache set failed: %s", exc)
    return result


async def _enrich_person_uncached(
    *,
    apollo_id: str | None = None,
    linkedin_url: str | None = None,
    first_name: str | None = None,
    last_name: str | None = None,
    organization_name: str | None = None,
    http_client: httpx.AsyncClient | None = None,
) -> ApolloEnrichmentResult:
    """Enrich a single person via Apollo People Match (paid: 1 credit / email).

    One of these must be provided (strongest first):
      - ``apollo_id`` (the People-Search person id — the only key that survives
        the search tier obfuscating the last name)
      - ``linkedin_url`` (Apollo's other reliable key)
      - the ``first_name + organization_name`` pair (``last_name`` optional)

    Phone reveal is intentionally not requested: it requires a webhook
    callback flow that is out of scope for this PR.
    """
    payload = _build_enrich_payload(
        apollo_id=apollo_id,
        linkedin_url=linkedin_url,
        first_name=first_name,
        last_name=last_name,
        organization_name=organization_name,
    )
    api_key = _get_api_key()
    # #2604.2 — `contact_enrich.enrich_top_deciders` appelle cette fonction SANS
    # `http_client`, jusqu'à `CONTACTS_ENRICH_TOP_N` fois EN PARALLÈLE
    # (`asyncio.gather`) : le repli `httpx.AsyncClient()` construisait puis
    # refermait un client PAR CONTACT (2-79ms synchrones avant le premier
    # `await`, même défaut que #2604.1). Client de PROCESS partagé (GA-26,
    # `_http_pool.get_shared_client` — même registre que `data_sources/`), donc
    # plus jamais fermé ici : voir `tests/test_apollo_service.py`
    # `test_enrich_person_reuses_one_http_client_across_calls`.
    client = http_client if http_client is not None else get_shared_client("apollo", timeout=HTTP_TIMEOUT_S)

    started = time.monotonic()
    match_key = "apollo_id" if apollo_id else "linkedin_url" if linkedin_url else "name_org"
    logger.info(
        "Apollo enrich start match_key=%s name=%s %s org=%r",
        match_key,
        first_name or "-",
        last_name or "-",
        organization_name or "-",
    )

    try:
        # Registre de coûts (D19) : un appel parti = un crédit Apollo consommé.
        cost_ledger.record("apollo", "request", units=1)
        async with throttle("apollo"):
            res = await client.post(
                APOLLO_ENRICH_URL, json=payload, headers=_make_headers(api_key),
            )

        duration_ms = int((time.monotonic() - started) * 1000)

        if not res.is_success:
            if res.status_code == 403 and _is_plan_inaccessible(res.text):
                logger.warning(
                    "Apollo enrich blocked by plan: match_key=%s — use a master API key or upgrade.",
                    match_key,
                )
                raise ApolloPlanError(
                    "Apollo plan does not allow People-Match — upgrade to a paid "
                    "plan or generate a master API key.",
                )
            if res.status_code == 429:
                back_off_provider("apollo", retry_after_header(res))
            logger.error(
                "Apollo enrich error: match_key=%s name=%s %s org=%r status=%d duration_ms=%d body=%s",
                match_key,
                first_name or "-",
                last_name or "-",
                organization_name or "-",
                res.status_code,
                duration_ms,
                res.text[:500],
            )
            # Typed, with the shared reason vocabulary: a 401 (key rejected), a
            # 429 (throttled) and a 5xx (Apollo down) have three different
            # repairs, and the product must be able to say which one happened.
            raise ApolloUnavailableError(
                res.status_code,
                reason_for_status(res.status_code),
                res.text,
                context=f"enrich {match_key}",
            )

        try:
            body = cast(ApolloEnrichResponseRaw, res.json())
        except ValueError:
            # 200 with a non-JSON body — treat as a miss, not a crash.
            logger.error("Apollo enrich: 200 but non-JSON body match_key=%s body=%s", match_key, res.text[:200])
            return _empty_result()
        person = body.get("person")
        if not person:
            logger.warning(
                "Apollo enrich miss match_key=%s name=%s %s org=%r duration_ms=%d",
                match_key,
                first_name or "-",
                last_name or "-",
                organization_name or "-",
                duration_ms,
            )
            return _empty_result()

        result = _to_enrichment_result(person)
        # Don't log emails/phones (PII) — booleans confirm Apollo is alive.
        logger.info(
            "Apollo enrich hit match_key=%s email=%s phone=%s duration_ms=%d",
            match_key,
            bool(result.email),
            bool(result.phone),
            duration_ms,
        )
        return result
    except httpx.HTTPError as exc:
        # Transport failure (DNS, connection reset, read timeout). Apollo never
        # answered, so we know nothing about this person — reporting a miss here
        # would turn our own outage into a claim about the market.
        logger.error("Apollo enrich transport failure match_key=%s: %s", match_key, exc)
        raise ApolloUnavailableError(
            0, DegradeReason.NETWORK_ERROR, str(exc), context=f"enrich {match_key}"
        ) from exc


async def bulk_enrich_people(
    apollo_ids: list[str],
    http_client: httpx.AsyncClient | None = None,
) -> dict[str, ApolloEnrichmentResult]:
    """LOT (15/10) DATA-A point 8 — People-Match par LOTS de 10 identifiants Apollo (``people/bulk_match``).

    Même crédit par personne que ``enrich_person``, mais 10× moins d'appels. Le cache par personne
    (``apollo:enrich:*``, le même que ``enrich_person``) est lu AVANT : une personne déjà payée ce mois-ci
    ne repart pas dans un lot. Ne rend QUE les personnes appariées (un ``null`` d'Apollo est absent du
    résultat — jamais un faux vide). Lève comme ``enrich_person`` : ``ApolloPlanError`` (plan sans accès),
    ``ApolloUnavailableError`` (429/5xx/réseau) — l'appelant décide, rien n'est caché sur un échec.
    """
    ids = list(dict.fromkeys(i.strip() for i in apollo_ids if i and i.strip()))
    out: dict[str, ApolloEnrichmentResult] = {}
    if not ids:
        return out

    r = await _enrich_cache_redis()
    todo: list[str] = []
    for apollo_id in ids:
        key = _enrich_cache_key(None, None, None, None, apollo_id)
        if r is not None and key:
            try:
                raw = await r.get(key)
                if raw:
                    provider_cache.log_call(_CONTACT_FAMILY, hit=True)
                    out[apollo_id] = ApolloEnrichmentResult.model_validate_json(raw)
                    continue
            except Exception as exc:  # noqa: BLE001 — best-effort
                logger.debug("Apollo bulk cache get failed: %s", exc)
        todo.append(apollo_id)
    if not todo:
        return out

    api_key = _get_api_key()
    client = http_client if http_client is not None else get_shared_client("apollo", timeout=HTTP_TIMEOUT_S)
    for start in range(0, len(todo), BULK_MATCH_BATCH):
        batch = todo[start : start + BULK_MATCH_BATCH]
        payload = {"details": [{"id": i} for i in batch], "reveal_personal_emails": False}
        try:
            cost_ledger.record("apollo", "bulk_match", units=len(batch))
            async with throttle("apollo"):
                res = await client.post(APOLLO_BULK_MATCH_URL, json=payload, headers=_make_headers(api_key))
        except httpx.HTTPError as exc:
            logger.error("Apollo bulk_match transport failure: %s", exc)
            raise ApolloUnavailableError(0, DegradeReason.NETWORK_ERROR, str(exc), context="bulk_match") from exc
        if not res.is_success:
            if res.status_code == 403 and _is_plan_inaccessible(res.text):
                raise ApolloPlanError("Apollo plan does not allow People-Match — upgrade or use a master API key.")
            if res.status_code == 429:
                back_off_provider("apollo", retry_after_header(res))
            logger.error("Apollo bulk_match error: status=%d body=%s", res.status_code, res.text[:300])
            raise ApolloUnavailableError(
                res.status_code, reason_for_status(res.status_code), res.text, context="bulk_match"
            )
        try:
            matches = (res.json() or {}).get("matches") or []
        except ValueError:
            logger.error("Apollo bulk_match: 200 but non-JSON body")
            matches = []
        # Réponse alignée sur `details` : on apparie par POSITION, puis par l'id que la personne porte.
        for apollo_id, person in zip(batch, matches, strict=False):
            if not person:
                continue
            result = _to_enrichment_result(person)
            if not result.matched:
                continue
            out[apollo_id] = result
            key = _enrich_cache_key(None, None, None, None, apollo_id)
            if r is not None and key:
                try:
                    await r.set(key, result.model_dump_json(), ex=_ENRICH_CACHE_TTL_S)
                except Exception as exc:  # noqa: BLE001 — best-effort
                    logger.debug("Apollo bulk cache set failed: %s", exc)
    return out


# ─── E1 (#3698) — révélation ASYNCHRONE du mobile ─────────────────────────────


async def request_phone_reveal(
    *,
    webhook_url: str,
    apollo_id: str | None = None,
    linkedin_url: str | None = None,
    first_name: str | None = None,
    last_name: str | None = None,
    organization_name: str | None = None,
    http_client: httpx.AsyncClient | None = None,
) -> RevealPhoneResponse:
    """E1 (#3698, décision Louis 07/10) — demander le MOBILE à Apollo.

    Apollo exige ``webhook_url`` dès que ``reveal_phone_number=true`` et livre
    le numéro « plusieurs minutes » plus tard sur cette URL (8 crédits Apollo
    seulement si un mobile est rendu). On ne demande PAS l'e-mail ici
    (``reveal_personal_emails=false``) : il a déjà été révélé — ou cherché — au
    premier passage, le redemander le repaierait.

    Jamais d'exception vers l'appelant : sans clé, sans URL de retour, sans
    personne trouvée ou sur panne amont, ``requested=False`` et ``reason`` le
    nomme. Le numéro lui-même ne passe JAMAIS par ce service.
    """
    if not os.environ.get("APOLLO_API_KEY"):
        return RevealPhoneResponse(requested=False, reason="unconfigured")
    if not (webhook_url or "").strip():
        return RevealPhoneResponse(requested=False, reason="unconfigured")
    try:
        payload: dict[str, Any] = dict(
            _build_enrich_payload(
                apollo_id=apollo_id,
                linkedin_url=linkedin_url,
                first_name=first_name,
                last_name=last_name,
                organization_name=organization_name,
            )
        )
    except ValueError:
        return RevealPhoneResponse(requested=False, reason="no_match_key")
    payload["reveal_personal_emails"] = False
    payload["reveal_phone_number"] = True
    payload["webhook_url"] = webhook_url

    client = http_client if http_client is not None else get_shared_client("apollo", timeout=HTTP_TIMEOUT_S)
    try:
        cost_ledger.record("apollo", "phone_reveal_request", units=1)
        async with throttle("apollo"):
            res = await client.post(APOLLO_ENRICH_URL, json=payload, headers=_make_headers(_get_api_key()))
    except httpx.HTTPError as exc:
        logger.error("Apollo phone reveal transport failure: %s", exc)
        return RevealPhoneResponse(requested=False, reason="upstream_error")
    if not res.is_success:
        if res.status_code == 429:
            back_off_provider("apollo", retry_after_header(res))
        logger.error("Apollo phone reveal error status=%d body=%s", res.status_code, res.text[:300])
        return RevealPhoneResponse(requested=False, reason="upstream_error")
    try:
        body = res.json()
    except ValueError:
        return RevealPhoneResponse(requested=False, reason="upstream_error")
    person = body.get("person") if isinstance(body, dict) else None
    if not person:
        return RevealPhoneResponse(requested=False, matched=False, reason="no_match")
    linkedin = person.get("linkedin_url") if isinstance(person, dict) else None
    logger.info("Apollo phone reveal requested (webhook pending)")
    return RevealPhoneResponse(
        requested=True,
        matched=True,
        linkedin_url=linkedin if isinstance(linkedin, str) and linkedin.strip() else None,
    )


# ─── Enrichment with People-Search fallback (fixes « identité incomplète ») ───


def _pick_search_candidate(
    hits: list[ApolloSearchHit], first_name: str | None
) -> ApolloSearchHit | None:
    """Best REAL, fully-named person from a role search.

    Prefer a hit whose first name matches the contact's first name — resolves the
    « prénom-seul d'une vraie personne » case (Olgierd → Olgierd Nowak). Otherwise
    the top-relevance hit — resolves the role-persona placeholder case (« Isabelle
    · Global Head of Procurement »: the fake first name is overwritten by the real
    person). Accepts a hit that is either fully-named OR carries an Apollo ``id``:
    on the search tier the last name is obfuscated ("") but the id lets the reveal
    unlock the real full record. ``_resolve_by_search`` still returns None when no
    real last name is ultimately obtained, so a placeholder is never surfaced.
    """
    named = [
        h
        for h in hits
        if ((h.first_name or "").strip() and (h.last_name or "").strip())
        or (h.id or "").strip()
    ]
    if not named:
        return None
    fn = (first_name or "").strip().lower()
    if fn:
        for h in named:
            if (h.first_name or "").strip().lower() == fn:
                return h
    return named[0]


async def _resolve_by_search(
    *,
    organization_name: str,
    title: str,
    first_name: str | None,
    organization_id: str | None = None,
    organization_domain: str | None = None,
    http_client: httpx.AsyncClient | None = None,
) -> ApolloEnrichmentResult | None:
    """People-Search ``org (id → domain → name) + title`` → the real named person
    in that role, then People-Match on the RESOLVED identity to reveal email/phone.

    Scoping the search by the ACCOUNT's Apollo org id / domain (not the messy
    entity label) is the P0 unblock: it makes the role search actually return the
    real person (retour Théo — « Directeur des Sports Groupe TF1 »…).

    The (possibly invented) placeholder ``first_name`` is NEVER used as a search
    filter — only, at most, to rank candidates. Returns ``None`` when the search
    surfaces no real, fully-named person (so the caller stays honest — no invented
    data). Identity resolution alone is a success (``matched=True``): completing
    the real name unblocks the contact even when the email reveal comes up empty.
    """
    hits = await search_people(
        company_name=organization_name,
        person_titles=[title],
        # Top page is plenty — we only need the best candidate for this role.
        max_pages=1,
        http_client=http_client,
        organization_ids=[organization_id] if organization_id else None,
        organization_domains=[organization_domain] if organization_domain else None,
    )
    candidate = _pick_search_candidate(hits, first_name)
    if candidate is None:
        return None

    # Reveal email/phone on the resolved identity. Prefer LinkedIn (most reliable
    # key), else the real first+last+org. People-Match is plan-gated — if it is
    # blocked we still return the resolved name (search is free), never fail.
    reveal = _empty_result()
    try:
        if candidate.id:
            # The search hit's Apollo id is the strongest reveal key — it unlocks
            # the obfuscated record (real last name + email + LinkedIn) that a
            # name+org match on a first-name-only search-tier hit can NEVER reveal
            # (the exact QONTO case: "Julien" → "Julien Datour" + verified email).
            reveal = await enrich_person(apollo_id=candidate.id, http_client=http_client)
        elif candidate.linkedin_url:
            reveal = await enrich_person(
                linkedin_url=candidate.linkedin_url, http_client=http_client
            )
        elif candidate.last_name and organization_name:
            # Name+org People-Match needs an org NAME (id/domain aren't match keys
            # here). When we only scoped by id/domain, skip the reveal rather than
            # raise — the resolved identity is already a success.
            reveal = await enrich_person(
                first_name=candidate.first_name,
                last_name=candidate.last_name,
                organization_name=organization_name,
                http_client=http_client,
            )
    except ApolloPlanError:
        reveal = _empty_result()

    # Stay honest (no invented data): only surface a resolved contact when we
    # actually hold a real last name — from the search hit, or unlocked by the id
    # reveal. An id-only hit whose reveal was plan-blocked / empty must NOT surface
    # as a real named person.
    if not (reveal.last_name or candidate.last_name or "").strip():
        return None

    return ApolloEnrichmentResult(
        matched=True,
        # Prefer the id-unlocked identity: the search candidate's last name is
        # obfuscated ("") on this tier, the reveal carries the real one.
        first_name=reveal.first_name or candidate.first_name or None,
        last_name=reveal.last_name or candidate.last_name or None,
        email=reveal.email,
        email_status=reveal.email_status,
        phone=reveal.phone,
        linkedin_url=reveal.linkedin_url or candidate.linkedin_url or None,
        title=reveal.title or candidate.title or None,
        organization_name=reveal.organization_name
        or candidate.organization_name
        or organization_name,
        city=reveal.city or candidate.city or None,
        country=reveal.country or candidate.country or None,
        photo_url=reveal.photo_url or candidate.photo_url or None,
        # Rich profile — the People-Match reveal first (deepest, with dates),
        # falling back to the free People-Search hit fields when the match was
        # plan-blocked / empty. Never invented: only what a source returned.
        headline=reveal.headline or _str(candidate.headline),
        seniority=reveal.seniority or _str(candidate.seniority),
        state=reveal.state,
        twitter_url=reveal.twitter_url,
        github_url=reveal.github_url,
        facebook_url=reveal.facebook_url,
        departments=reveal.departments or _str_list(candidate.departments),
        subdepartments=reveal.subdepartments,
        functions=reveal.functions or _str_list(candidate.functions),
        employment_history=reveal.employment_history or _search_hit_employment(candidate),
        education=reveal.education,
        personal_emails=reveal.personal_emails,
        phone_numbers=reveal.phone_numbers,
    )


def _merge_present_only(
    base: ApolloEnrichmentResult, extra: ApolloEnrichmentResult
) -> ApolloEnrichmentResult:
    """Fill the gaps in ``base`` with ``extra`` (a second-source enrichment) —
    present-only, NEVER overwriting a value the primary source already resolved.
    ``matched`` becomes true if either source matched."""
    merged = base.model_copy(deep=True)
    merged.matched = base.matched or extra.matched
    for field in (
        "first_name",
        "last_name",
        "email",
        "email_status",
        "phone",
        "linkedin_url",
        "title",
        "organization_name",
        "city",
        "country",
        "photo_url",
        "headline",
        "seniority",
    ):
        if not getattr(merged, field) and getattr(extra, field):
            setattr(merged, field, getattr(extra, field))
    # Additive lists — union, dedup, present-only.
    if not merged.personal_emails and extra.personal_emails:
        merged.personal_emails = extra.personal_emails
    if not merged.phone_numbers and extra.phone_numbers:
        merged.phone_numbers = extra.phone_numbers
    return merged


# Noise tokens stripped when broadening a sub-entity org name to its parent brand.
_ORG_NOISE_PREFIXES = ("studio ", "groupe ", "group ", "les ", "la ", "le ")
_ORG_NOISE_SUFFIXES = (" pub", " group", " groupe", " sa", " sas", " france", " media", " médias")


def _broaden_org_names(org: str) -> list[str]:
    """Broader org-name candidates for a role search when the precise account org
    found nobody. A contact often sits at the PARENT group while the analysed
    account is a sub-entity — "Studio TF1" has 0 Apollo people, but the CTO is at
    "Groupe TF1". Most-specific broadening first; the original + duplicates +
    empties are dropped. Deliberately conservative (drop a trailing parenthetical,
    a known prefix/suffix, then the leading brand token) so we never widen to an
    unrelated company; the caller still runs each through the honesty guard
    (``_resolve_by_search`` returns None unless a real named person resolves)."""
    base = " ".join((org or "").split()).strip()
    out: list[str] = []

    def add(cand: str) -> None:
        c = " ".join((cand or "").split()).strip()
        if c and c.lower() != base.lower() and c not in out and len(c) >= 2:
            out.append(c)

    # 1. Drop a trailing parenthetical: "TF1 … (ou Studio TF1 groupe)" → "TF1 …".
    no_paren = re.sub(r"\s*\([^)]*\)\s*$", "", base).strip()
    add(no_paren)
    low = no_paren.lower()
    # 2. Drop a known noise prefix: "Studio TF1" → "TF1", "Groupe TF1" → "TF1".
    for p in _ORG_NOISE_PREFIXES:
        if low.startswith(p):
            add(no_paren[len(p) :])
    # 3. Drop a known noise suffix: "TF1 PUB" → "TF1".
    for s in _ORG_NOISE_SUFFIXES:
        if low.endswith(s):
            add(no_paren[: len(no_paren) - len(s)])
    # 4. Last resort — the leading brand token (a short distinctive acronym/name),
    #    unless it is itself a noise word.
    tokens = no_paren.split()
    if tokens and tokens[0].lower() not in ("studio", "groupe", "group", "les", "la", "le"):
        add(tokens[0])
    # Borné : les variantes les plus spécifiques d'abord, donc tronquer par la fin
    # ne coupe que les élargissements les plus lointains (les moins susceptibles
    # de matcher, et les plus susceptibles de viser une autre société).
    return out[:_BROADEN_MAX]


async def enrich_person_with_fallback(
    *,
    apollo_id: str | None = None,
    first_name: str | None = None,
    last_name: str | None = None,
    organization_name: str | None = None,
    organization_id: str | None = None,
    organization_domain: str | None = None,
    linkedin_url: str | None = None,
    title: str | None = None,
    http_client: httpx.AsyncClient | None = None,
    budget_s: float | None = None,
) -> ApolloEnrichmentResult:
    """Point d'entrée de la cascade — propriétaire du POOL HTTP et du BUDGET.

    Un seul ``AsyncClient`` sert TOUS les legs (People-Match, People-Search, les
    reveals, l'élargissement d'org, SalesQL). Avant, chaque leg tombait sur
    ``http_client is None`` et ouvrait le sien : une dizaine de connexions +
    handshakes TLS neufs pour un enrichissement, sur une cascade déjà
    séquentielle. Un client fourni par l'appelant est réutilisé tel quel et
    JAMAIS fermé ici (il ne nous appartient pas).

    Voir :func:`_enrich_cascade` pour la logique de résolution.
    """
    client = http_client
    owns_client = client is None
    if client is None:
        client = httpx.AsyncClient(timeout=HTTP_TIMEOUT_S)
    try:
        return await _enrich_cascade(
            apollo_id=apollo_id,
            first_name=first_name,
            last_name=last_name,
            organization_name=organization_name,
            organization_id=organization_id,
            organization_domain=organization_domain,
            linkedin_url=linkedin_url,
            title=title,
            http_client=client,
            budget_s=budget_s if budget_s is not None else _enrich_budget_s(),
        )
    finally:
        if owns_client:
            await client.aclose()


async def _enrich_cascade(
    *,
    apollo_id: str | None,
    first_name: str | None,
    last_name: str | None,
    organization_name: str | None,
    organization_id: str | None,
    organization_domain: str | None,
    linkedin_url: str | None,
    title: str | None,
    http_client: httpx.AsyncClient,
    budget_s: float,
) -> ApolloEnrichmentResult:
    """Resolve + enrich one contact via a multi-source cascade, robust to an
    INCOMPLETE identity. Objective (retour Théo P0): each contact ends up with a
    full name + role + LinkedIn + ≥1 email whenever the person is identifiable —
    present-only, JAMAIS inventé.

    1. Apollo People-Match — only when we hold a strong key (a LinkedIn URL, or a
       full ``last_name`` + an org anchor). Returns immediately on a full hit.
    2. Apollo People-Search fallback — when the identity is incomplete (role-persona
       placeholder / first-name-only) OR the match missed: search
       ``org (id → domain → name) + title`` for the real person, then re-match on
       that resolved identity. Scoping by the ACCOUNT's Apollo org id / domain is
       the unblock — the messy entity label is never the sole scope.
    3. SalesQL — when Apollo left us without an email, without a PHONE, or
       without the person at all: a second source (env-gated on
       ``SALESQL_API_KEY``; no key = no-op, zero network) resolves email/phone
       from the resolved LinkedIn URL, else from name + org anchor. Merged
       present-only. Apollo's own reveal never includes the phone (see
       ``_build_enrich_payload`` below — the webhook flow is out of scope), so
       gating this leg on the email alone (#3022) meant SalesQL almost never
       ran: Apollo resolves an email on most hits, and that alone used to
       close the door on the ONE leg of this cascade that can actually fill
       the phone.

    ``organization_id`` (Apollo id) and ``organization_domain`` (registrable
    domain) are the clean org anchors; ``organization_name`` should be the
    account's CANONICAL name, not a contact entity sub-label. A fuzzy
    ``first_name``-only match is deliberately never attempted for an incomplete
    identity — a placeholder first name would risk matching the WRONG person.
    Never invents data: nothing resolvable ⇒ ``matched=False``.

    ``budget_s`` borne le temps total. Les legs 2, 2b et 3 sont OPTIONNELS : hors
    budget ils sont sautés et ``truncated=True`` est posé sur le résultat. Le leg
    1 tourne toujours (un clic doit au moins tenter quelque chose). ``truncated``
    n'est posé que pour un leg réellement sauté POUR CETTE RAISON — un match
    immédiat, ou un leg sauté faute de clé de recherche, n'est pas une troncature.
    """
    started = _monotonic()
    truncated = False

    def out_of_budget() -> bool:
        return (_monotonic() - started) >= budget_s

    org = (organization_name or "").strip()
    org_id = (organization_id or "").strip()
    org_domain = (organization_domain or "").strip()
    has_org_anchor = bool(org or org_id or org_domain)
    search_title = (title or "").strip()
    has_last_name = bool((last_name or "").strip())

    result: ApolloEnrichmentResult = _empty_result()
    apollo_hits = 0
    # A source that FAILED is remembered, not swallowed. It decides the ending:
    # nothing resolved + a failure recorded ⇒ we raise (outage), whereas nothing
    # resolved + no failure ⇒ we return empty (genuine absence). Letting an
    # Apollo exception escape here used to abort the whole cascade before SalesQL
    # ever ran — the documented Apollo → SalesQL → Dropcontact chain only exists
    # if a broken first leg is survivable.
    apollo_failure: ApolloError | None = None

    # ── Path 1 — reliable Apollo People-Match on a strong identity key. ─────────
    # apollo_id is the strongest key: it unlocks an obfuscated search-tier hit
    # (real last name + email) that name+org can't. linkedin / last_name+org next.
    if apollo_id or linkedin_url or (has_last_name and org):
        try:
            match = await enrich_person(
                apollo_id=apollo_id,
                linkedin_url=linkedin_url,
                first_name=first_name,
                last_name=last_name,
                organization_name=organization_name,
                http_client=http_client,
            )
        except (ApolloUnavailableError, ApolloPlanError) as exc:
            logger.warning("Apollo People-Match unavailable (%s) — trying the rest of the cascade", exc)
            apollo_failure = exc
        else:
            if match.matched:
                result = match
                apollo_hits = 1

    # ── Path 2 — role-based Apollo People-Search (needs org anchor + title). ────
    if not result.matched and apollo_failure is None and has_org_anchor and search_title and out_of_budget():
        truncated = True
        logger.warning(
            "enrich cascade out of budget (%.0fs) before People-Search — org=%r title=%r",
            budget_s,
            org or "-",
            search_title or "-",
        )
    elif not result.matched and apollo_failure is None and has_org_anchor and search_title:
        try:
            resolved = await _resolve_by_search(
                organization_name=org,
                title=search_title,
                first_name=first_name,
                organization_id=org_id or None,
                organization_domain=org_domain or None,
                http_client=http_client,
            )
        except (ApolloUnavailableError, ApolloPlanError) as exc:
            logger.warning("Apollo People-Search unavailable (%s) — trying the rest of the cascade", exc)
            apollo_failure = exc
        else:
            if resolved is not None:
                result = resolved
                apollo_hits = 1

    # ── Path 2b — broaden the org when the precise anchor found NOBODY. A contact
    # can sit at the PARENT group while the analysed account is a sub-entity
    # ("Studio TF1" has 0 Apollo people; the CTO is at "Groupe TF1"). Retry the
    # role search on each broadened org NAME (name-only — a broader org has a
    # different id/domain). Honesty guard unchanged: ``_resolve_by_search`` returns
    # None unless a real named person resolves, so this never invents a contact.
    if not result.matched and apollo_failure is None and search_title and org:
        for broadened in _broaden_org_names(org):
            if out_of_budget():
                truncated = True
                logger.warning(
                    "enrich cascade out of budget (%.0fs) before broadening to %r", budget_s, broadened
                )
                break
            try:
                resolved = await _resolve_by_search(
                    organization_name=broadened,
                    title=search_title,
                    first_name=first_name,
                    http_client=http_client,
                )
            except (ApolloUnavailableError, ApolloPlanError) as exc:
                logger.warning("Apollo org broadening unavailable (%s) — stopping the Apollo leg", exc)
                apollo_failure = exc
                break
            if resolved is not None:
                result = resolved
                apollo_hits = 1
                break

    # ── Path 3 — SalesQL second source (env-gated; fills email/phone/identity
    # gaps). ─────────────────────────────────────────────────────────────────
    # Trigger when Apollo left us without an email, without a PHONE, or
    # without the person at all. #3022 (retour bêta) : le reveal Apollo
    # n'inclut JAMAIS le téléphone (`_build_enrich_payload` ci-dessus), donc
    # avant ce correctif la condition ne testait que l'email — et Apollo
    # résout un email sur la quasi-totalité de ses hits. Résultat mesuré :
    # SalesQL, seul membre de la cascade à pouvoir compléter le téléphone,
    # ne tournait presque jamais. `not result.phone` fait tourner ce leg tant
    # que le téléphone manque, même quand l'email est déjà là.
    salesql_tried = False
    if salesql_is_enabled() and (not result.matched or not result.email or not result.phone):
        li = (result.linkedin_url or linkedin_url or "").strip() or None
        sql_first = (result.first_name or first_name or "").strip() or None
        sql_last = (result.last_name or last_name or "").strip() or None
        # Query SalesQL only with a reliable key: a LinkedIn URL, or a real
        # first+last (Apollo-resolved or caller-supplied) + an org anchor.
        if (li or (sql_first and sql_last and (org or org_domain))) and out_of_budget():
            truncated = True
            logger.warning("enrich cascade out of budget (%.0fs) before SalesQL", budget_s)
        elif li or (sql_first and sql_last and (org or org_domain)):
            salesql_tried = True
            sql = await salesql_enrich_person(
                linkedin_url=li,
                first_name=sql_first,
                last_name=sql_last,
                organization_name=org or None,
                organization_domain=org_domain or None,
                http_client=http_client,
            )
            if sql.matched:
                result = _merge_present_only(result, sql)

    if not result.matched and apollo_failure is not None:
        # Nothing resolved AND a source was down: we do not know whether this
        # person exists. Returning ``matched=False`` here would render our own
        # outage as a fact about the market — the exact lie #638 forbids. The
        # typed failure propagates so the endpoint can say « fournisseur
        # indisponible » instead of « aucune personne trouvée ».
        logger.error(
            "enrich cascade exhausted with a failed source — reporting the outage, not an absence: %s",
            apollo_failure,
        )
        raise apollo_failure

    if truncated:
        # Le consommateur DOIT pouvoir distinguer « on a cherché partout, cette
        # personne n'est pas joignable » de « on s'est arrêté avant la fin ». Sans
        # ce drapeau, l'API écrivait la seconde comme la première et armait un
        # cooldown de 30 jours (ENRICHMENT_RETRY_COOLDOWN_DAYS) sur un contact
        # qu'on n'avait jamais fini de chercher.
        result = result.model_copy(update={"truncated": True})

    if not result.matched:
        # Structured coverage-gap log — surfaces the REAL holes (which org anchor
        # was tried, the title, Apollo hit count, whether SalesQL ran) so we can
        # see where FR coverage falls short. No PII, no invented data.
        logger.info(
            "enrich coverage gap: org_id=%s org_domain=%s org_name=%r title=%r "
            "linkedin=%s apollo_hits=%d salesql_enabled=%s salesql_tried=%s truncated=%s",
            bool(org_id),
            org_domain or "-",
            org or "-",
            search_title or "-",
            bool(linkedin_url),
            apollo_hits,
            salesql_is_enabled(),
            salesql_tried,
            truncated,
        )

    return result
