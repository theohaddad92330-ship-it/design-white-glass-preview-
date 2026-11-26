"""Source-agnostic French-registry discovery filters (Découvrir v2).

The « Découvrir » screen builds a LIST from the registry — « NAF 62.02 ×
département 69 × effectif 250-499 × créée après 2015 » — before any LLM sees a
company name (agent_docs/discover-v2-contract.md: *le registre produit la liste*).

Two registries answer that question and they speak different dialects:

* Pappers ``/v2/recherche`` — French wire names, ``JJ-MM-AAAA`` dates, needs a token;
* ``recherche-entreprises.api.gouv.fr`` — its own names, no date filter, NO key.

This module is the single validated, English-named filter surface both of them
map FROM, so a caller expresses its criteria once. It holds **no I/O and no
provider import** — each source owns its own serialization — which is why it
lives beside the sources rather than inside either package.

It also owns the vocabulary shared by every registry source: the INSEE headcount
tranches, the department derivation, and the machine-readable degradation
reasons that feed ``DiscoverResponse.degraded`` (« source HS = dit, jamais
masqué »).
"""

from __future__ import annotations

import re
from datetime import date
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

# ── Degradation vocabulary ───────────────────────────────────────────────────


class DegradeReason:
    """Machine-readable ``degraded[].reason`` values.

    Stable identifiers — the UI maps them to a localized sentence, so they must
    never become free text. A source is expected to append at most one per run.
    """

    MISSING_API_KEY = "missing_api_key"  # keyless-unavailable (no token configured)
    UNAUTHORIZED = "unauthorized"  # token present but rejected
    QUOTA_EXCEEDED = "quota_exceeded"  # plan/credits exhausted
    RATE_LIMITED = "rate_limited"  # HTTP 429 / local limiter deadline
    UPSTREAM_ERROR = "upstream_error"  # 5xx or any other non-success status
    # #4518 — a 4xx the source answers to OUR request (400 invalid parameter…): the fault is ours, the source is up
    # and retrying changes nothing. « La source a renvoyé une erreur » would accuse a third party.
    REQUEST_REJECTED = "request_rejected"
    NETWORK_ERROR = "network_error"  # transport failure / timeout
    # #2521 — the caller STOPPED WAITING at its own time budget. Not an outage:
    # « injoignable » would claim one. The rest of the result is still true.
    TIME_BUDGET = "time_budget"
    INVALID_RESPONSE = "invalid_response"  # unparseable payload
    EMPTY_QUERY = "empty_query"  # no criterion at all — nothing to list
    UNSUPPORTED_FILTERS = "unsupported_filters"  # results broader than requested


#: A source answered « rien ne correspond ». Not a :class:`DegradeReason` — it
#: is emitted by the router (waterfall level), not by a source.
NO_MATCH_REASON = "no_match"

# #2469 — Router-level reasons for the SIREN RESOLUTION step. Same nature as
# ``NO_MATCH_REASON``: emitted by `/discover/signals`, not by a source, and for
# the same reason as every identifier above — *the UI maps them to a localized
# sentence, so they must never become free text*.
#
# They used to be four French sentences built with f-strings right where they
# were appended, « (s) » included, and a beta user read one of them on screen:
# « 1 entreprise(s) non vérifiée(s) … écartée(s) ». Untranslatable, unpluralizable,
# and duplicated with the block that framed it. The sentences now live in
# ``apps/web/src/i18n/locales/{fr,en}/discover.json`` — one per language, with
# real ``_one`` / ``_other`` plurals — and what travels on the wire is this key
# plus ``count``.
#
# ⚠️ ``SIREN_NOT_EXAMINED_REASON`` keeps its own identifier ON PURPOSE: neither
# « écartée » nor « homonymie ». Those companies were never looked at, so filing
# them with the rejects would display a verdict that was never reached (#649).
SIREN_AMBIGUOUS_REASON = "siren_ambiguous"  # examined, then rejected: several entities share the name
SIREN_UNREACHABLE_REASON = "siren_unreachable"  # examined, registry silent — an outage, not a data problem
SIREN_NOT_EXAMINED_REASON = "siren_not_examined"  # never looked at: no verdict of any kind
#: A screen sector label with no entry in the table: NOT applied, and said so.
#: A genuine fault (no ``kind``) — the user asked for a narrowing they did not get.
UNKNOWN_SECTOR_REASON = "unknown_sector"

