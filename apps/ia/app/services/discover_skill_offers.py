"""COMPETENCE-TROUVE (Louis 20/10/2026) — une compétence posée TROUVE les comptes qui recrutent dessus.

Constat prod du 20/10 : /discover « SAP » + Île-de-France et Grand Est ⇒ 0 compte. La compétence ne
faisait que FILTRER une liste tirée du registre par zone × effectif (``technologiesObserved`` côté API,
mémoire marché) : un compte sans pile connue sortait, et aucune source d'offres n'était interrogée par
mot-clé hors du mode Signaux. Décision tranchée : dès qu'une compétence est posée, quel que soit le mode,
le tirage part des OFFRES qui la citent dans la zone.

- **Sources gratuites** (A) : France Travail (``motsCles`` + départements), Adzuna (``what``,
  dans le quota du jour SANS manger la réserve des analyses — ``adzuna_budget.discover_allowed``), et le
  cache commun d'offres déjà collectées (``source_cache.search_job_offers``).
- **Sources PAYANTES** (#4419, Louis 25/10 — « la pertinence passe avant l'économie de crédits ») : TheirStack,
  Mantiks et Fantastic.jobs entrent dans ce tirage, parce que c'est un geste utilisateur explicite (la VEILLE
  reste sans achat). Chacune derrière son adaptateur (``job_aggregators.*_skill_offers``, qui réutilise le socle
  des clients de la fiche), no-op STRICT sans sa clé, gardée 30 j (``provider_cache.TTL_JOBS``, clé = source +
  compétence, jamais la zone : 5 200 crédits brûlés en 5 jours le 15/10), et bornée par
  ``SKILL_PAID_CALLS_MAX`` appels payés par recherche — les non tentés sont COMPTÉS, jamais silencieux.
- **Règles d'offre existantes** : < 90 jours, date obligatoire, AUCUN stage (``internship_posting``),
  hors des métiers du vendeur écartée (le tri métier de la source / ``domain_offers``).
- **Employeur** (B) : nommé par l'offre (une offre anonyme ne crée aucun compte), résolu au registre
  (SIREN, nom canonique, effectif), dédoublonné par SIREN, ses offres comptées.
- **Intermédiaires** (C) : cabinet de recrutement (``intermediation.is_intermediated_employer`` — NAF
  78.10Z / 78.30Z ou nom connu ; 78.20Z reste hors de la liste, voir ce module) ou ESN / conseil IT
  (``esn_naf.is_esn_naf_code`` — 62.0x, 70.22Z — ou ``is_known_esn_name``) : une section à part, jamais
  la liste principale. Un seul endroit pour chaque liste (GA-26) : ce module les RELIT.
- **Budget** (G) : France Travail lu département par département jusqu'à ``SKILL_FT_MAX_DEPARTMENTS``
  (une région entière), au-delà ``SKILL_FT_NATIONAL_PAGES`` pages nationales ; ``SKILL_ADZUNA_MAX_PAGES``
  pages Adzuna par compétence, ``SKILL_MAX_EMPLOYERS`` résolutions registre (#4419.4) ; le tout sous le
  budget de temps de Découvrir (``deadline``). La moisson (offres) et chaque lecture France Travail se gardent
  ``provider_cache.TTL_TERRITORY`` (24 h) — le réglage existant des agrégats de territoire, aucune variable
  neuve ; les identités registre, elles, viennent du cache 30 j de ``recherche_entreprises``.
- **Compteurs** (#4419.1) : chaque étape dit combien entre et combien sort (``SkillAccounts.info``, contrat
  ``discoverSkillSearchSchema``) — sources, rejets d'offre par motif, groupes, plafond, échecs de résolution
  par motif, non tentés faute de temps, hors zone, intermédiaires. Le délai n'est JAMAIS « introuvable ».

La SOURCE d'une offre reste dans la donnée (``latestOffer.source``) ; elle n'est jamais nommée à l'écran.
"""

from __future__ import annotations

import asyncio
import hashlib
import logging
import re
import time
import unicodedata
from collections.abc import Callable, Iterator, Mapping, Sequence
from contextlib import contextmanager
from contextvars import ContextVar
from dataclasses import dataclass, field, replace
from datetime import UTC, date, datetime, timedelta
from typing import Any

from app.services import adzuna_budget, provider_cache, source_cache, source_silence
from app.services.company_filters import headcount_label, public_administration_mismatch
from app.services.coverage_matrix import coverage as coverage_matrix
from app.services.coverage_matrix import failure_cause
from app.services.coverage_matrix import log_line as coverage_log_line
from app.services.criteria_referential import canonical_skill, skill_written_forms
from app.services.department_reach import circle_departments
from app.services.esn_naf import is_esn_naf_code
from app.services.flexible_search import lexicon_expands, matches_flexible_query, search_tokens, upstream_query
from app.services.intermediation import (
    is_intermediated_employer,
    is_temp_agency,
    looks_like_broker,
    looks_like_msp,
    looks_like_vms,
)
from app.services.internship_posting import is_internship_posting
from app.services.rate_limiter import wait_deadline
from app.services.zone_tiers import distance_km, published_position

logger = logging.getLogger(__name__)

#: Une offre plus vieille ne prouve plus un besoin (même fenêtre que le volume d'offres d'une carte).
SKILL_OFFER_MAX_AGE_DAYS = 90
#: #4419.2 — France Travail est lu département par département jusqu'à une région entière (les
#: Hauts-de-France : 5 appels, la Nouvelle-Aquitaine : 12). Mesure prod du 21/10 : avec 3, une région
#: tombait sur UNE lecture nationale de 100 offres filtrée sur la zone — vide par construction.
SKILL_FT_MAX_DEPARTMENTS = 13
#: Au-delà (plusieurs régions, toute la France) : la lecture nationale, paginée (150 offres par page),
#: arrêtée dès qu'une page n'est pas pleine.
# #4419.24 (24/10) — 5 pages : Louis accepte le coût, « remonte-moi au moins une vingtaine ».
SKILL_FT_NATIONAL_PAGES = 5
#: Pages Adzuna (50 offres chacune) par compétence, prises sur le quota DÉCOUVRIR (réserve des analyses intacte).
# #4419.24 — 3 pages (150 offres) par terme ; la deadline coupe le reste (compté « sourcesCut »).
SKILL_ADZUNA_MAX_PAGES = 3
#: #4676 — jusqu'à N départements, Adzuna reçoit le lieu (``where`` = le nom du département), UN appel par département ;
#: au-delà (région(s) larges) : la France, comme avant. Borne le quota du jour (réserve des analyses intacte).
SKILL_ADZUNA_MAX_DEPARTMENTS = 3
#: #4419.4 — employeurs résolus au registre par recherche (les plus fournis en offres d'abord). 25 bornait
#: TOUTE recherche par compétence à 25 comptes ; la cible est « des dizaines à des centaines ». Le temps reste
#: borné par la deadline : un employeur non tenté est compté « non tenté (délai) », jamais « introuvable ».
SKILL_MAX_EMPLOYERS = 150
#: Compétences interrogées par recherche (au-delà, les suivantes ne partent pas : borne d'appels).
#: #4579 / #4519 — 3 → 5 : la pertinence passe avant le coût (décision Louis 25/10), l'élargissement est borné par
#: ce plafond NOMMÉ, pas refusé. Une recherche « vue, java, react, python » ne perd plus sa 4e compétence.
SKILL_MAX_TERMS = 5
# #4519.21 — 8 en vol : le limiteur partagé du registre (concurrence 5, 2 req/s) reste le seul juge du débit.
_RESOLVE_CONCURRENCY = 8
# #4674 — plus de plafond de « 3 refus consécutifs » : un employeur non résolu SORT quand même (état d'identité),
# donc insister ne coûte plus la liste. Les seuls freins : le délai de l'appelant, le limiteur partagé et le
# coupe-circuit du registre (``REGISTRY_BREAKER``, #4617) — on respecte la source, on ne la bourrine pas.
#: Namespace du cache d'identité (nom normalisé → identité registre), TTL ``provider_cache.TTL_EMPLOYER_IDENTITY``.
_IDENTITY_NAMESPACE = "discover:employer_identity"
#: Formes juridiques retirées du nom pour le dédoublonnage (mots entiers, après pliage des accents et de la ponctuation).
_LEGAL_FORMS = frozenset({"sas", "sasu", "sarl", "sa", "eurl", "snc"})
#: Lignes du cache commun lues par compétence.
_CACHE_SEARCH_LIMIT = 500
#: #4419.25 — la donnée déjà accumulée (cache commun d'offres) entre comme PREUVE DATÉE jusqu'à un an : un besoin
#: ancien dit qu'un compte a recruté sur la compétence ; sa date voyage avec la preuve (``_evidence``).
SKILL_CACHED_OFFER_MAX_AGE_DAYS = 365
#: #4419 — appels PAYÉS au plus par recherche (toutes sources payantes et compétences confondues). Le cache 30 j
#: ne compte pas. Au-delà : l'appel ne part pas, il est compté ``notAttempted`` dans le compteur de la source.
#: #4676 (L4) — 18 = trois compétences (``SKILL_MAX_TERMS``) × les trois sources × deux pages. Plafond NOMMÉ, relevé de
#: 6 : décision Louis du 25/10/2026, « la pertinence passe avant le coût, même si on consomme un peu plus de tokens ».
#: On borne par le cache 30 j (qui ne consomme rien) et par ce plafond, jamais par le refus d'appeler ; une page
#: non tentée faute de plafond est comptée ``notAttempted``. La veille reste SANS achat.
SKILL_PAID_CALLS_MAX = 18
#: #4676 — pages lues par source payante qui pagine (TheirStack : ``page`` + ``limit`` documentés), page suivante
#: appelée seulement si la précédente est PLEINE. Les autres sources n'ont pas de pagination vérifiée : une page.
SKILL_PAID_PAGES_MAX = 2
#: Louis 01/11/2026 — « TheirStack doit être bloqué à max 300 crédits par requête » (une recherche « data » Île-de-France
#: en coûtait 901). Réglage UNIQUE (GA-26) : 1 crédit par offre RENDUE + 1 par compte, toutes compétences confondues.
#: Revient sur #4725 (« une lumière, jamais un plafond ») et #4676 (L4) pour TheirStack seulement : le nombre de
#: PAGES n'est plus borné par les seuls appels.
#: 301 et non 300 (Louis 01/11/2026, « qu'on ait quand même 3 pages ») : 1 compte + 3 pages pleines de 100.
THEIRSTACK_CREDITS_PER_SEARCH_MAX = 301
#: Part minimale d'une compétence (le budget se partage entre les compétences, ``SKILL_MAX_TERMS`` au plus).
_THEIRSTACK_SHARE_FLOOR = 25
_PAID_SOURCES = ("theirstack", "mantiks", "fantastic_jobs")
_PAID_NAMESPACE = "discover:skill_paid"
#: #4725 — le COMPTE à 1 crédit (``total_results``), rangé sous la clé de la recherche : on ne le repaie pas à chaque page.
_COUNT_NAMESPACE = "discover:skill_count"
_HARVEST_NAMESPACE = "discover:skill_offers"
_FT_NAMESPACE = "discover:skill_offers:ft"
#: #4419.5 — la moisson a changé (départements, pagination, lieu de l'agrégateur) : une récolte bridée d'avant
#: ne se ressert pas. À changer à chaque évolution de la moisson.
HARVEST_KEY_VERSION = "k7"
# k6 (vague IX) : la moisson porte DEUX nouveautés arrivées en parallèle — les sources payantes (k5, #4419) et les
# écritures d'annonce de la compétence (le « k4 » de #4579). Chacune invalidait déjà k3 de son côté ; ensemble elles
# donnent une récolte qu'aucune des deux clés ne décrit, donc un palier NEUF : ni une récolte k4 ni une k5 ne se ressert.
# k7 (#4676) : les sources payantes et Adzuna reçoivent le lieu et les écritures, et paginent — une récolte France entière
# d'avant ne se ressert pas.
# k5 (#4419) : les sources payantes entrent dans la moisson — une récolte d'avant ne se ressert pas.
# #4579 : la compétence se cherche aussi sous ses écritures d'annonce (vue.js, vuejs…) ; une récolte d'avant ne les a pas lues.
# k4 (#4284.1) : le tri métier s'applique à TOUTES les offres (le « k4 » de main est ce même palier) — k5 l'inclut.
# #4469 — k3 : la compétence se cherche dans le métier de l'offre (intitulé + description), jamais dans son lieu ;
# une récolte (ou une lecture France Travail sans description) d'avant ne se ressert pas.


#: LAURA-OFFRES-4563 — la recherche d'OFFRES de Laura (palier « fenêtre » et plafond de la cascade) règle deux choses de
#: la moisson SANS changer une signature (les doublures des tests en dépendent) : la borne d'âge et le plafond
#: d'appels payés. Posé par ``skill_scope``, relu aux endroits qui en dépendent ; absent ⇒ le comportement d'avant,
#: à l'octet près.
_age_override: ContextVar[int | None] = ContextVar("skill_age_override", default=None)
_paid_cap_override: ContextVar[int | None] = ContextVar("skill_paid_cap_override", default=None)
#: Louis 01/11/2026 — le compteur de crédits TheirStack d'une RECHERCHE qui lit plusieurs fois (la cascade des offres de
#: Laura enchaîne 3 moissons) : une cellule partagée par toutes ses moissons, sinon chacune aurait SES 300 crédits.
_credits_override: ContextVar[list[int] | None] = ContextVar("skill_credits_override", default=None)


@contextmanager
def skill_scope(
    *, max_age_days: int | None = None, paid_cap: int | None = None, credits: list[int] | None = None
) -> Iterator[None]:
    """Le temps d'une moisson : ``max_age_days`` élargit la fenêtre (jamais en dessous de 90 j), ``paid_cap`` abaisse
    le plafond d'appels payés (jamais au-dessus de ``SKILL_PAID_CALLS_MAX``) ; ``credits`` (une cellule ``[dépensés]``)
    partage le budget de crédits TheirStack entre les moissons d'une même recherche."""
    age = None if max_age_days is None else max(SKILL_OFFER_MAX_AGE_DAYS, int(max_age_days))
    cap = None if paid_cap is None else max(0, min(SKILL_PAID_CALLS_MAX, int(paid_cap)))
    tokens = (_age_override.set(age), _paid_cap_override.set(cap), _credits_override.set(credits if credits is not None else _credits_override.get()))
    try:
        yield
    finally:
        _age_override.reset(tokens[0])
        _paid_cap_override.reset(tokens[1])
        _credits_override.reset(tokens[2])