#: ``degraded[].kind`` — the NATURE of an entry, so the UI can frame it without
#: parsing a French sentence (same device as ``kind: 'not-examined'``, #649).
KIND_CAPABILITY = "capability"  # the source answered; it just could not express a criterion
KIND_NO_MATCH = "no-match"  # the source answered; zero rows matched
KIND_AMBIGUOUS = "ambiguous"  # a verdict rendered ON THE DATA, not an outage
KIND_UNREACHABLE = "unreachable"  # a verdict on OUR infra — the registry said nothing
KIND_NOT_EXAMINED = "not-examined"  # a coverage bound — nothing was judged at all

#: Reasons that describe a **capability limit of a working source**, never an
#: outage. ``unsupported_filters`` is the whole set today, and its own docstring
#: says why: *results broader than requested*. The source replied, it simply
#: could not phrase one criterion, so it returned a SUPERSET — which is the
#: opposite of an incomplete list.
#:
#: Deliberately NOT here:
#:
#: * ``empty_query`` — the source is fine, but nothing was searched at all. That
#:   is neither an outage nor a widening, and staying quiet about it would leave
#:   an empty screen unexplained. Under-warning costs more than over-warning, so
#:   it keeps the loud path (with a sentence of its own).
#: * ``missing_api_key`` — the source was never consulted; rows really are
#:   missing.
CAPABILITY_REASONS = frozenset({DegradeReason.UNSUPPORTED_FILTERS})

#: The SIREN-resolution reasons and the nature each one carries. ``unknown_sector``
#: is deliberately absent: it IS a fault (the user's narrowing never happened).
_RESOLUTION_KINDS: dict[str, str] = {
    SIREN_AMBIGUOUS_REASON: KIND_AMBIGUOUS,
    SIREN_UNREACHABLE_REASON: KIND_UNREACHABLE,
    SIREN_NOT_EXAMINED_REASON: KIND_NOT_EXAMINED,
}


def degrade_kind(reason: str) -> str | None:
    """``kind`` for a reason, or ``None`` when it is a genuine fault.

    ``None`` is the FAIL-LOUD default: an unknown or future reason is treated as
    an outage, so a source that breaks in a way nobody anticipated still shouts.
    """
    if reason in CAPABILITY_REASONS:
        return KIND_CAPABILITY
    if reason == NO_MATCH_REASON:
        return KIND_NO_MATCH
    # #2469 — la paire raison ↔ nature vit ICI, à un seul endroit : deux tables
    # qui la referaient divergeraient au premier ajout, et c'est sur `kind` que
    # l'écran décide du bandeau (`splitDegraded`).
    if reason in _RESOLUTION_KINDS:
        return _RESOLUTION_KINDS[reason]
    return None


def degraded_entry(source: str, reason: str, *, fields: list[str] | None = None) -> dict[str, Any]:
    """One ``DiscoverResponse.degraded`` entry.

    A fault stays EXACTLY ``{source, reason}`` — byte-identical to what every
    caller emitted before, and the absence of ``kind`` is itself the signal
    « this one is broken ». Only a capability limit or a no-match gains the
    extra framing:

    * ``kind`` — the nature of the entry (:data:`KIND_CAPABILITY` / :data:`KIND_NO_MATCH`);
    * ``fields`` — WHICH criteria the source could not express, when it knows.
      Omitted rather than guessed: not knowing is acceptable, inventing is not.

    ``fields`` is ignored for a fault: it means « what I could not phrase », and
    a source that never answered phrased nothing at all.
    """
    entry: dict[str, Any] = {"source": source, "reason": reason}
    kind = degrade_kind(reason)
    if kind is None:
        return entry
    entry["kind"] = kind
    if fields:
        entry["fields"] = list(fields)
    return entry


# Statuses whose cause is unambiguous across providers. 401 is the notable
# exception and is NOT here: several providers (Pappers among them) return it for
# an exhausted quota as well as for a bad token, and only the response body can
# tell those apart. A provider that knows better classifies it itself
# (``classify_pappers_failure``); everyone else says ``unauthorized``, which is
# what the status alone actually supports.
_STATUS_REASONS: dict[int, str] = {
    401: DegradeReason.UNAUTHORIZED,
    402: DegradeReason.QUOTA_EXCEEDED,
    403: DegradeReason.UNAUTHORIZED,
    429: DegradeReason.RATE_LIMITED,
}


def reason_for_status(status: int) -> str:
    """Machine-readable :class:`DegradeReason` for a non-2xx HTTP status.

    Shared so every source classifies the same way and the source-health rollup
    can group across providers. Anything unmapped is ``upstream_error`` — we know
    the call failed, not why, and naming a precise cause we cannot prove would be
    worse than admitting the vagueness.
    """
    return _STATUS_REASONS.get(status, DegradeReason.UPSTREAM_ERROR)


def reason_for_exception(exc: BaseException) -> str:
    """#2469 — machine reason for a failed source call, WITHOUT guessing.

    The listing sources used to hand the router ``f"source injoignable ({exc})"``:
    a French sentence with a library traceback inside it, rendered as-is on a
    salesperson's screen. Two facts are actually available here, and only two:
    the HTTP status when the failure carries a response, and otherwise the mere
    fact that the call did not get through — which is exactly what
    ``network_error`` (« injoignable ») says, and all the old sentence said too.
    The exception detail stays where it belongs: in the log, next to the call.

    #2521 (suite) — ``RateLimitTimeout`` is a THIRD fact, and confusing it with
    ``network_error`` is exactly the anti-pattern this function exists to avoid:
    the registry never answered anything here, WE stopped waiting for it, at
    OUR OWN time budget (``wait_deadline``). « Injoignable » would claim an
    outage that didn't happen. Import kept local: ``distributed_rate_limiter``
    has zero app-internal imports, so no cycle, but this module otherwise holds
    no provider/I-O import (module docstring) and this is the one exception.
    """
    from app.services.distributed_rate_limiter import RateLimitTimeout

    if isinstance(exc, RateLimitTimeout):
        return DegradeReason.TIME_BUDGET
    status = getattr(getattr(exc, "response", None), "status_code", None)
    if isinstance(status, int):
        return reason_for_status(status)
    return DegradeReason.NETWORK_ERROR


# ── INSEE headcount tranches (``tranche_effectif_salarie``) ──────────────────

# Official nomenclature — codes are ordinal, so a min/max pair defines a range.
# "NN" (non renseigné) is deliberately absent: no headcount = no label, never a
# guessed one.
HEADCOUNT_TRANCHE_LABELS: dict[str, str] = {
    "00": "0 salarié",
    "01": "1 à 2 salariés",
    "02": "3 à 5 salariés",
    "03": "6 à 9 salariés",
    "11": "10 à 19 salariés",
    "12": "20 à 49 salariés",
    "21": "50 à 99 salariés",
    "22": "100 à 199 salariés",
    "31": "200 à 249 salariés",
    "32": "250 à 499 salariés",
    "41": "500 à 999 salariés",
    "42": "1 000 à 1 999 salariés",
    "51": "2 000 à 4 999 salariés",
    "52": "5 000 à 9 999 salariés",
    "53": "10 000 salariés et plus",
}

# Ascending order — the ordering used by ``tranche_codes_between``.
HEADCOUNT_TRANCHE_ORDER: list[str] = list(HEADCOUNT_TRANCHE_LABELS)


# #4436.3 — « 00 » = aucun effectif au 31/12, pas « zéro mesuré » : un grand groupe
# (SONACA) y figure souvent. Le code reste valide pour FILTRER, mais n'a pas de
# libellé affichable — la carte écrit « taille non publiée », jamais « 0 salarié ».
_UNDISPLAYABLE_TRANCHES = frozenset({"00"})


#: Les registres écrivent « 1900-01-01 » (ou 01/01/1900) quand la date d'immatriculation est INCONNUE : ce n'est pas
#: une date de création, c'est l'absence d'une date. Toute année ≤ 1901 est écartée.
_SENTINEL_LAST_YEAR = 1901
_YEAR_ISO = re.compile(r"^\s*(\d{4})-\d{2}")
_YEAR_FR = re.compile(r"^\s*\d{2}/\d{2}/(\d{4})")


def plausible_creation_date(raw: object) -> str | None:
    """#5 (recette 23/10) — la date de création telle que la source la donne, ou ``None`` si sentinelle / illisible.

    On n'affiche pas ce qu'on n'a pas : jamais « 1 janv. 1900 ». La valeur gardée n'est pas réécrite.
    """
    text = str(raw or "").strip()
    match = _YEAR_ISO.match(text) or _YEAR_FR.match(text)
    if match is None or int(match.group(1)) <= _SENTINEL_LAST_YEAR:
        return None
    return text


def headcount_label(code: str | None) -> str | None:
    """Human range for an INSEE tranche code, or ``None`` when unknown/absent/« 00 »."""
    if not code:
        return None
    key = str(code).strip()
    if key in _UNDISPLAYABLE_TRANCHES:
        return None
    return HEADCOUNT_TRANCHE_LABELS.get(key)