@contextmanager
def request_credit_budget() -> Iterator[None]:
    """Louis 01/11/2026 — UN budget de crédits TheirStack le temps d'UNE requête utilisateur (revient sur #5095 :
    budget par moisson). Toutes les moissons, vagues et paliers de la requête se servent dans la MÊME cellule ;
    une cellule déjà posée (cascade de Laura) est conservée, jamais remplacée."""
    if _credits_override.get() is not None:
        yield
        return
    token = _credits_override.set([0])
    try:
        yield
    finally:
        _credits_override.reset(token)


def _age_days() -> int:
    override = _age_override.get()
    return SKILL_OFFER_MAX_AGE_DAYS if override is None else override


def _paid_cap() -> int:
    override = _paid_cap_override.get()
    return SKILL_PAID_CALLS_MAX if override is None else override


def _window_suffix() -> str:
    """Une lecture élargie se range sous SA clé : la réponse de 90 j gardée ne répondrait pas à la question."""
    return "" if _age_override.get() in (None, SKILL_OFFER_MAX_AGE_DAYS) else f"|w{_age_days()}"


def _fold(value: object) -> str:
    text = unicodedata.normalize("NFD", str(value or ""))
    text = "".join(ch for ch in text if unicodedata.category(ch) != "Mn").lower()
    return " ".join(re.findall(r"[a-z0-9+#./]+", text))


def skill_terms(
    keywords: Sequence[object] | None, technologies: Sequence[object] | None, *, limit: int | None = SKILL_MAX_TERMS
) -> list[str]:
    """Les compétences posées (mots-clés puis technologies), sans doublon (casse et accents pliés),
    dans leur forme tapée, bornées à ``SKILL_MAX_TERMS`` (``limit=None`` : toutes — #4421.3, la fiche d'un
    consultant en porte plus que deux et le volume demandé se tient par paliers)."""
    seen: set[str] = set()
    terms: list[str] = []
    for raw in [*(keywords or []), *(technologies or [])]:
        shown = " ".join(str(raw or "").split())
        key = _fold(shown)
        if not key or key in seen:
            continue
        seen.add(key)
        terms.append(shown)
    return terms if limit is None else terms[:limit]


#: #4579 / #4519 — deux budgets de places SÉPARÉS (décision Louis 25/10 : la pertinence avant le coût). Avant, une
#: expertise remplacée par ses métiers consommait seule les 6 places et la compétence tapée à côté ne partait plus :
#: la tuile Data & IA rendait 3 comptes hors sujet. Les compétences tapées ont le plafond des compétences demandées ;
#: les métiers d'une expertise, le leur. Un seul endroit (GA-26) : aucun autre module ne les redéclare.
HARVEST_MAX_TYPED_TERMS = SKILL_MAX_TERMS
HARVEST_MAX_TRADE_TERMS = 6
#: #4519.19 — termes cherchés au plus pour une recherche : la somme des deux budgets.
HARVEST_MAX_TERMS = HARVEST_MAX_TYPED_TERMS + HARVEST_MAX_TRADE_TERMS


def harvest_terms(skills: Sequence[str]) -> list[str]:
    """#4519.19 — ce qui part aux sources d'offres : une EXPERTISE du référentiel (« Data & Intelligence
    Artificielle ») est remplacée par ses métiers (data engineer, data scientist…), jamais envoyée littérale ;
    une compétence reste telle que tapée. Sans doublon (plié). Les métiers d'expertise sont bornés à
    ``HARVEST_MAX_TRADE_TERMS``, les compétences tapées à ``HARVEST_MAX_TYPED_TERMS`` : budgets séparés (#4579)."""
    from app.services.criteria_referential import expertise_trade_terms

    typed = skill_terms([s for s in skills if not expertise_trade_terms(s)], [], limit=HARVEST_MAX_TYPED_TERMS)
    trades = skill_terms(
        [t for s in skills for t in (expertise_trade_terms(s) or [])], [], limit=HARVEST_MAX_TRADE_TERMS
    )
    trade_keys = {_fold(t) for t in trades}
    kept = {_fold(t) for t in typed} | trade_keys
    order = [t for s in skills for t in (expertise_trade_terms(s) or [s])]
    return [t for t in skill_terms(order, [], limit=None) if _fold(t) in kept]


def searched_forms(term: str) -> tuple[list[str], list[str]]:
    """Sous quelles formes une compétence part aux sources : ``(saisie + forme étendue, écritures déclinées)``.
    Un seul endroit (GA-26) : la moisson l'appelle, et ``query.skillSearch.searched`` le dit à l'écran (#4579.5)."""
    typed = list(dict.fromkeys([term, upstream_query(term)]))
    known = {_fold(form) for form in typed}
    return typed, [form for form in skill_written_forms(term) if _fold(form) not in known]


def _department_code(raw: object) -> str | None:
    """R22-DV1 — un code (« 59 », « 2A ») tel quel, un NOM (« Nord ») par son code ; jamais « NOR » deviné."""
    from app.services.data_sources.territory_query import normalize_department
    from app.services.geo_labels import department_code_for_label

    text = str(raw or "").strip()
    return department_code_for_label(text) or normalize_department(text) if text else None


def zone_departments(regions: Sequence[str] | None, departments: Sequence[str] | None, city: str | None) -> list[str]:
    """Les départements de la zone demandée (départements explicites, sinon régions, sinon ville connue).
    ``[]`` = aucune zone : la lecture est nationale. Jamais une zone devinée (code inconnu → rien)."""
    from app.services import scope_filter
    from app.services.geo_labels import CITY_DEPARTMENTS, region_departments

    explicit = [d for d in (_department_code(x) for x in departments or []) if d]
    if explicit:
        return sorted(set(explicit))
    from_regions: set[str] = set()
    for code in regions or []:
        from_regions |= set(region_departments(str(code)))
        # R22-DV1 — une région donnée par son LIBELLÉ (« Hauts-de-France ») vaut son code : sans cela la zone
        # restait vide et la lecture devenait nationale, sans le dire.
        # (jamais un code numérique : « 32 » est la région Hauts-de-France ici, pas le Gers).
        if not str(code).strip().isdigit():
            from_regions |= scope_filter.zone_departments([str(code)])
    if from_regions:
        return sorted(from_regions)
    key = " ".join((city or "").strip().lower().split())
    return sorted(CITY_DEPARTMENTS.get(key, ())) if key else []


# ── Les trois sources (remplacées par des doublures dans les tests) ─────────────────────────────


def _offer_date(value: object) -> date | None:
    text = str(value or "").strip()[:10]
    try:
        return date.fromisoformat(text)
    except ValueError:
        return None


#: Offres France Travail lues par appel (le maximum d'une plage de l'API).
_FT_PAGE_SIZE = 150
#: #4675 — pages lues au plus par lecture DÉPARTEMENTALE (ou en cercle) : même esprit que ``SKILL_FT_NATIONAL_PAGES``.
#: « java » sur 90 jours dans le 59 dépasse 150 offres ; au plafond, ce qui reste est DIT (``causes.pageCeiling``).
SKILL_FT_DEPARTMENT_PAGES = 5


#: #5009.1 — où la moisson en cours range les totaux « trouvées » que les sources rendent, et si CETTE lecture compte
#: (une seule écriture de la compétence par source : les écritures déclinées se recoupent, les additionner gonflerait M).
_total_harvest: ContextVar["SkillHarvest | None"] = ContextVar("total_harvest", default=None)
_total_counts: ContextVar[bool] = ContextVar("total_counts", default=False)


def _is_count(value: object) -> bool:
    return isinstance(value, int) and not isinstance(value, bool) and value >= 0


def _note_total(source: str, total: int | None) -> None:
    """#5009.1 — range le total qu'une lecture a RENDU. ``None`` (la source n'en a pas donné pour cette lecture) :
    la source entière reste sans total — « toutes sinon rien », jamais un total partiel présenté comme complet."""
    harvest = _total_harvest.get()
    if harvest is None or not _total_counts.get():
        return
    if total is None:
        harvest.no_total.add(source)
    else:
        harvest.totals[source] = harvest.totals.get(source, 0) + total


async def _counting(coro: Any, counts: bool) -> Any:
    """Lit ``coro`` dans un contexte où ses totaux comptent (ou non) — le contexte est celui de cette tâche seule."""
    _total_counts.set(counts)
    return await coro


async def france_travail_offers(
    term: str,
    department: str | None,
    profile: Mapping[str, Any],
    *,
    page: int = 0,
    commune: str | None = None,
    distance: int | None = None,
) -> list[dict]:
    """Les offres France Travail qui citent ``term`` (``motsCles``), sur un département ou la France
    (``page`` : la page nationale, #4419.2). Le tri métier du profil (``offer_relevant_to_profile``) est
    celui de la source. Sans clé : ``SignalSourceUnavailable`` — dit, jamais confondu avec « aucune offre ».

    #4419.2 — chaque lecture se garde 24 h (``TTL_TERRITORY``) : un second passage ne relit que les
    départements que le premier n'a pas eu le temps de lire.

    #4675 — ``commune`` + ``distance`` : le CERCLE d'une ville lu par la source elle-même. La clé de cache les porte,
    sinon une lecture « 59, tout le département » servirait la réponse d'un cercle (et inversement)."""
    circle = f"|c{commune}:{distance}" if commune else ""
    key = f"{HARVEST_KEY_VERSION}|{_fold(term)}|{department or 'fr'}|{page}|{_trade_key(profile)}{circle}{_window_suffix()}"
    hit = await provider_cache.get_json(_FT_NAMESPACE, key)
    if isinstance(hit, dict) and isinstance(hit.get("offers"), list):
        if page == 0:
            _note_total("france_travail", hit.get("total") if _is_count(hit.get("total")) else None)
        return list(hit["offers"])
    stats: dict[str, int] = {}
    if commune:
        offers = await _france_travail_read(term, department, profile, page, commune=commune, distance=distance, stats=stats)
    else:
        offers = await _france_travail_read(term, department, profile, page, stats=stats)
    total = stats.get("total")
    await provider_cache.set_json(
        _FT_NAMESPACE, key, {"offers": offers, **({"total": total} if total is not None else {})}, provider_cache.TTL_TERRITORY
    )
    if page == 0:
        # #5009.1 — le total lu dans la réponse déjà reçue (``Content-Range``) ; la page 0 seule le porte.
        _note_total("france_travail", total)
    return offers


async def _france_travail_read(
    term: str,
    department: str | None,
    profile: Mapping[str, Any],
    page: int,
    *,
    commune: str | None = None,
    distance: int | None = None,
    stats: dict[str, int] | None = None,
) -> list[dict]:
    from app.services.data_sources.france_travail import list_hiring_companies

    rows = await list_hiring_companies(
        department,
        [term],
        since_days=_age_days(),
        limit=_FT_PAGE_SIZE,
        profile=dict(profile or {}),
        offset=page * _FT_PAGE_SIZE,
        page_stats=stats,
        **({"commune_code": commune, "distance_km": distance} if commune else {}),
    )
    offers: list[dict] = []
    for row in rows or []:
        signal = row.get("signal") if isinstance(row.get("signal"), Mapping) else {}
        label = str(signal.get("label") or "")
        title = label.split("—", 1)[1].strip() if "—" in label else ""
        offers.append(
            {
                "employer": row.get("name"),
                "siren": None,
                "title": title,
                "city": row.get("city"),
                "department": row.get("department"),
                # #4515 (lot DÉCOUVRIR-MOTEUR, 27/10) — la position PUBLIÉE du lieu de travail : le rayon s'y mesure.
                **published_position(row),
                "date": signal.get("date"),
                "url": signal.get("url"),
                "source": "france_travail",
                # #4675 — la source a REFUSÉ la maille fine et rendu le département entier : l'appelant le sait.
                **({"coarseFallback": True} if row.get("coarseFallback") else {}),
                "contractType": row.get("contractCode"),
                "romeCode": row.get("romeCode"),
                "romeLabel": row.get("romeLabel"),
                # #4469 — la description voyage : le mot se re-vérifie ICI, hors lieu et employeur (la recherche
                # par mots-clés de la source matche aussi la ville et l'employeur).
                "description": row.get("description"),
                "termChecked": True,
            }
        )
    return offers


#: #4419 — ce qu'Adzuna a fait pendant la moisson (quota Découvrir atteint, pages tombées, lignes brutes, sans
#: employeur) : un 0 reçu ne se confond plus avec une panne ou un quota. Posé par ``harvest_skill_offers``.
_adzuna_diag: ContextVar[dict[str, int] | None] = ContextVar("adzuna_diag", default=None)


def _diag(key: str, amount: int = 1) -> None:
    sink = _adzuna_diag.get()
    if sink is not None:
        sink[key] = sink.get(key, 0) + amount


async def adzuna_offers(term: str, department: str | None = None) -> list[dict] | None:
    """Les offres Adzuna qui citent ``term`` (``what``), seulement tant que Découvrir a du quota
    (la réserve des analyses n'est jamais entamée — ``adzuna_budget.discover_allowed``).
    #4676 — ``department`` (code) posé ⇒ le NOM du département part en ``where`` ; sinon la France.

    ``None`` = source NON CONFIGURÉE (sans clés : no-op strict voulu) — elle n'a pas été interrogée, donc elle n'est
    ni « tentée » ni « muette » (#4419, mesure du 25/10 : ``received adzuna=0`` sur trois appels)."""
    from app.services.data_sources.job_aggregators import adzuna_configured, adzuna_skill_offers

    if not adzuna_configured():
        return None
    if not await adzuna_budget.discover_allowed():
        logger.info("COMPETENCE-TROUVE — Adzuna sauté : quota Découvrir du jour atteint")
        _diag("quotaSkipped")
        _note_total("adzuna", None)  # #5009.1 — un département sauté : le total de la source serait partiel
        return []
    from app.services.geo_labels import department_name

    meta: dict[str, int] = {}
    rows = await adzuna_skill_offers(
        term,
        max_pages=SKILL_ADZUNA_MAX_PAGES,
        max_age_days=_age_days(),
        stats=_adzuna_diag.get(),
        where=department_name(department) if department else None,
        meta=meta,
    )
    # #5009.1 — le ``count`` de la première réponse déjà reçue ; absent (page tombée, champ illisible) ⇒ pas de total.
    _note_total("adzuna", meta.get("total"))
    return [{**row, "employer": row.get("company"), "siren": None} for row in rows]