# #4436.3 — RÉFUTÉ en prod le 23/10 : SANS département, la recherche secteur nationale rendait encore
# « 0 salarié » (SONACA, Aérostats, HEMERA). Ces libellés arrivaient DÉJÀ écrits par la source (registre
# facturé, identité INSEE, appoint par compétence) ou en code brut : `headcount_label` n'y passait jamais.
_ZERO_HEADCOUNT_RE = re.compile(r"^\D*0\D*(?:\b(?:à|a|et)\b\D*0\D*)?$", re.IGNORECASE)
_NO_EMPLOYEE_LABEL_RE = re.compile(r"\b(?:pas\s+de|aucun|sans)\s+salari|non\s+employeu", re.IGNORECASE)


def displayable_headcount(label: str | None) -> str | None:
    """#4436.3 — l'effectif qu'une CARTE peut écrire, quelle que soit la source.

    Un code INSEE brut devient son libellé (`headcount_label`, qui tait « 00 ») ; un libellé nul
    (« 0 salarié », « 0 à 0 salariés », « Pas de salarié ») ou « NN » devient ``None`` — la carte
    écrit « taille non publiée », jamais « 0 salarié » (GA-18/19). Le compte, lui, reste.
    """
    text = str(label or "").strip()
    if not text:
        return None
    if re.fullmatch(r"[0-9N]{2}", text, flags=re.IGNORECASE):
        return headcount_label(text.upper())
    if _ZERO_HEADCOUNT_RE.match(text) or _NO_EMPLOYEE_LABEL_RE.search(text):
        return None
    return text


_OPEN_TRANCHE_RE = re.compile(r"(?:\bet\s+plus\b|\bplus\s+de\b|\+)", re.IGNORECASE)


def open_tranche_floor(label: str | None) -> int | None:
    """#3434 — plancher PUBLIÉ d'une tranche OUVERTE (« 10 000 salariés et plus »).

    Une tranche fermée (« 100 à 199 salariés ») ne rend rien ici : son plancher
    est déjà porté par `effectif_min`. Libellé absent ou illisible → ``None``,
    jamais un effectif deviné.
    """
    if not label or not _OPEN_TRANCHE_RE.search(label):
        return None
    first = re.search(r"\d[\d\s\u00a0\u202f]*", label)
    if not first:
        return None
    digits = re.sub(r"\D", "", first.group(0))
    return int(digits) if digits else None


_NO_EMPLOYEE_RE = re.compile(r"\b(?:aucun|sans)\s+salari", re.IGNORECASE)


def parse_headcount_label(label: str | None) -> int | None:
    """#4409.1 — plancher chiffré d'une tranche d'effectif TEXTUELLE.

    « Entre 3 et 5 salariés » → 3, « 5 000 à 9 999 salariés » → 5000,
    « 10 000 salariés et plus » → 10000, « 0 salarié » / « Aucun salarié » → 0.
    Libellé absent ou sans chiffre → ``None`` : un effectif illisible n'est
    jamais lu « 0 ». UNE seule lecture des libellés, pour tous les chemins.
    """
    if not label:
        return None
    if _NO_EMPLOYEE_RE.search(label):
        return 0
    first = re.search(r"\d[\d\s\u00a0\u202f]*", label)
    if not first:
        return None
    digits = re.sub(r"\D", "", first.group(0))
    return int(digits) if digits else None


#: Bornes numériques de chaque tranche INSEE — ``None`` = pas de plafond.
_TRANCHE_BOUNDS: list[tuple[str, int, int | None]] = [
    ("00", 0, 0),
    ("01", 1, 2),
    ("02", 3, 5),
    ("03", 6, 9),
    ("11", 10, 19),
    ("12", 20, 49),
    ("21", 50, 99),
    ("22", 100, 199),
    ("31", 200, 249),
    ("32", 250, 499),
    ("41", 500, 999),
    ("42", 1000, 1999),
    ("51", 2000, 4999),
    ("52", 5000, 9999),
    ("53", 10000, None),
]


def tranche_code_for_headcount(value: int | None) -> str | None:
    """Tranche INSEE contenant un effectif exprimé en NOMBRE de salariés.

    L'écran Découvrir raisonne en effectifs (« 10 à 49 »), les registres en codes
    de tranche : c'est ici que la conversion a lieu, une seule fois. Un effectif
    négatif ou absent ne produit AUCUN code — un filtre faux vaut moins que pas
    de filtre.
    """
    if value is None or value < 0:
        return None
    for code, low, high in _TRANCHE_BOUNDS:
        if value >= low and (high is None or value <= high):
            return code
    return None


def tranche_codes_between(min_code: str | None, max_code: str | None) -> list[str]:
    """Expand a tranche min/max into the explicit code list some APIs require.

    Either bound may be open. Returns ``[]`` when neither is set (= no filter).
    """
    if not min_code and not max_code:
        return []
    start = HEADCOUNT_TRANCHE_ORDER.index(min_code) if min_code else 0
    end = HEADCOUNT_TRANCHE_ORDER.index(max_code) if max_code else len(HEADCOUNT_TRANCHE_ORDER) - 1
    if start > end:
        return []
    return HEADCOUNT_TRANCHE_ORDER[start : end + 1]


def tranche_codes_union(ranges: list[tuple[str | None, str | None]]) -> list[str]:
    """#3908 — l'UNION de PLUSIEURS tranches (non contiguës), déjà expansées.

    ``tranche_codes_between`` ne porte qu'UN intervalle : l'envelopper (min du
    plus bas, max du plus haut) sur deux tranches non contiguës — « 10-49 » et
    « 250-499 » — ferait remonter aussi la tranche intermédiaire (50-249)
    jamais cochée. Chaque tranche est donc expansée SÉPARÉMENT puis unie, en
    gardant l'ordre croissant (le wire le veut stable, pas aléatoire).
    """
    seen: set[str] = set()
    union: list[str] = []
    for min_code, max_code in ranges:
        for code in tranche_codes_between(min_code, max_code):
            if code not in seen:
                seen.add(code)
                union.append(code)
    union.sort(key=HEADCOUNT_TRANCHE_ORDER.index)
    return union


# ── Geography ────────────────────────────────────────────────────────────────

_POSTAL_RE = re.compile(r"^\d{5}$")


def department_from_postal_code(postal_code: str | None) -> str | None:
    """Department code derived from a French postal code, or ``None``.

    Overseas (97x/98x) use three digits. Corsica has no 1:1 mapping — the
    standard INSEE convention applies (20000-20199 → 2A, 20200+ → 2B); it is an
    approximation on a handful of communes, never a fabricated value.
    """
    cleaned = (postal_code or "").strip()
    if not _POSTAL_RE.match(cleaned):
        return None
    if cleaned.startswith(("97", "98")):
        return cleaned[:3]
    if cleaned.startswith("20"):
        return "2A" if int(cleaned) < 20200 else "2B"
    return cleaned[:2]


# ── Job-offer employer attribution (#3901) ──────────────────────────────────
#
# Un collecteur d'offres (France Travail, APEC…) interroge son fournisseur en
# PLEIN TEXTE sur le nom de l'entreprise : « Still » remonte aussi bien les
# offres de la société industrielle STILL que celles de la MAIRIE DE STILL
# (Bas-Rhin) — même nom, deux entités sans aucun rapport. Un simple « needle in
# haystack » (le nom cherché est une sous-chaîne de l'employeur de l'offre) ne
# départage PAS ce cas : « still » est une sous-chaîne vraie de « mairie de
# still ». Ce filet repère le motif de nommage d'une administration — un
# INDICE sur le nom, jamais une classification juridique (qui exige un SIREN
# résolu, voir ``account_qualification.is_public_employer``, qui lui note déjà
# cette distinction pour l'EMPLOYEUR d'un signal `hiring`).

_PUBLIC_ADMINISTRATION_EMPLOYER_RE = re.compile(
    r"^(mairie|commune|ville|ccas|cias|pr[ée]fecture|m[ée]tropole|"
    r"communaut[ée] (?:de communes|d['’]agglom[ée]ration|urbaine)|"
    r"conseil (?:r[ée]gional|g[ée]n[ée]ral|d[ée]partemental)|"
    r"d[ée]partement|r[ée]gion)\s+(?:de|du|des|d['’])\b",
    re.IGNORECASE,
)


def looks_like_public_administration_name(name: object) -> bool:
    """« Mairie de Still », « Commune de X », « Conseil départemental du Y »…

    Un employeur nommé ainsi n'est, par le motif même de son nom, JAMAIS
    l'entreprise homonyme qu'un collecteur d'offres cherchait — quel que soit
    le SIREN (inconnu ici, une offre ne le porte pas). Reconnaître une
    administration par SON NOM est un indice déterministe, pas une donnée
    inventée : on décode un motif de nommage public, on ne devine rien sur
    l'entité elle-même.
    """
    text = " ".join(str(name or "").split())
    if not text:
        return False
    return bool(_PUBLIC_ADMINISTRATION_EMPLOYER_RE.match(text))