def _pages_for(total: int, size: int | None = None) -> int:
    """#4725 — pages à acheter pour ``total`` offres : 0 si rien, une si tout tient en une page (la suivante n'aurait rien
    rendu de plus), sinon AU MOINS ``SKILL_PAID_PAGES_MAX`` (aucune régression) et jusqu'à couvrir le total — le
    plafond d'appels payés (``_paid_cap``) reste le seul frein."""
    from app.services.data_sources import job_aggregators

    size = size or job_aggregators.PAID_SKILL_PAGE_SIZE
    if total <= 0:
        return 0
    if total <= size:
        return 1
    return max(SKILL_PAID_PAGES_MAX, -(-total // size))


def _page_limit(left: int, total: int | None) -> int:
    """Louis 01/11/2026 — taille de page (≤ 100) qui fait tenir les pages dans ``left`` crédits restants à la compétence :
    ``total`` connu et couvert par ``left`` ⇒ pages égales qui le couvrent exactement ; sinon pages égales qui épuisent
    ``left`` sans le dépasser. Toutes les pages d'une lecture portent la MÊME taille (``page × limit`` reste juste)."""
    from app.services.data_sources import job_aggregators

    size = job_aggregators.PAID_SKILL_PAGE_SIZE
    left = max(1, left)
    if total is not None and 0 < total <= left:
        return min(size, -(-total // -(-total // size)))
    return min(size, max(1, left // -(-left // size)))


async def _count_results(
    key: str,
    term: str,
    forms: Sequence[str],
    zone: Sequence[str],
    replay_args: Mapping[str, Any],
    reserve: Callable[[int], bool] | None = None,
) -> int | None:
    """#4725 — ``total_results`` de la recherche, lu au cache sous la clé de la recherche (+ le jour du rejeu : un rejeu
    compte les offres NEUVES), sinon acheté 1 crédit. ``None`` : le compte n'a pas répondu, l'appelant pagine comme avant."""
    from app.services.data_sources import job_aggregators

    since = replay_args.get("since")
    count_key = key + (f"|since={str(since)[:10]}" if since else "")
    cached = await provider_cache.get_json(_COUNT_NAMESPACE, count_key)
    if isinstance(cached, Mapping) and isinstance(cached.get("total"), int):
        return int(cached["total"])
    if reserve is not None and not reserve(1):
        return None  # Louis 01/11 — le crédit du compte ne se réserve pas : il ne part pas
    total = await job_aggregators.theirstack_skill_count(
        term, forms=forms, zone=zone, since=since, exclude_ids=replay_args.get("exclude_ids") or ()
    )
    if total is not None:
        ttl = provider_cache.TTL_JOBS if total else provider_cache.TTL_EMPTY_JOBS
        await provider_cache.set_json(_COUNT_NAMESPACE, count_key, {"total": total}, ttl)
    return total


async def paid_skill_offers(
    source: str,
    term: str,
    harvest: SkillHarvest,
    zone: Sequence[str] = (),
    forms: Sequence[str] = (),
) -> list[dict] | None:
    """#4419 — les offres PAYANTES d'une source qui citent ``term`` (adaptateurs de ``job_aggregators``).

    ``None`` = la source n'a pas été interrogée : clé absente (no-op STRICT, ni appel ni compteur) ou plafond
    d'achats atteint avant la première page (compté ``notAttempted``). Le cache 30 j est lu AVANT le plafond : un
    résultat servi par le cache ne coûte rien et ne consomme aucun appel. Une source qui n'a pas répondu LÈVE
    (comptée « tombée », jamais rangée au cache, jamais « aucune offre »).

    #4676 — ``zone`` (départements) et ``forms`` (écritures déclinées, lues dans ``searched_forms``) voyagent vers les
    sources dont le contrat les accepte ; la clé de cache porte exactement ce qui a été ENVOYÉ (le lieu et les formes),
    jamais un lieu que la source n'a pas reçu. Une source qui pagine lit la page suivante tant que la précédente est
    pleine, dans la limite de ``SKILL_PAID_PAGES_MAX`` et du plafond d'appels : une page non tentée est comptée
    ``notAttempted`` et la lecture tronquée n'est pas rangée au cache (elle ne répondrait pas à la même question)."""
    from app.services.data_sources import job_aggregators

    stats = harvest.by_source[source]
    if source != "theirstack":
        harvest.no_total.add(source)  # #5009.1 — l'aperçu Mantiks et Fantastic.jobs ne publient aucun total relu
    if not job_aggregators.paid_skill_source_configured(source):
        # #4420 — sans clé : no-op voulu, mais la matrice le NOMME (une source muette n'est pas une source vide).
        stats["causes"]["noKey"] = stats["causes"].get("noKey", 0) + 1
        return None
    sends_forms = source in ("theirstack", "mantiks")
    sent_forms = [f for f in dict.fromkeys(forms) if _fold(f) != _fold(term)] if sends_forms else []
    sent_zone = job_aggregators.zone_region_labels(zone) if source == "theirstack" else []
    key = f"{HARVEST_KEY_VERSION}|{source}|{_fold(term)}"
    if sent_forms:
        key += "|f=" + ",".join(sorted(_fold(f) for f in sent_forms))
    if sent_zone:
        key += "|z=" + ",".join(_fold(label) for label in sent_zone)
    key += _window_suffix()
    hit = await provider_cache.get_json(_PAID_NAMESPACE, key)
    if isinstance(hit, dict) and isinstance(hit.get("offers"), list):
        stats["cached"] += 1
        harvest.no_total.add(source)  # #5009.1 — servie par le cache : aucun total n'a été rendu pour cette lecture
        logger.info("COMPETENCE-TROUVE source=%s payé=non cache=hit", source)
        return [{**row, "employer": row.get("company"), "siren": None} for row in hit["offers"] if isinstance(row, Mapping)]
    async def buy() -> list[dict] | None:
        pages = SKILL_PAID_PAGES_MAX if source == "theirstack" else 1
        rows: list[dict] = []
        complete = True
        # #4724 — le cache 30 j a expiré mais le STOCK (même clé) survit : on ne paie que les offres découvertes
        # DEPUIS le dernier appel (``discovered_at_gte`` + ``job_id_not``), le stock encore dans la fenêtre d'âge est servi.
        stock = await provider_cache.get_json(job_aggregators.STOCK_NAMESPACE_SKILL, key) if source == "theirstack" else None
        replay = job_aggregators.replay_filters(stock)
        stored = job_aggregators.stock_offers(stock) if replay else []
        replay_args: dict[str, Any] = {}
        if replay:
            replay_args = {"since": replay["discovered_at_gte"], "exclude_ids": replay.get("job_id_not") or ()}
        # #4725 — un compte à 1 crédit AVANT la première page à 100 : une lumière, jamais un plafond (Louis 25/10).
        total = None
        spent = 0  # crédits TheirStack de CETTE compétence (sa part : ``theirstack_share``)

        def reserve(credits: int) -> bool:
            nonlocal spent
            if spent + credits > harvest.theirstack_share() or not harvest.reserve_theirstack(credits):
                return False
            spent += credits
            return True

        def settle(reserved: int, actual: int) -> None:
            nonlocal spent
            spent += actual - reserved
            harvest.theirstack_credits += actual - reserved

        limit = job_aggregators.PAID_SKILL_PAGE_SIZE
        if source == "theirstack":
            total = await _count_results(key, term, sent_forms, zone, replay_args, reserve)
            if total is not None:
                # Louis 01/11 — la taille de page suit la part restante ; TOUTES les pages portent la même ``limit``.
                limit = _page_limit(harvest.theirstack_share() - spent, total)
                pages = _pages_for(total, limit)
                if total:
                    stats["causes"]["totalResults"] = total
                    harvest.totals[source] = harvest.totals.get(source, 0) + total
                else:
                    stats["causes"]["countZero"] = stats["causes"].get("countZero", 0) + 1
            else:
                harvest.no_total.add(source)  # #5009.1 — compte non rendu : le total de la source est partiel
        called_at = job_aggregators.utc_stamp()
        for page in range(pages):
            if harvest.paid_total >= _paid_cap():
                stats["notAttempted"] += 1
                logger.info("COMPETENCE-TROUVE source=%s payé=non plafond=%d atteint page=%d", source, _paid_cap(), page)
                if page == 0:
                    return None
                complete = False
                break
            if source == "theirstack":
                if total is None:
                    limit = _page_limit(harvest.theirstack_share() - spent, None)
                # Louis 01/11/2026 — le coût MAX de la page se réserve avant l'appel ; budget épuisé ⇒ elle ne part pas.
                if not reserve(limit):
                    stats["notAttempted"] += 1
                    stats["causes"]["creditBudget"] = stats["causes"].get("creditBudget", 0) + 1
                    logger.info(
                        "COMPETENCE-TROUVE source=%s payé=non budget_credits=%d atteint page=%d",
                        source, THEIRSTACK_CREDITS_PER_SEARCH_MAX, page,
                    )
                    if page == 0:
                        return None
                    complete = False
                    break
            harvest.paid_total += 1
            stats["paid"] += 1
            harvest.calls[source] = harvest.calls.get(source, 0) + 1
            meta: dict = {}
            if source == "theirstack":
                got = await job_aggregators.theirstack_skill_offers(
                    term, forms=sent_forms, zone=zone, page=page, meta=meta, limit=limit, **replay_args
                )
                returned = meta.get("returned")
                # on compte au pire (la ``limit`` réservée) si le rendu est illisible, jamais au mieux
                if isinstance(returned, int) and not isinstance(returned, bool):
                    settle(limit, returned)
            elif source == "mantiks":
                got = await job_aggregators.mantiks_skill_offers(term, forms=sent_forms)
            else:
                got = await job_aggregators.fantastic_skill_offers(term)
            if got is None:
                raise RuntimeError(f"{source}: pas de réponse")
            logger.info("COMPETENCE-TROUVE source=%s payé=oui page=%d reçues=%d", source, page, len(got))
            rows.extend(got)
            if not meta.get("full"):
                break
        if stored:
            rows = job_aggregators.merge_stock(stored, rows)
        if complete:
            ttl = provider_cache.TTL_JOBS if rows else provider_cache.TTL_EMPTY_JOBS
            await provider_cache.set_json(_PAID_NAMESPACE, key, {"offers": rows}, ttl)
            if source == "theirstack" and rows:
                await provider_cache.set_json(
                    job_aggregators.STOCK_NAMESPACE_SKILL,
                    key,
                    job_aggregators.stock_record(
                        called_at, rows, keep=2 * SKILL_PAID_PAGES_MAX * job_aggregators.PAID_SKILL_PAGE_SIZE
                    ),
                    job_aggregators.STOCK_TTL_S,
                )
        return rows

    # #4722 — UN seul achat par clé, entre processus : le second demandeur attend, relit le cache et sert la MÊME réponse.
    rows, bought = await provider_cache.single_flight_shared(_PAID_NAMESPACE, key, buy)
    if rows is None:
        return None
    if not bought:
        stats["cached"] += 1
        harvest.no_total.add(source)  # #5009.1 — idem : lecture d'un autre processus, total non rendu ici
        logger.info("COMPETENCE-TROUVE source=%s payé=non cache=coalesced", source)
        rows = rows.get("offers", []) if isinstance(rows, Mapping) else []
    return [{**row, "employer": row.get("company"), "siren": None} for row in rows]


def _postal_department(place: str) -> str | None:
    """#4419.5 — le département que porte un code postal (5 chiffres) ou un « (59) » dans un libellé de lieu."""
    from app.services.geo_labels import department_name

    postal = re.search(r"(?<!\d)(\d{5})(?!\d)", place)
    if postal:
        code = postal.group(1)
        if code.startswith("20"):
            return None
        candidate = code[:3] if code.startswith("97") else code[:2]
        return candidate if department_name(candidate) else None
    paren = re.search(r"\((\d{2,3})\)", place)
    if paren and department_name(paren.group(1)):
        return paren.group(1)
    return None


#: Régions de France métropolitaine : seul un préfixe coupé après un TIRET (« Hauts-de- ») se complète.
_REGION_NAMES = (
    "Hauts-de-France",
    "Île-de-France",
    "Provence-Alpes-Côte d'Azur",
    "Auvergne-Rhône-Alpes",
    "Bourgogne-Franche-Comté",
    "Nouvelle-Aquitaine",
    "Centre-Val de Loire",
)


def complete_offer_place(place: object) -> str | None:
    """#4419.5 / #4814 (lot Q) — un lieu COUPÉ par la source (« Lille, Hauts-de- ») redevient le nom complet de
    la région connue par préfixe. Un tiret final est le seul signe certain d'une coupe ; sans région connue,
    le lieu reste tel quel (jamais deviné). Vide ⇒ ``None``."""
    text = str(place or "").strip()
    if not text:
        return None
    if not re.search(r"[-‐–]$", text):
        return text
    from app.services.geo_labels import _fold_place

    last = re.split(r",\s*", text)[-1]
    folded = _fold_place(last)
    for region in _REGION_NAMES:
        if _fold_place(region).startswith(folded):
            return text[: len(text) - len(last)] + region
    return text


def offer_department(offer: Mapping[str, Any]) -> str | None:
    """#4419.5 — le département d'une offre : le sien, sinon celui que dit la localisation de l'agrégateur
    (``area`` : « France › Hauts-de-France › Nord › Lille », ou « Lille, Nord »). Un lieu inconnu : ``None``,
    jamais un département deviné."""
    from app.services.data_sources.territory_query import normalize_department
    from app.services.geo_labels import CITY_DEPARTMENTS, _fold_place, department_code_for_label

    own = normalize_department(str(offer.get("department") or "")) if offer.get("department") else None
    if own:
        return own
    area = offer.get("area") if isinstance(offer.get("area"), list) else []
    places = [str(p) for p in reversed(area)]
    places += [part.strip() for part in reversed(re.split(r"[,›>]", str(offer.get("city") or "")))]
    for place in places:
        code = department_code_for_label(place)
        if code:
            return code
    # #4419.5 — un code postal (« 59800 », « 59800 Lille », « Lille (59) ») dit le département ; Corse (20xxx) : 2A/2B
    # ne se devine pas.
    for place in places:
        found = _postal_department(place)
        if found:
            return found
    for place in places:
        cities = CITY_DEPARTMENTS.get(_fold_place(place), ())
        if len(cities) == 1:
            return cities[0]
    return None


def _zone_keeper(zone: frozenset[str]) -> Any:
    """#4420.4 b — vrai si une offre de la ligne est dans la zone OU de lieu inconnu (même règle que ``_reject_reason``)."""

    def keep(payload: Any) -> bool:
        rows = payload.get("rows") if isinstance(payload, Mapping) else None
        for row in rows if isinstance(rows, list) else []:
            if isinstance(row, Mapping):
                dept = offer_department(row)
                if dept is None or dept in zone:
                    return True
        return False

    return keep


async def cached_offers(term: str, zone: frozenset[str] = frozenset()) -> list[dict]:
    """Les offres du cache commun (faits publics par entreprise, clé SIREN) qui citent ``term``.

    #4420.4 b — la ``zone`` se lit AVANT la coupe à ``_CACHE_SEARCH_LIMIT`` lignes."""
    hits = await source_cache.search_job_offers(
        term,
        max_age_s=SKILL_CACHED_OFFER_MAX_AGE_DAYS * 86_400,
        limit=_CACHE_SEARCH_LIMIT,
        keep=_zone_keeper(zone) if zone else None,
    )
    offers: list[dict] = []
    for company_key, payload in hits:
        match = re.match(r"^siren:(\d{9})\|", company_key)
        rows = payload.get("rows") if isinstance(payload, Mapping) else None
        if not match or not isinstance(rows, list):
            continue
        for row in rows:
            if isinstance(row, Mapping):
                offers.append({**row, "employer": row.get("company"), "siren": match.group(1), "fromCache": True})
    return offers


@dataclass(frozen=True)
class EmployerResolution:
    """#4419.1 / #4419.3 — l'identité registre d'un employeur, OU le motif de son échec : ``homonym``
    (plusieurs homonymes que le lieu de l'offre ne tranche pas), ``registry_silent`` (le registre ne
    connaît aucune entité proche), ``public_administration`` (une collectivité confondue avec une société),
    ``deadline`` (le budget de temps est tombé), ``unavailable`` (le registre n'a pas répondu)."""

    identity: dict | None
    failure: str | None = None
    #: #4419.8 — pour ``homonym`` / ``homonym_on_site`` : les entités plausibles (nom, ville, NAF, effectif), parmi
    #: lesquelles le commercial choisit. Jamais un choix fait à sa place.
    candidates: tuple[dict, ...] = ()


def _homonym_candidates(resolution: Any) -> tuple[dict, ...]:
    """#4419.8 — les homonymes ACTIFS au nom proche du meilleur, sous la forme que l'écran montre (2 à 5 au plus)."""
    from app.services.homonym_disambiguation import _NAME_TIE_DELTA, HIGH_NAME

    viable = [c for c in resolution.candidates if c.is_active and c.name_score >= HIGH_NAME]
    if len(viable) < 2:
        return ()
    best = max(c.name_score for c in viable)
    tied = [c for c in viable if best - c.name_score < _NAME_TIE_DELTA]
    return tuple(
        {
            "siren": c.siren,
            "name": c.name,
            "city": c.city,
            "nafCode": c.naf_code,
            "sector": c.naf_label,
            "headcountTranche": c.headcount_tranche,
        }
        for c in tied[:_HOMONYM_CANDIDATES_MAX]
    )


#: #4419.8 — au plus cinq candidats proposés au choix (« 2 à 5 »).
_HOMONYM_CANDIDATES_MAX = 5


def _place_tiebreak(resolution: Any, department: str | None) -> Any | None:
    """#4419.3 — parmi des homonymes AU NOM ÉQUIVALENT, celui dont le siège est dans le département de
    l'offre. Un seul candidat y est : il gagne ; aucun ou plusieurs : ``None`` — jamais un SIREN deviné."""
    from app.services.homonym_disambiguation import _NAME_TIE_DELTA, HIGH_NAME

    wanted = str(department or "").strip().upper()
    viable = [c for c in resolution.candidates if c.is_active and c.name_score >= HIGH_NAME]
    if not wanted or not viable:
        return None
    best_name = max(c.name_score for c in viable)
    tied = [c for c in viable if best_name - c.name_score < _NAME_TIE_DELTA]
    local = [c for c in tied if str(c.department or "").strip().upper() == wanted]
    return local[0] if len(local) == 1 else None


def _site_tiebreak(resolution: Any) -> tuple[Any | None, int]:
    """#4712 — parmi des homonymes AU NOM ÉQUIVALENT (recherche posée AVEC le département de l'offre), celui qui a
    un établissement ACTIF sur place — pas celui dont le siège y est : c'est l'entité qui recrute vraiment.
    Retourne ``(gagnant, nombre d'entités sur place)`` : un seul sur place gagne ; plusieurs : pas de gagnant, et le
    nombre dit qu'il y en a PLUSIEURS — jamais un SIREN deviné."""
    from app.services.homonym_disambiguation import _NAME_TIE_DELTA, HIGH_NAME

    viable = [c for c in resolution.candidates if c.is_active and c.name_score >= HIGH_NAME]
    if not viable:
        return None, 0
    best_name = max(c.name_score for c in viable)
    tied = [c for c in viable if best_name - c.name_score < _NAME_TIE_DELTA]
    on_site = [c for c in tied if (c.site_establishments or 0) > 0]
    return (on_site[0] if len(on_site) == 1 else None), len(on_site)


def _refine_tiebreak(resolution: Any, city: str | None, it_trade: bool) -> Any | None:
    """#4419.6 — parmi des homonymes AU NOM ÉQUIVALENT que ni le siège ni l'établissement sur place ne tranchent :
    1. celui dont la VILLE est celle de l'offre ; 2. à défaut, le seul dont le NAF colle au métier (informatique) ;
    3. à défaut, la TÊTE d'un groupe (le nom de l'autre en est l'extension, effectif connu et ≥ 5× l'autre).
    Chaque étape exige UN seul candidat : sinon ``None`` — on ne devine JAMAIS un SIREN."""
    from app.services.geo_labels import same_place
    from app.services.homonym_disambiguation import _NAME_TIE_DELTA, HIGH_NAME

    viable = [c for c in resolution.candidates if c.is_active and c.name_score >= HIGH_NAME]
    if len(viable) < 2:
        return None
    best_name = max(c.name_score for c in viable)
    tied = [c for c in viable if best_name - c.name_score < _NAME_TIE_DELTA]
    if city and (here := [c for c in tied if same_place(c.city, city)]):
        if len(here) == 1:
            return here[0]
        tied = here
    if it_trade and (fits := [c for c in tied if c.naf_is_it]) and len(fits) < len(tied):
        if len(fits) == 1:
            return fits[0]
        tied = fits
    sized = [c for c in tied if c.headcount]
    if len(sized) == len(tied) and len(tied) >= 2:
        head = max(sized, key=lambda c: c.headcount or 0)
        others = [c for c in tied if c is not head]
        head_name = _fold(head.name)
        if all(
            _fold(o.name) != head_name
            and (_fold(o.name).startswith(head_name) or head_name.startswith(_fold(o.name)))
            and (head.headcount or 0) >= 5 * (o.headcount or 1)
            for o in others
        ):
            return head
    return None


#: #4712 — les mots d'un PROGRAMME ou d'une marque employeur : « Mantu Manager Program » n'est pas une raison sociale.
_PROGRAM_WORDS = frozenset({"program", "programme", "academy", "careers", "carrieres", "recrutement"})
_PROGRAM_LEADS = frozenset(
    {"manager", "management", "graduate", "graduates", "trainee", "talent", "talents", "leadership", "junior", "early"}
)


def employer_registry_name(name: str) -> str:
    """#4712 — le nom d'une annonce, privé de son suffixe de programme / marque employeur (« Mantu Manager Program »
    → « Mantu »), pour interroger le registre. Un nom sans mot de programme est rendu tel quel ; un nom qui ne serait
    QUE le programme n'est pas réduit à rien."""
    words = str(name or "").split()
    folded = [_fold(w) for w in words]
    cut = next((i for i, w in enumerate(folded) if w in _PROGRAM_WORDS), None)
    if cut is None:
        return str(name or "").strip()
    while cut > 0 and folded[cut - 1] in _PROGRAM_LEADS:
        cut -= 1
    return " ".join(words[:cut]) if cut > 0 else str(name or "").strip()


def _failure_of(exc: BaseException) -> str:
    """Un échec du registre : le budget de temps (attente de jeton refusée, délai) ou une panne."""
    from app.services.distributed_rate_limiter import RateLimitTimeout

    seen: BaseException | None = exc
    while seen is not None:
        if isinstance(seen, RateLimitTimeout | TimeoutError):
            return "deadline"
        seen = seen.__cause__
    return "unavailable"


async def _identity_from_our_base(user_id: str, name: str) -> dict | None:
    """#4419.7 — l'identité que NOTRE base porte déjà, complétée (NAF, effectif) par le registre quand il répond ;
    sinon le SIREN et le nom seuls — jamais un champ inventé."""
    from app.services import bellum_api
    from app.services.data_sources.registry_lookup import identity_by_siren

    try:
        found = await bellum_api.employer_identity(user_id, name)
    except Exception:  # noqa: BLE001 — notre base ne casse jamais la recherche
        return None
    if not found:
        return None
    siren = str(found["siren"])
    try:
        row = await identity_by_siren(siren, strict=True)
    except Exception:  # noqa: BLE001 — le registre ne casse jamais la recherche
        row = None
    return {**(row or {}), "siren": siren, "name": str((row or {}).get("name") or found.get("name") or name).strip()}


async def resolve_employer(
    name: str,
    siren: str | None = None,
    *,
    department: str | None = None,
    city: str | None = None,
    it_trade: bool = False,
    user_id: str | None = None,
) -> EmployerResolution:
    """L'identité registre d'un employeur nommé par une offre : SIREN, nom canonique, NAF, effectif, siège.
    Une homonymie non tranchée, un registre muet ou une collectivité confondue avec une société : pas
    d'identité, et le MOTIF — jamais un SIREN deviné.

    ``department`` (#4419.3) : le département de l'offre, qui tranche entre homonymes au nom équivalent.
    ``city`` / ``it_trade`` (#4419.6) : la ville de l'offre et « le métier est informatique » — départagent ce que le
    département ne tranche pas (ville du siège, puis NAF du métier, puis tête de groupe).
    La résolution est ``strict`` : une panne ou une attente refusée du registre se dit (``deadline`` /
    ``unavailable``), elle n'est plus confondue avec « le registre ne connaît pas ce nom »."""
    if siren:
        from app.services.data_sources.registry_lookup import identity_by_siren

        try:
            row = await identity_by_siren(siren, strict=True)  # #4617 — un refus n'est pas « registre muet »
        except Exception as exc:  # noqa: BLE001 — le registre ne casse jamais la recherche
            return EmployerResolution(None, _failure_of(exc))
        if not row:
            return EmployerResolution(None, "registry_silent")
        return EmployerResolution({**row, "siren": siren, "name": str(row.get("name") or name).strip()})
    from app.services.research.homonym import resolve_company_identity

    # #4674 — une entreprise n'a qu'un SIREN : le nom (normalisé) déjà résolu ne rappelle ni le registre ni le réseau.
    identity_key = normalize_employer_name(name)
    hit = await provider_cache.get_json(_IDENTITY_NAMESPACE, identity_key) if identity_key else None
    if isinstance(hit, dict) and len(str(hit.get("siren") or "")) == 9:
        return EmployerResolution(hit)
    # #4419.7 — NOTRE base d'abord (comptes de l'espace avec SIREN, puis base commune) : un nom présent avec un seul
    # SIREN est une identité. Sans appelant, aucune lecture ; ambigu ou inconnu, le registre public prend le relais.
    if user_id:
        known = await _identity_from_our_base(user_id, name)
        if known:
            return EmployerResolution(known)
    registry_name = employer_registry_name(name)
    try:
        resolution = await resolve_company_identity(name, strict=True)
        if resolution.status == "none" and registry_name != name:
            # #4712 — le nom d'une annonce n'est pas une raison sociale : on retente avec la MARQUE, par le même barème.
            resolution = await resolve_company_identity(registry_name, strict=True)
    except Exception as exc:  # noqa: BLE001 — le registre ne casse jamais la recherche
        return EmployerResolution(None, _failure_of(exc))
    selected = "".join(ch for ch in str(resolution.selected_siren or "") if ch.isdigit())
    scored = next((c for c in resolution.candidates if c.siren == selected), None) if len(selected) == 9 else None
    tiebroken = False
    if scored is None and resolution.status == "ambiguous":
        scored = _place_tiebreak(resolution, department)
        tiebroken = scored is not None
        if scored is None and department:
            # #4712 — l'ÉTABLISSEMENT sur place tranche : le lieu part à la recherche, il ne filtre pas huit candidats.
            try:
                local = await resolve_company_identity(registry_name, strict=True, department=department)
            except Exception as exc:  # noqa: BLE001 — le registre ne casse jamais la recherche
                return EmployerResolution(None, _failure_of(exc))
            scored, on_site = _site_tiebreak(local)
            tiebroken = scored is not None
            if scored is None and on_site > 1:
                scored = _refine_tiebreak(resolution, city, it_trade)
                tiebroken = scored is not None
                if scored is None:
                    return EmployerResolution(None, "homonym_on_site", _homonym_candidates(resolution))
        if scored is None:
            scored = _refine_tiebreak(resolution, city, it_trade)  # #4419.6
            tiebroken = scored is not None
        if scored is None:
            return EmployerResolution(None, "homonym", _homonym_candidates(resolution))
    if scored is None:
        return EmployerResolution(None, "brand_or_program" if registry_name != name else "registry_silent")
    if public_administration_mismatch(name, scored.name):
        return EmployerResolution(None, "public_administration")
    identity = {
            "siren": scored.siren,
            "name": scored.name,
            "nafCode": scored.naf_code,
            "sector": scored.naf_label,
            "city": scored.city,
            "department": scored.department,
            "headcountTranche": scored.headcount_tranche,
            "sizeClass": scored.size_class,
            "establishmentCount": scored.establishment_count,
            "creationDate": scored.creation_date,
            "legalCategory": scored.legal_category,
        }
    # Un échec n'est jamais rangé ; un homonyme tranché par LE LIEU de l'offre non plus (il dépend de la recherche).
    if identity_key and not tiebroken:
        await provider_cache.set_json(_IDENTITY_NAMESPACE, identity_key, identity, provider_cache.TTL_EMPLOYER_IDENTITY)
    return EmployerResolution(identity)


# ── La moisson ───────────────────────────────────────────────────────────────────────────────────


#: #4419.1 — les motifs de rejet d'une offre à la moisson (l'ordre est celui des contrôles).
_OFFER_REJECTS = ("anonymous", "tooOld", "internship", "skillAbsent", "outsideTrade", "outsideZone")
_SOURCES = ("france_travail", "adzuna", "cache")
_ALL_SOURCES = (*_SOURCES, *_PAID_SOURCES)


def _source_stats() -> dict[str, Any]:
    return {
        "received": 0,
        "kept": 0,
        "rejected": dict.fromkeys(_OFFER_REJECTS, 0),
        "paid": 0,
        "cached": 0,
        "notAttempted": 0,
        # #4420 — pourquoi la source n'a rien rendu (``coverage_matrix.failure_cause``) : compteurs seulement.
        "causes": {},
    }


@dataclass
class SkillHarvest:
    offers: list[dict] = field(default_factory=list)
    #: Sources interrogées / tombées (pour dire « sources indisponibles » plutôt que « aucune offre »).
    tried: int = 0
    failed: int = 0
    calls: dict[str, int] = field(default_factory=dict)
    #: #4419.1 — offres reçues PAR source (avant tout tri) et rejets par motif.
    received: dict[str, int] = field(default_factory=lambda: dict.fromkeys(_SOURCES, 0))
    rejected: dict[str, int] = field(default_factory=lambda: dict.fromkeys(_OFFER_REJECTS, 0))
    #: Lectures coupées par le budget de temps (≠ ``failed`` : la source n'est pas tombée, on a cessé d'attendre).
    cut: int = 0
    from_cache: bool = False
    #: #4419 — le compteur PAR SOURCE : reçues, retenues, rejets par motif, appels payés, servis par le cache 30 j,
    #: non tentés (plafond d'achats). Une source neuve entre ICI, sinon elle est invisible.
    by_source: dict[str, dict[str, Any]] = field(default_factory=lambda: {s: _source_stats() for s in _ALL_SOURCES})
    paid_total: int = 0
    #: #5009.1 — le TOTAL « trouvées » que chaque source a RENDU (compte), cumulé sur les compétences. Absent = inconnu.
    totals: dict[str, int] = field(default_factory=dict)
    #: #5009.1 — sources dont AU MOINS une lecture n'a rendu aucun total (ou n'en rend jamais) : jamais de total partiel.
    no_total: set[str] = field(default_factory=set)
    #: Louis 01/11/2026 — crédits TheirStack de CETTE recherche (réservés avant l'appel, ajustés au rendu réel) et nombre
    #: de compétences qui se partagent ``THEIRSTACK_CREDITS_PER_SEARCH_MAX``.
    theirstack_ledger: list[int] = field(default_factory=lambda: [0])
    theirstack_skills: int = 1

    @property
    def theirstack_credits(self) -> int:
        return self.theirstack_ledger[0]

    @theirstack_credits.setter
    def theirstack_credits(self, value: int) -> None:
        self.theirstack_ledger[0] = value

    def theirstack_share(self) -> int:
        """Part de CHAQUE compétence : le budget divisé par le nombre de compétences, plancher 25 (une ne prend pas tout)."""
        return max(_THEIRSTACK_SHARE_FLOOR, THEIRSTACK_CREDITS_PER_SEARCH_MAX // max(1, self.theirstack_skills))

    def reserve_theirstack(self, credits: int) -> bool:
        """Réserve ``credits`` AVANT l'``await`` (les compétences tournent en parallèle : réserver puis ajuster, jamais
        lire puis écrire après l'attente). ``False`` : le budget de la recherche n'y suffit pas, l'appel ne part pas."""
        if self.theirstack_credits + credits > THEIRSTACK_CREDITS_PER_SEARCH_MAX:
            return False
        self.theirstack_credits += credits
        return True


def _count_cause(harvest: SkillHarvest, source: str, cause: str) -> None:
    causes = harvest.by_source[source].setdefault("causes", {})
    causes[cause] = causes.get(cause, 0) + 1


def _trade_key(profile: Mapping[str, Any]) -> str:
    """Le tri métier du vendeur (pack d'offres, tous métiers ou IT) — jamais un espace."""
    from app.services.domain_job_filters import recruits_for_clients
    from app.services.offer_domains.base import normalize_offer_domain

    pack = normalize_offer_domain((profile or {}).get("offerDomain")) or "esn_it"
    roles = "all" if recruits_for_clients(dict(profile or {})) else "it"
    return f"{pack}|{roles}"


def _harvest_key(
    skills: Sequence[str], zone: Sequence[str], profile: Mapping[str, Any], circle: tuple[str, float] | None = None
) -> str:
    """(compétences pliées, zone, tri métier du vendeur[, commune + rayon]) — jamais un espace : la clé n'en porte aucun.
    #4675 — le cercle fait partie de la clé : « Lille 100 km » et « Lille 30 km » lisent la même zone, pas la même moisson."""
    parts = [",".join(sorted(_fold(s) for s in skills)), ",".join(sorted(zone)), _trade_key(profile)]
    if circle:
        parts.append(f"{circle[0]}:{circle[1]:g}")
    raw = "|".join(parts)
    return f"{HARVEST_KEY_VERSION}|" + hashlib.sha256((raw + _window_suffix()).encode()).hexdigest()[:24]


async def _harvest_cache_get(key: str) -> dict | None:
    hit = await provider_cache.get_json(_HARVEST_NAMESPACE, key)
    return hit if isinstance(hit, dict) and isinstance(hit.get("offers"), list) else None


async def _harvest_cache_put(key: str, harvest: SkillHarvest) -> None:
    # Une moisson dont une source est tombée, ou coupée par le délai, n'est pas rangée : elle n'a pas tout dit.
    if harvest.failed == 0 and harvest.cut == 0:
        await provider_cache.set_json(
            _HARVEST_NAMESPACE,
            key,
            {
                "offers": harvest.offers,
                "tried": harvest.tried,
                "calls": harvest.calls,
                "received": harvest.received,
                "rejected": harvest.rejected,
                "bySource": harvest.by_source,
                "totals": harvest.totals,
                "noTotal": sorted(harvest.no_total),
            },
            provider_cache.TTL_TERRITORY,
        )


#: #4469 — « Saint-Cloud », « St Cloud », « Sainte-Maxime » : un toponyme composé (``saint``/``sainte``/``st``/``ste``
#: + nom) n'est pas une compétence. Lu sur le texte plié (``_fold`` : tirets et apostrophes = espaces).
_COMPOUND_PLACE = re.compile(
    r"\b(?:saint|sainte|st|ste)\s+[a-z0-9]+(?:\s+(?:sur|sous|en|les|le|la|de|du|des)\s+[a-z0-9]+)?"
)


def _without(text: str, *names: object) -> str:
    """``text`` (plié) privé de chaque ``names`` (plié) qu'il cite en mots entiers."""
    for name in names:
        folded = _fold(name)
        if folded:
            text = re.sub(rf"(?<![a-z0-9]){re.escape(folded)}(?![a-z0-9])", " ", text)
    return text


def offer_trade_text(offer: Mapping[str, Any]) -> str:
    """#4469 — ce qui dit le MÉTIER d'une offre : intitulé + description, privés de tout ce qui dit OÙ et POUR QUI
    (ville, lieu, toponyme composé « Saint-X », nom de l'employeur). Une compétence ne se lit que là."""
    places = [offer.get("city"), *(offer.get("area") if isinstance(offer.get("area"), list) else [])]
    places += [part for city in places[:1] for part in re.split(r"[,›>(]", str(city or ""))]
    title = _COMPOUND_PLACE.sub(" ", _without(_fold(offer.get("title")), *places))
    body = _without(_fold(offer.get("description")), *places, offer.get("employer"))
    # #4419.23 bis — les compétences que l'offre LISTE disent son métier autant que son intitulé.
    listed = offer.get("skills") if isinstance(offer.get("skills"), list) else []
    skills = " ".join(_fold(s) for s in listed if isinstance(s, str))
    return f"{title} {_COMPOUND_PLACE.sub(' ', body)} {skills}"


def _names_skill(wanted: str, text: object) -> bool:
    """#4419.23 bis — l'offre écrit la compétence sous une de ses formes du RÉFÉRENTIEL (« Vue 3 », « VueJS »,
    « Vue.js » pour « Vue.js » tapé) : un mot ou deux mots consécutifs dont la canonique est la compétence voulue.
    Seules les écritures déclarées comptent (alias du référentiel #4434) — jamais un voisin deviné."""
    from app.services.criteria_referential import _canonical_by_alias, normalise_skill_text

    table = _canonical_by_alias()
    words = [w.strip("./") for w in normalise_skill_text(text).split()]
    words = [w for w in words if w]
    for i, word in enumerate(words):
        if table.get(word) == wanted or (i + 1 < len(words) and table.get(f"{word} {words[i + 1]}") == wanted):
            return True
    return False


#: #4419 — compétences dont une écriture déclarée est AUSSI un mot français courant : « Vue.js » s'écrit « vue »,
#: mais « en vue de l'ouverture » (une boulangerie) n'est jamais la compétence. Le mot nu ne vaut que dans une phrase
#: qui parle d'informatique ; la forme technique (``vue.js``, ``vuejs``, ``vue 3``, ``vue3``) vaut toujours.
_COMMON_WORD_ALIASES: dict[str, tuple[str, ...]] = {"vue.js": ("vue",)}
#: Locutions françaises avec « vue » (lues sur le texte plié : apostrophes et tirets = espaces).
_FRENCH_VUE_IDIOMS = re.compile(
    r"\b(?:en vue|point de vue|a vue|mise en vue|vue d ensemble|vue generale|vue sur|vue mer|vue imprenable|"
    r"vue panoramique|vue degagee|vue exterieure|vue interieure|belle vue|bonne vue|une vue|la vue|les vues|des vues)\b"
)
_VUE_TECHNICAL = re.compile(r"(?<![a-z0-9])(?:vue\.js|vuejs|vue\d+(?:\.\d+)*|vue (?:js|\d+(?:\.\d+)*))(?![a-z0-9])")
_IT_CONTEXT = frozenset(
    {"javascript", "typescript", "js", "ts", "frontend", "front", "react", "angular", "nuxt", "vuex", "pinia", "html"}
    | {"css", "node", "nodejs", "web", "developpeur", "developer", "dev", "ingenieur", "integrateur", "fullstack"}
    | {"webpack", "vite", "spa"}
)


def _names_common_word_skill(wanted: str, text: object) -> bool | None:
    """``None`` : la compétence n'a pas d'écriture ambiguë (lecture ordinaire). Sinon vrai seulement pour la forme
    technique, ou pour le mot nu HORS locution française ET dans un contexte informatique."""
    aliases = _COMMON_WORD_ALIASES.get(wanted)
    if not aliases:
        return None
    folded = _fold(text)
    if _VUE_TECHNICAL.search(folded):
        return True
    bare = _FRENCH_VUE_IDIOMS.sub(" ", folded).split()
    return any(alias in bare for alias in aliases) and any(word in _IT_CONTEXT for word in bare)


def _mentions(term: str, text: object) -> bool:
    """#4400.1 — la compétence tapée est lue SOUPLEMENT (préfixe, casse, accents, pluriel, abréviations, ET).

    #4469 (famille) — une compétence du RÉFÉRENTIEL ne se lit que comme elle-même : « java » n'est pas le préfixe de
    « JavaScript » (une autre compétence, un autre métier). Un mot qui en commence un autre et que le référentiel
    range ailleurs ne compte pas ; « JavaEE », « ReactJS » (non rangés, ou rangés sous la même compétence) restent lus."""
    wanted = canonical_skill(term)
    ambiguous = _names_common_word_skill(wanted, text) if wanted else None
    if ambiguous is not None:
        return ambiguous
    if wanted and _names_skill(wanted, text):
        return True
    if not matches_flexible_query(term, text):
        return False
    tokens = search_tokens(term)
    if not wanted or len(tokens) != 1 or lexicon_expands(tokens[0]):
        return True
    token = tokens[0]
    return any(
        word == token or (word.startswith(token) and canonical_skill(word) in (None, wanted))
        for word in search_tokens(text)
    )


def _is_it_skill(term: str) -> bool:
    """La compétence tapée est une compétence du référentiel INFORMATIQUE (toutes, sauf la famille QHSE)."""
    from app.services.criteria_referential import referential

    wanted = canonical_skill(term)
    entry = (referential().get("skills") or {}).get(wanted) if wanted else None
    return bool(entry) and entry.get("family") != "qhse"


def _reject_reason(
    offer: Mapping[str, Any],
    term: str,
    zone: frozenset[str],
    cutoff: date,
    pack: str | None,
    all_roles: bool,
    has_profile: bool = True,
    written: str | None = None,
) -> str | None:
    """#4419.1 — ``None`` = offre retenue ; sinon le motif du rejet (``_OFFER_REJECTS``).

    #4579 — ``written`` : l'écriture sous laquelle la source a été interrogée (« j2ee » pour « java »). Une offre
    qui cite cette écriture cite la compétence ; elle se lit comme elle, jamais comme une autre."""
    from app.services.data_sources.france_travail import is_domain_offer, is_it_offer

    if not str(offer.get("employer") or "").strip() and not offer.get("siren"):
        return "anonymous"  # offre anonyme : aucun compte à prospecter, on n'invente pas
    published = _offer_date(offer.get("date"))
    if offer.get("source") == "cache" or offer.get("fromCache"):
        # #4419.25 — un besoin déjà collecté reste une preuve DATÉE jusqu'à un an.
        cutoff = cutoff - timedelta(days=SKILL_CACHED_OFFER_MAX_AGE_DAYS - SKILL_OFFER_MAX_AGE_DAYS)
    if published is None or published < cutoff:
        return "tooOld"
    title = str(offer.get("title") or "")
    if is_internship_posting(title, offer.get("contractType")):
        return "internship"
    # #4469 — TOUTES les sources : « termChecked » (France Travail a cherché le mot) ne dispense plus du contrôle,
    # car cette recherche matche aussi le lieu et l'employeur (cloud → Saint-Cloud).
    trade_text = offer_trade_text(offer)
    if not _mentions(term, trade_text) and not (written and _mentions(written, trade_text)):
        return "skillAbsent"
    # #4284.1 — le tri métier s'applique à TOUTES les offres. « termChecked » (France Travail a cherché le mot) ne
    # dit rien du MÉTIER : sauter ce contrôle laissait passer, mesuré le 25/10, 59 offres sur 59 (``outsideTrade 0``).
    view = {**offer, "intitule": title, "romeCode": offer.get("romeCode"), "romeLibelle": offer.get("romeLabel")}
    # Sans profil exploitable, il n'y a rien à comparer (#3901) : le métier du vendeur ne juge pas.
    if has_profile and not is_domain_offer(view, pack=pack, all_roles=all_roles):
        return "outsideTrade"
    # Une compétence INFORMATIQUE tapée cherche un poste informatique, même pour un placeur « tous métiers » :
    # « vue » est aussi un mot français (« en vue de », « vue d'ensemble ») qui valide « Vue.js » dans une boulangerie.
    if (all_roles or not has_profile) and _is_it_skill(term) and not is_it_offer(view):
        return "outsideTrade"
    dept = str(offer.get("department") or "").strip().upper()
    return "outsideZone" if zone and dept and dept not in zone else None


def _offer_key(offer: Mapping[str, Any]) -> str:
    """L'identité d'une offre : son lien, sinon (employeur, intitulé, date) — la même offre lue deux fois est une."""
    return (
        str(offer.get("url") or "") or f"{_fold(offer.get('employer'))}|{_fold(offer.get('title'))}|{offer.get('date')}"
    )


async def _national_france_travail(term: str, profile: Mapping[str, Any], harvest: SkillHarvest) -> list[dict]:
    """#4419.2 — la lecture nationale paginée : page suivante tant que la précédente était pleine.
    Chaque page lue compte un appel (``harvest.calls``)."""
    offers: list[dict] = []
    for page in range(SKILL_FT_NATIONAL_PAGES):
        harvest.calls["france_travail"] += 1
        rows = await france_travail_offers(term, None, profile, page=page)
        offers.extend(rows or [])
        if len(rows or []) < _FT_NATIONAL_FULL_PAGE:
            break
    return offers


#: Une page nationale qui rend au moins autant de lignes est « pleine » : la suivante a des chances d'exister.
_FT_NATIONAL_FULL_PAGE = 100


async def _department_france_travail(
    term: str,
    department: str | None,
    profile: Mapping[str, Any],
    harvest: SkillHarvest,
    *,
    deadline: float | None,
    **circle: Any,
) -> list[dict]:
    """#4675 — la lecture départementale (ou en cercle, ``circle`` = commune + distance) paginée : page suivante tant
    que la précédente était pleine, bornée par ``SKILL_FT_DEPARTMENT_PAGES`` et par le budget de temps. Ce qui n'a pas
    été lu est DIT : le temps compte une lecture coupée (``harvest.cut``), le plafond ``causes.pageCeiling``.
    La page 0 est comptée en amont (comme avant) ; chaque page suivante compte un appel ici."""
    offers: list[dict] = []
    for page in range(SKILL_FT_DEPARTMENT_PAGES):
        if page:
            if deadline is not None and time.monotonic() >= deadline:
                harvest.cut += 1
                return offers
            harvest.calls["france_travail"] += 1
        extra = {"page": page} if page else {}
        rows = await france_travail_offers(term, department, profile, **extra, **circle)
        offers.extend(rows or [])
        if len(rows or []) < _FT_NATIONAL_FULL_PAGE:
            return offers
    _count_cause(harvest, "france_travail", "pageCeiling")
    return offers


async def _circle_france_travail(
    term: str,
    zone: Sequence[str],
    profile: Mapping[str, Any],
    harvest: SkillHarvest,
    *,
    deadline: float | None,
    commune_code: str,
    radius_km: float,
) -> list[dict]:
    """#4675 — le rayon d'une ville part à la source (``commune`` + ``distance``). Si la source refuse la maille fine
    et rend le département entier (``coarseFallback``), les AUTRES départements du cercle sont lus un à un :
    sans cela ils ne seraient jamais lus, en silence."""
    circle = {"commune": commune_code, "distance": int(radius_km)}
    offers = await _department_france_travail(term, None, profile, harvest, deadline=deadline, **circle)
    if not any(o.get("coarseFallback") for o in offers):
        return offers
    _count_cause(harvest, "france_travail", "coarseFallback")
    harvest.no_total.add("france_travail")  # #5009.1 — le total du département n'est pas celui du cercle demandé
    for dept in zone:
        harvest.calls["france_travail"] += 1
        offers.extend(await france_travail_offers(term, dept, profile) or [])
    return offers


async def harvest_skill_offers(
    skills: Sequence[str],
    zone: Sequence[str],
    profile: Mapping[str, Any],
    *,
    deadline: float | None,
    commune_code: str | None = None,
    radius_km: float | None = None,
) -> SkillHarvest:
    """Les offres < 90 j qui citent la compétence dans la zone, toutes sources gratuites réunies.

    #4675 — ``commune_code`` + ``radius_km`` (une ville et son rayon, jamais « Lille seule » ni un département) :
    France Travail lit le cercle lui-même ; ``zone`` porte déjà les départements que le cercle recouvre."""
    from app.services.domain_job_filters import recruits_for_clients
    from app.services.offer_domains.base import normalize_offer_domain

    # #4519.19 — une expertise part en MÉTIERS (data engineer, data scientist…), jamais en libellé littéral.
    skills = harvest_terms(skills)
    circle = (commune_code, radius_km) if commune_code and radius_km else None
    key = _harvest_key(skills, zone, profile, circle)
    cached = await _harvest_cache_get(key)
    if cached is not None:
        return SkillHarvest(
            offers=list(cached["offers"]),
            tried=int(cached.get("tried") or 0),
            calls=dict(cached.get("calls") or {}),
            received={**dict.fromkeys(_SOURCES, 0), **dict(cached.get("received") or {})},
            rejected={**dict.fromkeys(_OFFER_REJECTS, 0), **dict(cached.get("rejected") or {})},
            from_cache=True,
            totals={k: int(v) for k, v in dict(cached.get("totals") or {}).items() if _is_count(v)},
            no_total=set(cached.get("noTotal") or []),
            by_source={
                **{src: _source_stats() for src in _ALL_SOURCES},
                **{k: v for k, v in dict(cached.get("bySource") or {}).items() if isinstance(v, dict)},
            },
        )

    zone_set = frozenset(zone)
    # #4419.2 — une région entière se lit département par département ; au-delà, la France paginée.
    by_department = 0 < len(zone) <= SKILL_FT_MAX_DEPARTMENTS
    harvest = SkillHarvest(
        calls=dict.fromkeys(_SOURCES, 0),
        theirstack_ledger=_credits_override.get() or [0],
        theirstack_skills=max(1, len(skills)),
    )
    jobs: list[tuple[str, str, str | None, Any]] = []
    _total_harvest.set(harvest)
    harvest.no_total.add("cache")  # #5009.1 — la base commune ne publie pas de total (lecture bornée par ``_CACHE_SEARCH_LIMIT``)
    for term in skills:
        # #4400.1 — la source cherche des MOTS entiers : « archi cyber » n'est le mot d'aucune offre. La forme
        # étendue (« architecte cybersécurité ») part EN PLUS de la saisie ; l'offre garde la compétence tapée.
        # #4579 — une annonce écrit « Vue.js », « VueJS », « Vue 3 », presque jamais « Vue » : la compétence part aussi
        # sous ses écritures du référentiel. Elles s'ajoutent APRÈS le plafond des compétences demandées (déjà
        # appliqué par ``skill_terms``) : décliner « vue » ne prend aucune place à « java ». Inconnue : telle quelle.
        typed, written = searched_forms(term)
        for asked in [*typed, *written]:
            # ``None`` = la saisie ou sa forme étendue ; sinon l'écriture déclinée, lue comme la compétence tapée.
            declined = asked if asked in written else None
            # #5009.1 — le total ne se lit que sur la compétence TAPÉE : ses écritures déclinées recoupent ses offres.
            counts = bool(typed) and asked == typed[0] and declined is None
            if by_department and circle:
                jobs.append(
                    (
                        "france_travail",
                        term,
                        declined,
                        _counting(
                            _circle_france_travail(
                                asked, zone, profile, harvest, deadline=deadline, commune_code=circle[0], radius_km=circle[1]
                            ),
                            counts,
                        ),
                    )
                )
            elif by_department:
                for dept in zone:
                    jobs.append(
                        (
                            "france_travail",
                            term,
                            declined,
                            _counting(_department_france_travail(asked, dept, profile, harvest, deadline=deadline), counts),
                        )
                    )
            else:
                jobs.append(("france_travail", term, declined, _counting(_national_france_travail(asked, profile, harvest), counts)))
            # #4676 — une zone de quelques départements part à Adzuna département par département (``where``) ;
            # plus large, ou nationale : la France, comme avant.
            adzuna_depts = sorted(zone) if 0 < len(zone) <= SKILL_ADZUNA_MAX_DEPARTMENTS else [None]
            for dept in adzuna_depts:
                jobs.append(("adzuna", term, declined, _counting(adzuna_offers(asked, dept), counts)))
            jobs.append(("cache", term, declined, cached_offers(asked, zone_set)))
        # #4419 — les sources payantes cherchent la compétence TAPÉE (une page, 30 j de cache, plafond d'achats) ;
        # l'ordre (compétence par compétence, trois sources) répartit le plafond entre les sources.
        # #4676 — la compétence tapée ET ses écritures déclinées (``written``, lues dans ``searched_forms``, jamais une
        # seconde liste) partent DANS le même appel payé (listes de titres) : aucun appel de plus. L'offre se lit sous
        # le terme tapé (``None``). La zone voyage vers les sources dont le contrat la documente.
        for source in _PAID_SOURCES:
            jobs.append((source, term, None, paid_skill_offers(source, term, harvest, zone, written)))
    # #4419.2 — le budget d'appels se COMPTE (#4305) : une lecture départementale = un appel, une page nationale
    # aussi (comptée par ``_national_france_travail``, qui s'arrête à la première page incomplète).
    for source, _term, _written, _coro in jobs:
        if source in _PAID_SOURCES:
            continue  # compté à l'appel PAYÉ (le cache et le plafond n'en sont pas)
        if source != "france_travail" or by_department:
            harvest.calls[source] += 1
    remaining = None if deadline is None else max(0.1, deadline - time.monotonic())
    adzuna_diag: dict[str, int] = {}
    _adzuna_diag.set(adzuna_diag)
    gathered = await asyncio.gather(
        *(asyncio.wait_for(coro, remaining) for _s, _t, _w, coro in jobs), return_exceptions=True
    )
    harvest.by_source["adzuna"].update(adzuna_diag)

    pack = normalize_offer_domain((profile or {}).get("offerDomain"))
    all_roles = recruits_for_clients(dict(profile or {}))
    cutoff = (datetime.now(UTC) - timedelta(days=_age_days())).date()
    seen: set[str] = set()
    #: #4579 — la même offre lue sous deux écritures (vue, vuejs) est UNE offre reçue : aucun compteur gonflé.
    received_seen: set[tuple[str, str]] = set()
    #: #4579 (vague IX) — le motif de rejet DÉJÀ compté pour une offre, par source : au plus un par offre.
    rejected_once: dict[tuple[str, str], str] = {}
    for (source, term, written, _coro), result in zip(jobs, gathered, strict=True):
        if result is None:
            # Source non configurée (ou plafond d'achats atteint) : rien n'a été lu, ni appel ni « tentée ».
            # Les sources PAYANTES ne sont pas pré-comptées (leur appel se compte à l'achat) : rien à défalquer.
            if source in _PAID_SOURCES:
                harvest.no_total.add(source)  # #5009.1 — une compétence non lue : le total de la source serait partiel
            if source not in _PAID_SOURCES:
                harvest.calls[source] -= 1
                _count_cause(harvest, source, "noKey")  # #4420 — seule Adzuna rend ``None`` (les payantes se comptent à l'appel)
            continue
        harvest.tried += 1
        if isinstance(result, BaseException):
            if isinstance(result, asyncio.CancelledError):
                raise result
            harvest.no_total.add(source)  # #5009.1 — lecture tombée ou coupée : le total de la source serait partiel
            _count_cause(harvest, source, failure_cause(result))
            if isinstance(result, TimeoutError):
                harvest.cut += 1
                logger.info("COMPETENCE-TROUVE — source %s coupée par le délai", source)
            else:
                harvest.failed += 1
                logger.info("COMPETENCE-TROUVE — source %s tombée : %s", source, type(result).__name__)
            continue
        rows = [offer for offer in result or [] if isinstance(offer, Mapping)]
        stats = harvest.by_source[source]
        for raw in rows:
            if (source, _offer_key(raw)) not in received_seen:
                received_seen.add((source, _offer_key(raw)))
                # #4579 + #4419 — « reçue » se compte UNE fois par offre (dédoublonnée entre écritures) et aux DEUX
                # compteurs : le total par source et le détail `by_source`, qui doivent dire le même nombre.
                harvest.received[source] = harvest.received.get(source, 0) + 1
                stats["received"] += 1
            # #4419.5 — une offre sans département prend le lieu que l'agrégateur publie, avant le siège.
            place = offer_department(raw)
            offer = {**raw, "department": place} if place and not raw.get("department") else raw
            reason = _reject_reason(offer, term, zone_set, cutoff, pack, all_roles, bool(profile), written)
            # #4579 (vague IX) — une offre lue sous plusieurs écritures est UNE offre pour les compteurs de REJET
            # aussi, pas seulement pour « reçue ». Deux raisons de ne pas s'en passer : un rejet compté quatre fois
            # ferait lire « 12 hors zone » là où 3 offres ont été écartées, et le verdict DÉPEND de l'écriture
            # (« Développeur VueJS » est `skillAbsent` sous « vue », retenue sous « vuejs »). Donc : au plus UN rejet
            # par offre et par source, et l'écriture suivante qui la RETIENT annule le rejet déjà compté — sinon on
            # lirait un rejet pour une offre finalement rendue. Les compteurs sont lus comme un diagnostic.
            deja_rejetee = rejected_once.get((source, _offer_key(offer)))
            if reason is not None:
                if deja_rejetee is None:
                    rejected_once[(source, _offer_key(offer))] = reason
                    harvest.rejected[reason] += 1
                    stats["rejected"][reason] += 1
                continue
            if deja_rejetee is not None:
                harvest.rejected[deja_rejetee] -= 1
                stats["rejected"][deja_rejetee] -= 1
                del rejected_once[(source, _offer_key(offer))]
            dedup = _offer_key(offer)
            if dedup in seen:
                continue
            seen.add(dedup)
            stats["kept"] += 1
            harvest.offers.append({**offer, "skill": term})
    await _harvest_cache_put(key, harvest)
    return harvest


# ── Les employeurs ───────────────────────────────────────────────────────────────────────────────


@dataclass
class SkillAccounts:
    #: Clients finaux, au format d'une ligne registre + ``skillEvidence``.
    accounts: list[dict] = field(default_factory=list)
    #: Cabinets de recrutement et ESN qui recrutent sur la compétence.
    intermediaries: list[dict] = field(default_factory=list)
    info: dict[str, Any] = field(default_factory=dict)
    #: #4674 — employeurs PROUVÉS par une offre dont l'identité registre n'est pas (encore) établie : ni SIREN, ni
    #: fiche — le nom de l'annonce, la ville et la date de l'offre, un état d'identité nommé. Jamais dans ``accounts``.
    pending: list[dict] = field(default_factory=list)


#: #4419.1 — motif d'échec de résolution (``EmployerResolution.failure``) → clé du compteur.
_RESOLUTION_FAILURES = {
    "homonym": "homonym",
    # #4712 — les motifs FINAUX : plusieurs entités du groupe recrutent sur place ; marque ou programme sans entité.
    "homonym_on_site": "homonym",
    "brand_or_program": "registrySilent",
    "registry_silent": "registrySilent",
    "public_administration": "publicAdministration",
    "unavailable": "unavailable",
}


def _latest(offers: Sequence[Mapping[str, Any]]) -> Mapping[str, Any]:
    return max(offers, key=lambda o: str(o.get("date") or ""))


def _found_in(offer: Mapping[str, Any]) -> str | None:
    """#4469 — OÙ le mot cherché se lit dans l'offre : ``title`` (l'intitulé), ``description`` (le corps ou les
    compétences listées) ou ``None`` (on ne sait pas dire — jamais deviné). Lieu et employeur ne comptent pas."""
    term = str(offer.get("skill") or "").strip()
    if not term:
        return None
    if _mentions(term, offer_trade_text({**offer, "description": None, "skills": None})):
        return "title"
    return "description" if _mentions(term, offer_trade_text(offer)) else None


#: #4421.3 — les offres datées qu'un compte porte comme BESOINS (« jusqu'à ~10 »), la plus récente d'abord.
EVIDENCE_OFFERS_MAX = 10


def _evidence(offers: Sequence[Mapping[str, Any]]) -> dict[str, Any]:
    latest = _latest(offers)
    dated = sorted(
        (o for o in offers if str(o.get("date") or "").strip()), key=lambda o: str(o.get("date")), reverse=True
    )
    return {
        "skill": latest.get("skill"),
        "offerCount": len(offers),
        # #4664 — chaque offre porte le lien de SON annonce (le tiroir « Aperçu du compte » rend la preuve auditable).
        # #4421.3 — la SOURCE ne voyage pas ici (doctrine : nos fournisseurs ne se nomment jamais) ; l'URL, elle, est
        # lue par l'écran seul — les cartes de Laura n'en rendent aucune.
        "offers": [
            {
                key: str(o.get(key))[:10] if key == "date" else o.get(key)
                for key in ("title", "city", "date", "skill", "url", "contractType")
                if o.get(key)
            }
            for o in dated[:EVIDENCE_OFFERS_MAX]
        ],
        "latestOffer": {
            "title": latest.get("title") or None,
            "city": complete_offer_place(latest.get("city")),
            "date": str(latest.get("date") or "")[:10] or None,
            "url": latest.get("url") or None,
            # #5000.2 — le contrat que l'annonce DÉCLARE (jamais lu dans l'intitulé) ; None = non déclaré.
            "contractType": str(latest.get("contractType") or "").strip() or None,
            # Dans la DONNÉE seulement : l'écran ne nomme jamais une source (doctrine).
            "source": latest.get("source") or None,
            # #4469 — l'écran dit « mot trouvé dans la description » quand l'intitulé ne le porte pas.
            "foundIn": _found_in(latest),
        },
    }


def intermediary_kind(name: object, naf: object) -> str | None:
    """``recruiter`` (cabinet / plateforme), ``esn`` (ESN, conseil IT — un concurrent), ou ``None``
    (client final). Les listes vivent dans ``intermediation`` et ``esn_naf`` (GA-26)."""
    from app.services.company_archetype import is_known_esn_name

    if is_intermediated_employer(name=name, naf=naf):
        return "recruiter"
    # #4814.1 — intérim, VMS, MSP, apporteur d'affaires : jamais un client final (arbitrage Louis 31/10) ; les
    # mêmes prédicats que `actor_typology` (GA-26), qui ne servaient qu'au mode Signaux.
    if is_temp_agency(name=name, naf=naf) or looks_like_vms(name) or looks_like_msp(name) or looks_like_broker(name):
        return "recruiter"
    if is_esn_naf_code(naf) is True or is_known_esn_name(name):
        return "esn"
    return None


def offers_total(harvest: SkillHarvest) -> tuple[int, bool] | None:
    """#5009.1 (décision du 03/11) — « M trouvées » : ``(M, borne_basse)``, ou None.

    Dès qu'AU MOINS UNE source lue publie un total COHÉRENT (≥ ses offres lues), M = somme de ces totaux + les offres
    lues des sources sans total (ou au total incohérent). ``borne_basse`` est vrai dès qu'une source lue n'a pas de
    total : M n'est alors jamais présenté comme complet. Aucune source lue avec total ⇒ None (jamais estimé, jamais 0).
    M ≥ N lues par construction."""
    read = {name: n for name, n in harvest.received.items() if n}
    with_total = {
        name: harvest.totals[name]
        for name, n in read.items()
        if name in harvest.totals and name not in harvest.no_total and harvest.totals[name] >= n
    }
    if not with_total:
        return None
    total = sum(with_total.values()) + sum(n for name, n in read.items() if name not in with_total)
    return total, len(with_total) < len(read)


def _public_stats(stats: Mapping[str, Any]) -> dict[str, Any]:
    return {k: (dict(v) if isinstance(v, Mapping) else v) for k, v in stats.items()}


def _log_stats(stats: Mapping[str, Any]) -> str:
    """Une source sur une ligne : ``reçues/retenues rejets={motif: n} payés=n cache=n non_tentés=n`` (jamais un contenu)."""
    rejected = {k: v for k, v in dict(stats.get("rejected") or {}).items() if v}
    return (
        f"{stats.get('received', 0)}/{stats.get('kept', 0)} rejets={rejected} payés={stats.get('paid', 0)} "
        f"cache={stats.get('cached', 0)} non_tentés={stats.get('notAttempted', 0)}"
    )


def _empty_cause(accounts: list[dict], intermediaries: list[dict], harvest: SkillHarvest) -> str | None:
    if accounts:
        return None
    if intermediaries:
        return "only_intermediaries"
    if harvest.offers:
        return "no_employer_identified"
    # #4420 — une source tombée ou coupée par le délai n'a pas lu : « aucune offre » ne se dit qu'après une lecture complète.
    if harvest.tried and (harvest.failed or harvest.cut):
        return "sources_unavailable"
    return "no_offers"


def normalize_employer_name(name: object) -> str:
    """#4674 — le nom d'un employeur pour le DÉDOUBLONNAGE : accents et ponctuation pliés, formes juridiques (SAS,
    SASU, SARL, SA, EURL, SNC) retirées — « BIHR » et « Bihr SAS » sont une entreprise. Jamais un nom vide : un nom
    réduit à sa forme juridique garde son pliage. Rien d'autre n'est retiré (« ACME SERVICES » ≠ « ACME »)."""
    folded = " ".join(re.findall(r"[a-z0-9]+", _fold(name).replace(".", "")))
    kept = " ".join(word for word in folded.split() if word not in _LEGAL_FORMS)
    return kept or folded


def _employer_group(offer: Mapping[str, Any]) -> str:
    return f"siren:{offer['siren']}" if offer.get("siren") else f"name:{normalize_employer_name(offer.get('employer'))}"


#: #4674 — l'état d'identité d'un employeur rendu sans SIREN, par motif d'échec de résolution.
_IDENTITY_STATES = {
    "homonym": "ambiguous",
    "homonym_on_site": "ambiguous",
    "registry_silent": "unmatched",
    "brand_or_program": "unmatched",
}


def _pending_employer(
    offers: Sequence[Mapping[str, Any]], failure: str | None, candidates: Sequence[Mapping[str, Any]] = ()
) -> dict[str, Any]:
    """#4674 — la ligne d'un employeur PROUVÉ par une offre dont le registre n'a pas (encore) dit le SIREN : le nom
    tel que l'annonce l'écrit (la forme la plus citée), la ville de l'offre, la preuve datée. ``identity`` :
    ``pending`` (le registre n'a pas répondu / le délai a manqué), ``ambiguous`` (homonymie non tranchée, jamais
    fusionnée), ``unmatched`` (aucune entité proche). Aucun SIREN, aucun nom présenté comme raison sociale."""
    names = [str(o.get("employer") or "").strip() for o in offers if str(o.get("employer") or "").strip()]
    name = max(sorted(set(names)), key=names.count) if names else ""
    key = _employer_group(offers[0])
    latest = _latest(offers)
    row: dict[str, Any] = {
        "id": "offer:" + hashlib.sha1(key.encode()).hexdigest()[:12],
        "name": name,
        "identity": _IDENTITY_STATES.get(failure or "", "pending"),
        "identityReason": failure or "not_attempted",
        "city": complete_offer_place(latest.get("city")),
        "skillEvidence": _evidence(offers),
    }
    # #4419.8 — « Choisir l'entreprise » : 2 à 5 candidats seulement ; un seul n'est pas un choix.
    if failure in ("homonym", "homonym_on_site") and len(candidates) >= 2:
        row["candidates"] = [dict(c) for c in candidates[:_HOMONYM_CANDIDATES_MAX]]
    return row


def offer_in_reach(
    offer: Mapping[str, Any], city: str, *, centre: tuple[float, float] | None, radius_km: float | None
) -> bool:
    """#4515 / #4641 — l'offre est-elle dans la zone d'une VILLE ? ⚠️ Règle FINALE (Louis 27/10/2026) : une ville
    cherche dans 100 km par défaut, puis département, région, PUIS la France — paliers nommés, sans arrêt ni question ;
    elle renverse l'arrêt à la région de #4429 et les 25 km de #4515.

    Lot DÉCOUVRIR-MOTEUR (27/10) — sur ce chemin, le lieu filtre sur le LIEU DE TRAVAIL de l'offre, jamais le siège
    de l'employeur, et AVANT la résolution au registre : mesure prod (``?city=Lille&technologiesObserved=vue,java``),
    le rayon affiché « 100 km » n'entrait jamais ici — seule la commune exacte passait. La commune passe toujours ;
    au-delà, la distance se mesure sur la position PUBLIÉE de l'offre. Sans position, rien ne se prouve dans le cercle
    (l'offre peut entrer au palier département, nommé). Sans rayon (« Lille seule ») : la commune, rien d'autre."""
    if offer_in_city(offer.get("city"), city):
        return True
    position = published_position(offer)
    if not centre or not radius_km or not position:
        return False
    return distance_km(centre[0], centre[1], position["latitude"], position["longitude"]) <= radius_km


@dataclass(frozen=True)
class ReachSplit:
    """#4675 — le tri d'un cercle : les offres gardées, et pourquoi les autres ne le sont pas."""

    kept: list[dict]
    #: Offres à position PUBLIÉE mais hors du cercle (≠ ``outside`` : hors zone demandée, position inconnue comprise).
    outside_circle: int
    #: Offres gardées SANS position publiée, parce que leur département est dans la zone lue.
    unpositioned: int
    #: Toutes les offres écartées (hors cercle comprises).
    outside: int


def _lieu_inconnu(offer: Mapping[str, Any]) -> bool:
    """Ni position publiée ni ville : le lieu de travail est INCONNU. Une ville connue et autre (Maubeuge pour Lille)
    n'est pas « inconnue » : elle reste écartée (Recette 21/10 B.3), jamais gardée au bénéfice du doute."""
    return not published_position(offer) and not str(offer.get("city") or "").strip()


def split_by_reach(
    offers: Sequence[dict],
    city: str,
    *,
    centre: tuple[float, float] | None,
    radius_km: float | None,
    zone: frozenset[str],
) -> ReachSplit:
    """#4675 — :func:`offer_in_reach`, plus une règle : une offre de LIEU INCONNU (ni position ni ville publiées) mais dont le département (publié
    par la source) est dans la zone lue n'est plus jetée — elle est gardée et comptée ``unpositioned``. Rien n'est
    deviné : ni ville, ni position ; sans département publié ou hors zone, elle reste écartée. Sans cercle, aucune
    offre n'entre par cette porte (« Lille seule » : la commune, rien d'autre)."""
    kept: list[dict] = []
    outside_circle = unpositioned = 0
    for offer in offers:
        if offer_in_reach(offer, city, centre=centre, radius_km=radius_km):
            kept.append(offer)
        elif centre and radius_km and _lieu_inconnu(offer) and offer_department(offer) in zone:
            kept.append(offer)
            unpositioned += 1
        elif centre and radius_km and published_position(offer):
            outside_circle += 1
    return ReachSplit(kept, outside_circle, unpositioned, len(offers) - len(kept))


def offer_in_city(offer_city: object, wanted_city: str) -> bool:
    """Recette 21/10 B.3 (Kevin) — « Lille » filtre sur LILLE : une offre dont la ville est connue et autre
    (Maubeuge, 59) n'est pas à Lille. Une ville inconnue ne passe pas non plus (on n'affiche pas ce qu'on n'a pas).
    Le préfixe « 59 - » des libellés France Travail et un suffixe d'arrondissement (« Lille 3e ») sont tolérés."""
    wanted = _fold(wanted_city)
    if not wanted:
        return True
    got = _fold(re.sub(r"^\s*\d{2,5}\s*-\s*", "", str(offer_city or "")))
    return got == wanted or got.startswith(f"{wanted} ")


@dataclass
class IdentityMemo:
    """Lot 789 (#5212) — le mémo d'identité d'UNE requête : une passe qui reprend un employeur déjà résolu par une
    passe précédente ne le redemande ni à notre base ni au registre. Les échecs transitoires (délai, panne) ne sont
    jamais rangés : une passe suivante a le droit de réessayer."""

    resolved: dict[tuple[str, str], EmployerResolution] = field(default_factory=dict)


_IDENTITY_MEMO: ContextVar[IdentityMemo | None] = ContextVar("discover_identity_memo", default=None)
_TRANSIENT_FAILURES = frozenset({"deadline", "unavailable", "not_attempted"})


_PASS_NAME: ContextVar[str] = ContextVar("discover_pass_name", default="exact")


@contextmanager
def named_pass(name: str) -> Iterator[None]:
    """Lot 789 — nomme la passe en cours pour le journal de durée (``discover pass=<nom> …``)."""
    token = _PASS_NAME.set(name)
    try:
        yield
    finally:
        _PASS_NAME.reset(token)


def begin_identity_memo() -> IdentityMemo:
    """Ouvre le mémo de la requête en cours (les tâches filles de la requête le partagent)."""
    memo = IdentityMemo()
    _IDENTITY_MEMO.set(memo)
    return memo


async def _shared_identity(offer: Mapping[str, Any]) -> dict | None:
    """Lot 790 — l'identité que le cache partagé porte déjà pour cet employeur (lecture seule, aucun appel registre)."""
    key = normalize_employer_name(offer.get("employer"))
    if not key or offer.get("siren"):
        return None
    try:
        hit = await provider_cache.get_json(_IDENTITY_NAMESPACE, key)
    except Exception:  # noqa: BLE001 — le cache ne casse jamais la recherche
        return None
    return hit if isinstance(hit, dict) and len(str(hit.get("siren") or "")) == 9 else None


async def find_skill_accounts(
    skills: Sequence[str],
    zone: Sequence[str],
    profile: Mapping[str, Any],
    *,
    deadline: float | None,
    city: str | None = None,
    centre: tuple[float, float] | None = None,
    radius_km: float | None = None,
    commune_code: str | None = None,
    user_id: str | None = None,
    limit: int | None = None,
) -> SkillAccounts:
    """Les comptes qui recrutent sur ``skills`` dans ``zone`` — clients finaux et intermédiaires séparés.

    ``city`` (Recette 21/10 B.3) : une VILLE tapée filtre sur la ville ; le département n'est que le périmètre
    de lecture des sources. Les offres hors ville sont comptées (``outsideCity``), jamais présentées comme la ville.
    ``centre`` + ``radius_km`` (#4515, 27/10) : le cercle autour de la ville, mesuré sur la position de l'offre
    (:func:`offer_in_reach`) ; ``info.radiusKm`` dit qu'il a été APPLIQUÉ.

    ``limit`` (lot 790, #5212) : le nombre de cartes à rendre. Les identités se résolvent dans l'ordre du rang et la
    résolution s'ARRÊTE dès ``limit × 2`` comptes confirmés (marge pour le secteur / l'effectif / les intermédiaires) ;
    le reste est compté « à vérifier » (``notAttempted``), jamais « introuvable » ni « coupé par le délai ».
    Absent : on résout jusqu'au plafond, comme avant."""
    # #4675 — le cercle d'une ville : les départements qu'il recouvre sont lus (préfecture dans le cercle), et le rayon
    # part à la source quand la commune est connue. Sans cercle : l'appel est celui d'avant, à l'octet.
    if city and (city or "").strip() and centre and radius_km:
        zone = circle_departments(zone, centre, radius_km)
        at_source = {"commune_code": commune_code, "radius_km": radius_km} if commune_code else {}
    else:
        at_source = {}
    pass_started = time.monotonic()
    identity_calls = 0
    memo = _IDENTITY_MEMO.get()
    harvest = await harvest_skill_offers(skills, zone, profile, deadline=deadline, **at_source)
    outside_city = 0
    outside_circle = unpositioned = 0
    outside_city_employers = 0
    if (city or "").strip():
        split = split_by_reach(harvest.offers, city or "", centre=centre, radius_km=radius_km, zone=frozenset(zone))
        in_city = split.kept
        outside_city = split.outside
        outside_circle, unpositioned = split.outside_circle, split.unpositioned
        # #4419 — l'entonnoir compte des EMPLOYEURS (l'unité de la liste), pas des offres : ceux qui n'ont QUE des
        # offres hors ville sont écartés ; un employeur ayant aussi une offre dans la ville reste.
        kept_keys = {_employer_group(o) for o in in_city}
        outside_city_employers = len({_employer_group(o) for o in harvest.offers} - kept_keys)
        harvest = replace(harvest, offers=in_city)

    groups: dict[str, list[dict]] = {}
    for offer in harvest.offers:
        groups.setdefault(_employer_group(offer), []).append(offer)
    ordered = sorted(
        groups.values(), key=lambda offers: (len(offers), str(_latest(offers).get("date") or "")), reverse=True
    )
    # #4419.4 — au-delà du plafond : compté À PART, jamais confondu avec « introuvable ».
    beyond_cap = max(0, len(ordered) - SKILL_MAX_EMPLOYERS)
    ordered = ordered[:SKILL_MAX_EMPLOYERS]

    it_trade = any(_is_it_skill(skill) for skill in skills)  # #4419.6 — le NAF informatique colle au métier
    gate = asyncio.Semaphore(_RESOLVE_CONCURRENCY)
    enough_after = limit * 2 if limit and limit > 0 else None
    confirmed = 0
    enough = EmployerResolution(None, "not_attempted")  # sentinelle : « assez de comptes », pas « le délai »

    def _counted(resolution: EmployerResolution) -> EmployerResolution:
        nonlocal confirmed
        if len(str((resolution.identity or {}).get("siren") or "")) == 9:
            confirmed += 1
        return resolution

    async def _one(offers: list[dict]) -> EmployerResolution:
        nonlocal identity_calls, confirmed
        async with gate:
            first = offers[0]
            # #4419.3 — le lieu de l'offre (le département le plus cité du groupe) tranche une homonymie.
            # #4419.5 — le lieu se LIT (code postal, ville, libellé tronqué) quand l'offre n'a pas de département.
            depts = [d.upper() for o in offers if (d := o.get("department") or offer_department(o))]
            hint = max(set(depts), key=depts.count) if depts else None
            cities = [str(o.get("city") or "").split(",")[0].strip() for o in offers if o.get("city")]
            city_hint = max(set(cities), key=cities.count) if cities else None
            # Lot 789 — le même employeur (nom normalisé + département) n'est demandé qu'UNE fois par requête.
            memo_key = (_employer_group(first), hint or "")
            if memo is not None and (known := memo.resolved.get(memo_key)) is not None:
                return _counted(known)
            if deadline is not None and time.monotonic() >= deadline:
                # Lot 790 (#5212) — le budget est parti (moisson ralentie par une recherche sœur) : ce que le cache
                # partagé sait DÉJÀ se rend, sans appel registre ; seul le reste est « non tenté ».
                cached = await _shared_identity(first)
                if cached is None:
                    return EmployerResolution(None, "not_attempted")
                return _counted(EmployerResolution(cached))
            if enough_after is not None and confirmed >= enough_after:
                return enough
            identity_calls += 1
            call = resolve_employer(
                str(first.get("employer") or ""),
                first.get("siren"),
                department=hint,
                city=city_hint or None,
                it_trade=it_trade,
                user_id=user_id,
            )
            try:
                if deadline is None:
                    result = await call
                else:
                    result = await asyncio.wait_for(call, max(0.01, deadline - time.monotonic()))
                if memo is not None and result.failure not in _TRANSIENT_FAILURES:
                    memo.resolved[memo_key] = result
                return _counted(result)
            except TimeoutError:
                return EmployerResolution(None, "deadline")
            except Exception as exc:  # noqa: BLE001 — le registre ne casse jamais la recherche
                logger.info("COMPETENCE-TROUVE — résolution impossible : %s", type(exc).__name__)
                return EmployerResolution(None, "unavailable")

    if deadline is not None:
        with wait_deadline(deadline):
            resolutions = await asyncio.gather(*(_one(offers) for offers in ordered))
    else:
        resolutions = await asyncio.gather(*(_one(offers) for offers in ordered))

    failures = dict.fromkeys(_RESOLUTION_FAILURES.values(), 0)
    not_attempted = 0
    stopped_early = 0
    outside_zone = 0
    zone_set = frozenset(zone)
    by_siren: dict[str, tuple[dict, list[dict]]] = {}
    pending: list[dict] = []
    unresolved_intermediaries = 0
    for offers, resolution in zip(ordered, resolutions, strict=True):
        identity = resolution.identity or {}
        siren = str(identity.get("siren") or "")
        if len(siren) != 9:
            if resolution.failure in ("deadline", "not_attempted"):
                not_attempted += 1  # le temps a manqué : pas « introuvable »
                if resolution is enough:
                    stopped_early += 1  # assez de comptes confirmés : à vérifier, mais pas une coupure par le délai
            else:
                failures[_RESOLUTION_FAILURES.get(resolution.failure or "", "registrySilent")] += 1
            # #4674 — l'offre PROUVE l'employeur : il sort avec son identité « en cours » au lieu d'être jeté.
            # Une collectivité confondue avec une société n'est pas un compte à rendre.
            if resolution.failure != "public_administration":
                row = _pending_employer(offers, resolution.failure, resolution.candidates)
                if intermediary_kind(row["name"], None) is not None:
                    unresolved_intermediaries += 1  # un cabinet / une ESN n'est jamais un compte cible
                else:
                    pending.append(row)
            continue
        if zone_set:
            offer_depts = {str(o.get("department") or "").upper() for o in offers if o.get("department")}
            company_dept = str(identity.get("department") or "").upper()
            if not offer_depts and company_dept not in zone_set:
                outside_zone += 1  # #4419.5 — ni l'offre ni l'employeur n'est dans la zone : COMPTÉ
                continue
        # Même SIREN sous deux noms d'offres (« BIHR », « Bihr SAS ») : un seul compte, offres réunies.
        kept_identity, kept_offers = by_siren.get(siren, (identity, []))
        by_siren[siren] = (kept_identity, kept_offers + offers)

    accounts: list[dict] = []
    intermediaries: list[dict] = []
    for siren, (identity, offers) in by_siren.items():
        evidence = _evidence(offers)
        kind = intermediary_kind(identity.get("name") or offers[0].get("employer"), identity.get("nafCode"))
        if kind is not None:
            intermediaries.append(
                {
                    "siren": siren,
                    "name": identity.get("name"),
                    "kind": kind,
                    "nafCode": identity.get("nafCode"),  # #4420.4 — le secteur coché filtre aussi cette section
                    "city": identity.get("city"),
                    "department": identity.get("department"),
                    "skillEvidence": evidence,
                }
            )
            continue
        tranche = identity.get("headcountTranche")
        accounts.append(
            {
                **identity,
                "siren": siren,
                "headcountRange": identity.get("headcountRange") or headcount_label(tranche),
                "skillEvidence": evidence,
            }
        )

    def rank(row: Mapping[str, Any]) -> tuple[int, str]:
        ev = row["skillEvidence"]
        return ev["offerCount"], str(ev["latestOffer"].get("date") or "")

    accounts.sort(key=rank, reverse=True)
    intermediaries.sort(key=rank, reverse=True)
    pending.sort(key=rank, reverse=True)
    unresolved = sum(failures[k] for k in ("homonym", "registrySilent", "publicAdministration"))
    coverage = coverage_matrix(harvest)
    if coverage["silentFilters"]:
        # ⚠️ Des offres arrivent et le tri n'en écarte AUCUNE : il ne tourne pas — au journal, en alerte lisible.
        logger.warning("%s", coverage_log_line(coverage))
    else:
        logger.info("%s", coverage_log_line(coverage))
    info = {
        "skills": list(skills),
        # #4579.5 / #4519 — ce qui a RÉELLEMENT été cherché : chaque terme (un métier pour une expertise) et ses écritures
        # d'annonce. L'écran dit « vue » cherché aussi sous vue.js, vuejs… plutôt que de coller deux compétences.
        "searched": [{"skill": term, "forms": [form for part in searched_forms(term) for form in part]} for term in skills],
        # #4419.1 — étape 1 : les sources (offres reçues, appels, moisson resservie du cache).
        "offersBySource": dict(harvest.received),
        "calls": dict(harvest.calls),
        # #4419 — le compteur PAR SOURCE (reçues, retenues, rejets par motif, payés, servis par le cache, non tentés).
        "sources": {name: _public_stats(stats) for name, stats in harvest.by_source.items()},
        "harvestCached": harvest.from_cache,
        "sourcesCut": harvest.cut,
        # Étape 2 : les offres retenues, et chaque rejet par motif.
        "offersSeen": len(harvest.offers),
        # #5009 — « N offres lues » : ce que les sources ont RENDU ; `offersTotal` (« sur M trouvées ») dès qu'une source
        # lue publie un total ; `offersTotalIsLowerBound` dit que M est une borne basse (« au moins »). Sinon absent.
        "offersRead": sum(harvest.received.values()),
        "offersRejected": dict(harvest.rejected),
        # Étape 3 : les groupes d'employeurs, et ceux au-delà du plafond.
        "employerGroups": len(groups),
        "beyondCap": beyond_cap,
        # Étape 4 : la résolution — échecs par motif, et ce que le temps n'a pas permis de tenter.
        "resolutionFailures": failures,
        "unresolvedEmployers": unresolved,
        "notAttempted": not_attempted,
        # #4674 — employeurs non résolus RENDUS quand même (preuve d'offre, identité « en cours ») : un sous-ensemble
        # de ceux qui précèdent (échecs + non tentés), jamais additionné à ``employersFound``.
        "unresolvedRendered": len(pending),
        "unresolvedIntermediaries": unresolved_intermediaries,
        # Étape 5 : zone, intermédiaires, comptes.
        "outsideZone": outside_zone,
        "employersFound": len(accounts) + len(intermediaries),
        "intermediaries": len(intermediaries),
        "accountsFound": len(accounts),
        "deadlineCut": bool(not_attempted - stopped_early or harvest.cut),
        "emptyCause": _empty_cause(accounts, intermediaries, harvest),
        # #4420 — la matrice : pourquoi les sources ont peu rendu, ce que le tri a écarté, quel filtre ne tourne pas.
        "coverage": coverage,
    }
    found_total = offers_total(harvest)
    if found_total is not None:
        info["offersTotal"], info["offersTotalIsLowerBound"] = found_total
    if (city or "").strip():
        # B.3 — l'écran DIT que la lecture est sur la ville, et combien d'offres du département n'y sont pas.
        info["city"] = (city or "").strip()
        info["outsideCity"] = outside_city
        info["outsideCityEmployers"] = outside_city_employers
        if centre and radius_km:
            info["radiusKm"] = radius_km  # #4515 — le rayon affiché est le rayon APPLIQUÉ
            # #4675 — « hors cercle » (position publiée, trop loin) ≠ « hors zone » ; les sans-position gardées se comptent.
            info["outsideCircle"] = outside_circle
            info["unpositionedKept"] = unpositioned
        if info["emptyCause"] == "no_offers" and outside_city:
            info["emptyCause"] = "no_offers_in_city"
    # G — le coût se trace au journal existant : des compteurs, jamais un contenu ni un critère d'espace.
    # #4419.1 — chaque étape au journal : où la récolte se perd se lit sans rejouer la recherche.
    # Lot 789 (#5212) — la durée de CHAQUE passe : où les 35 s se perdent se lit sans rejouer la recherche.
    logger.info(
        "discover pass=%s ms=%d offers=%d kept=%d identity_calls=%d",
        _PASS_NAME.get(),
        int((time.monotonic() - pass_started) * 1000),
        sum(harvest.received.values()),
        len(harvest.offers),
        identity_calls,
    )
    logger.info(
        "COMPETENCE-TROUVE calls ft=%d adzuna=%d cache=%d received=%s cut=%d cached=%s offers=%d rejected=%s "
        "groups=%d beyond_cap=%d failures=%s not_attempted=%d outside_zone=%d intermediaries=%d accounts=%d "
        "sources=%s",
        harvest.calls.get("france_travail", 0),
        harvest.calls.get("adzuna", 0),
        harvest.calls.get("cache", 0),
        harvest.received,
        harvest.cut,
        harvest.from_cache,
        len(harvest.offers),
        harvest.rejected,
        len(groups),
        beyond_cap,
        failures,
        not_attempted,
        outside_zone,
        len(intermediaries),
        len(accounts),
        {name: _log_stats(stats) for name, stats in harvest.by_source.items()},
    )
    # ALERTES-402 (30/10/2026) point 1 — une recherche vient d'avoir lieu : si une source payante
    # CONFIGURÉE n'a pas été appelée depuis des jours, c'est ici qu'on peut le dire. Le cache 30 j, le
    # compte à 1 crédit (#4725) et le stock de rejeu (#4724) font qu'une source morte ne produit NI
    # erreur NI alerte : TheirStack est resté à sec du 28/10 au 30/10 sans un mot. Une fois par jour
    # et par fournisseur, jamais bloquant.
    from app.services.data_sources import job_aggregators as _agg

    await source_silence.warn_unused([s for s in _PAID_SOURCES if _agg.paid_skill_source_configured(s)])
    return SkillAccounts(accounts=accounts, intermediaries=intermediaries, info=info, pending=pending)