def public_administration_mismatch(employer_name: object, entity_name: object) -> bool:
    """#3901 (lot Y07) / #3901.t — LE filtre d'employeur partagé par tous les
    chemins d'offres : vrai quand l'employeur d'une offre est nommé comme une
    administration (« Mairie de Still ») alors que l'entité visée ne l'est pas
    (« STILL SAS ») — un homonyme commune/entreprise, jamais la même entité.

    Chemin PAR COMPTE (`_mentions_company` de France Travail, APEC, WTTJ) :
    ``entity_name`` est le compte cherché. Chemin TERRITOIRE
    (`discover_signals._resolve_groups`) : c'est la raison sociale que le
    registre a résolue pour le nom de l'employeur. Une administration
    littéralement cherchée (ou résolue) reste attribuable.
    """
    return looks_like_public_administration_name(employer_name) and not looks_like_public_administration_name(
        entity_name
    )


# ── Filters ──────────────────────────────────────────────────────────────────

_NAF_RE = re.compile(r"^\d{2}(\.\d{2}[A-Z]?)?$")
_DEPARTMENT_RE = re.compile(r"^(2A|2B|\d{2,3})$")
_ISO_DATE_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")

PublicationType = str


def _iso_date(value: str, field: str) -> str:
    cleaned = value.strip()
    if not _ISO_DATE_RE.match(cleaned):
        raise ValueError(f"{field} must be an ISO date (YYYY-MM-DD), got {value!r}")
    try:
        date.fromisoformat(cleaned)
    except ValueError as exc:  # 2015-13-45 & friends
        raise ValueError(f"{field} is not a valid calendar date: {value!r}") from exc
    return cleaned


def iso_to_pappers_date(value: str | None) -> str | None:
    """ISO ``YYYY-MM-DD`` → Pappers' ``JJ-MM-AAAA``. ``None`` passes through."""
    if not value:
        return None
    year, month, day = value.split("-")
    return f"{day}-{month}-{year}"


class CompanyDiscoveryFilters(BaseModel):
    """Validated registry criteria. **Every field is optional** — an empty
    instance means « no filter », which is what the pre-existing callers pass, so
    their requests stay byte-identical.

    Dates are ISO (``YYYY-MM-DD``) at this layer whatever the provider expects.
    ``extra="forbid"``: a mistyped criterion must fail loudly (422) rather than
    silently widen the search.
    """

    # Free-text seed. Optional: the registry can list on filters alone.
    q: str | None = None

    # Activity
    naf_code: str | None = Field(default=None, description="NAF/APE code, e.g. 62.02A or 62")
    naf_section: str | None = Field(default=None, description="NAF section letter A-U")
    corporate_purpose: str | None = None

    # Geography
    #: Un ou PLUSIEURS départements. Le registre gouv.fr accepte nativement une
    #: liste (`departement=31,33` mesuré à 142 contre 97 et 45 séparément), donc
    #: un commercial dont le territoire fait trois départements ne fait plus
    #: trois recherches. Pappers n'en prend qu'un : voir ``covers_filters``.
    departments: list[str] | None = None
    department: str | None = Field(default=None, description="e.g. 69, 2A, 971")
    #: #2642.1 — le rail coche PLUSIEURS régions à la fois (IDF + Occitanie…).
    #: Le registre gouv.fr en accepte nativement une liste, sur le même modèle
    #: que ``departments`` (mesuré le 21/09/2026 : ``region=11,76`` rend 341
    #: quand 11 seul en rend 220 et 76 seul 156, base NAF 30.30Z). ``region``
    #: (singulier) reste le premier élément, pour compatibilité.
    regions: list[str] | None = None
    region: str | None = None
    postal_code: str | None = None
    on_headquarters_only: bool | None = None
    #: Code INSEE de commune (5 caractères — « 31555 » pour Toulouse). C'est le
    #: pivot d'une recherche PAR VILLE : le code postal ne suffit pas, une même
    #: ville en porte six (Toulouse : 31000, 31100, 31200, 31300, 31400, 31500)
    #: et un code postal peut couvrir plusieurs communes. Mesuré le 04/09/2026 :
    #: `code_commune=31555` + NAF ESN + tranche ≥ 3 salariés → 965.
    commune_code: str | None = Field(default=None, description="Code INSEE commune, e.g. 31555")
    #: Le centre du cercle de recherche, en WGS84, et son rayon en kilomètres.
    #: Les TROIS vont ensemble ou aucun : un rayon sans point n'a pas de sens, et
    #: un point sans rayon prendrait le défaut de l'API (5 km) à l'insu de
    #: l'utilisateur.
    #:
    #: ⚠️ Le rayon est borné à 50 km PAR L'API, qui le dit elle-même — mesuré le
    #: 04/09/2026, `radius=51` rend un 400 : « Veuillez indiquer un paramètre
    #: `radius` entre `0.001` et `50` ». Cette borne est reprise ici plutôt que
    #: laissée à l'appelant : un 400 se lirait « le registre est en panne ».
    latitude: float | None = Field(default=None, ge=-90, le=90)
    longitude: float | None = Field(default=None, ge=-180, le=180)
    radius_km: float | None = Field(default=None, gt=0, le=50)

    # Size
    #: Catégorie INSEE de l'entreprise : PME, ETI, GE. Mesurée filtrante sur le
    #: registre gouv.fr le 04/09/2026 (NAF 30.30Z : 745 → 52 avec ``ETI``).
    #: Elle répond à « ETI industrielle » là où l'effectif seul ne le fait pas :
    #: la catégorie croise effectif, chiffre d'affaires et bilan.
    company_category: list[str] | None = Field(
        default=None, description="INSEE company category codes: PME, ETI, GE"
    )
    headcount_tranche_min: str | None = Field(default=None, description="INSEE tranche code")
    headcount_tranche_max: str | None = None
    #: #3908 — UNION explicite de tranches NON CONTIGUËS (10-49 + 250-499…).
    #: Additif à ``headcount_tranche_min``/``max`` ci-dessus, qui ne portent
    #: qu'UN intervalle : les envelopper ferait remonter la tranche
    #: intermédiaire jamais cochée. Déjà l'UNION (chaque tranche expansée
    #: séparément, voir ``tranche_codes_union``) — un provider la sert telle
    #: quelle, il n'a plus à la recalculer.
    headcount_tranches: list[str] | None = Field(default=None, description="INSEE tranche codes, union")
    revenue_min: int | None = Field(default=None, ge=0)
    revenue_max: int | None = Field(default=None, ge=0)
    capital_min: int | None = Field(default=None, ge=0)
    capital_max: int | None = Field(default=None, ge=0)

    # Age / lifecycle
    creation_date_min: str | None = None
    creation_date_max: str | None = None
    legal_category: str | None = None
    has_ceased: bool | None = None

    # Registry publications (BODACC-like events exposed by Pappers)
    publication_type: str | None = None
    publication_date_min: str | None = None
    publication_date_max: str | None = None

    # Cursor pagination (Pappers ``curseur``)
    cursor: str | None = None

    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    @field_validator("naf_code", mode="before")
    @classmethod
    def _normalize_naf(cls, value: object) -> object:
        """UN code, ou une LISTE de codes séparés par des virgules.

        ⚠️ La liste n'est pas un confort : c'est ce que Découvrir envoie depuis
        qu'un secteur porte ses codes NAF, et ce que le registre sait lire en un
        seul appel — `30.30Z,29.10Z` rend 1423, soit 745 + 678, un OU.

        Ce validateur n'acceptait qu'un code unique, et la conséquence a été
        mesurée EN PRODUCTION le 04/09/2026 : toute recherche croisant plus d'un
        secteur sortait en 422, et l'écran disait « La recherche a échoué — le
        service n'a pas pu être joint ». 5 600 tests étaient verts.

        Un seul code illisible fait échouer la LISTE entière : l'écarter en
        silence rendrait une recherche plus large que demandée, présentée comme
        exacte.
        """
        if value is None:
            return None
        raw = str(value).strip().upper().replace(" ", "")
        if not raw:
            return None

        codes: list[str] = []
        for part in raw.split(","):
            token = part.strip()
            # Une virgule en trop n'est pas une erreur de l'utilisateur.
            if not token:
                continue
            # Accept both 6202A and 62.02A; normalize to the dotted wire form
            # used by Pappers and by recherche-entreprises alike.
            undotted = token.replace(".", "")
            if re.match(r"^\d{4}[A-Z]?$", undotted):
                token = f"{undotted[:2]}.{undotted[2:]}"
            if not _NAF_RE.match(token):
                raise ValueError(f"naf_code must look like 62, 62.02 or 62.02A, got {part!r}")
            if token not in codes:
                codes.append(token)

        return ",".join(codes) or None

    @field_validator("naf_section", mode="before")
    @classmethod
    def _normalize_section(cls, value: object) -> object:
        if value is None:
            return None
        raw = str(value).strip().upper()
        if not raw:
            return None
        if not re.match(r"^[A-U]$", raw):
            raise ValueError(f"naf_section must be a single letter A-U, got {value!r}")
        return raw

    @field_validator("department", mode="before")
    @classmethod
    def _normalize_department(cls, value: object) -> object:
        if value is None:
            return None
        raw = str(value).strip().upper()
        if not raw:
            return None
        if not _DEPARTMENT_RE.match(raw):
            raise ValueError(f"department must be a code like 69, 2A or 971, got {value!r}")
        return raw

    @field_validator("postal_code", mode="before")
    @classmethod
    def _normalize_postal(cls, value: object) -> object:
        if value is None:
            return None
        raw = str(value).strip()
        if not raw:
            return None
        if not _POSTAL_RE.match(raw):
            raise ValueError(f"postal_code must be 5 digits, got {value!r}")
        return raw

    @field_validator("headcount_tranche_min", "headcount_tranche_max", mode="before")
    @classmethod
    def _check_tranche(cls, value: object) -> object:
        if value is None:
            return None
        raw = str(value).strip()
        if not raw:
            return None
        if raw not in HEADCOUNT_TRANCHE_LABELS:
            raise ValueError(
                f"headcount tranche must be an INSEE code ({', '.join(HEADCOUNT_TRANCHE_ORDER)}), got {value!r}"
            )
        return raw

    @field_validator("headcount_tranches", mode="before")
    @classmethod
    def _check_tranches(cls, value: object) -> object:
        if value is None:
            return None
        if not isinstance(value, list):
            raise ValueError(f"headcount_tranches must be a list of INSEE codes, got {value!r}")
        codes: list[str] = []
        for item in value:
            raw = str(item).strip()
            if raw not in HEADCOUNT_TRANCHE_LABELS:
                raise ValueError(
                    f"headcount tranche must be an INSEE code ({', '.join(HEADCOUNT_TRANCHE_ORDER)}), got {item!r}"
                )
            if raw not in codes:
                codes.append(raw)
        return codes or None

    @field_validator(
        "creation_date_min",
        "creation_date_max",
        "publication_date_min",
        "publication_date_max",
        mode="before",
    )
    @classmethod
    def _check_dates(cls, value: object, info) -> object:  # noqa: ANN001 — pydantic ValidationInfo
        if value is None:
            return None
        raw = str(value).strip()
        if not raw:
            return None
        return _iso_date(raw, info.field_name)

    @model_validator(mode="after")
    def _check_ranges(self) -> CompanyDiscoveryFilters:
        if (
            self.headcount_tranche_min
            and self.headcount_tranche_max
            and HEADCOUNT_TRANCHE_ORDER.index(self.headcount_tranche_min)
            > HEADCOUNT_TRANCHE_ORDER.index(self.headcount_tranche_max)
        ):
            raise ValueError("headcount_tranche_min must not exceed headcount_tranche_max")
        for lo, hi, label in (
            (self.creation_date_min, self.creation_date_max, "creation_date"),
            (self.publication_date_min, self.publication_date_max, "publication_date"),
        ):
            if lo and hi and lo > hi:
                raise ValueError(f"{label}_min must not exceed {label}_max")
        for lo_n, hi_n, label in (
            (self.revenue_min, self.revenue_max, "revenue"),
            (self.capital_min, self.capital_max, "capital"),
        ):
            if lo_n is not None and hi_n is not None and lo_n > hi_n:
                raise ValueError(f"{label}_min must not exceed {label}_max")
        return self

    def is_empty(self) -> bool:
        """True when no criterion at all is set — nothing to list from."""
        return not self.model_dump(exclude_none=True)


__all__ = [
    "HEADCOUNT_TRANCHE_LABELS",
    "HEADCOUNT_TRANCHE_ORDER",
    "CompanyDiscoveryFilters",
    "DegradeReason",
    "degraded_entry",
    "reason_for_status",
    "department_from_postal_code",
    "headcount_label",
    "iso_to_pappers_date",
    "looks_like_public_administration_name",
    "public_administration_mismatch",
    "tranche_code_for_headcount",
    "tranche_codes_between",
    "tranche_codes_union",
]
