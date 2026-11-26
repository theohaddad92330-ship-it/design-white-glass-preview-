"""#3885 (lot RAS, 10/10/2026) — agrégateurs d'offres d'emploi à API OFFICIELLE.

Demande de Louis : « ratisse tout » (Indeed, offres LinkedIn, Malt…). Doctrine
``c79_collecte_large_mais_propre`` : on collecte LARGEMENT, tant que c'est PROPRE
— API officielles et partenaires sous contrat, jamais de scraping qui viole des
CGU ou contourne une authentification. L'inventaire source par source, avec ce
qui est impossible proprement (Malt, Free-Work, Talent.io, Indeed/LinkedIn en
direct) : ``agent_docs/sources-offres-besoins.md``.

Trois fournisseurs, chacun derrière SA clé, chacun NO-OP STRICT sans elle
(``[]``, zéro appel réseau) :

- **Adzuna** — ``GET https://api.adzuna.com/v1/api/jobs/{pays}/search/{page}``
  (``app_id``/``app_key``/``what``/``results_per_page``) → ``results[]`` :
  ``title``, ``company.display_name``, ``location.display_name``, ``created``,
  ``redirect_url``, ``contract_type`` (developer.adzuna.com/docs/search).
  Clés : ``ADZUNA_APP_ID`` + ``ADZUNA_APP_KEY``. Gratuit.
- **Jooble** — ``POST https://jooble.org/api/{clé}`` ``{keywords, location,
  page, ResultOnPage}`` → ``jobs[]`` : ``title``, ``location``, ``type``,
  ``link``, ``company``, ``updated`` (help.jooble.org, « REST API
  documentation »). Clé : ``JOOBLE_API_KEY``. Gratuit (partenaire).
- **TheirStack** — partenaire de données qui agrège, sous contrat, les offres
  LinkedIn, Indeed, WTTJ et ATS : ``POST https://api.theirstack.com/v1/jobs/search``
  (``Authorization: Bearer``, ``company_name_or``, ``posted_at_max_age_days``,
  ``job_country_code_or``, ``limit``) → ``data[]`` : ``job_title``, ``url``,
  ``final_url``, ``date_posted``, ``company``, ``location``. Clé :
  ``THEIRSTACK_API_KEY``. PAYANT : 1 crédit par offre RENDUE — enregistré dans
  ``run_metrics`` au prix de ``provider_pricing.unit_cost_per_result_usd``.

Contrat de sortie IDENTIQUE à France Travail / APEC / WTTJ (``title``,
``location``, ``date``, ``contractType``, ``skills``, ``company``, ``city``,
``url``, ``source``) : fusion ADDITIVE dans ``phase1_research`` via
``merge_job_signals``. Attribution sur PREUVE (``same_employer``) — une offre
d'un autre employeur (cabinet, filiale) est écartée, jamais rattachée. Champ
absent → ``None``, jamais une valeur fabriquée.

Un module, pas trois : les trois partagent le mapping, la fraîcheur et le
dédoublonnage (GA-17 interdit qu'une source en importe une autre).
"""

from __future__ import annotations

import asyncio
import logging
import os
import re
import unicodedata
from collections.abc import Awaitable, Callable, Iterator, Mapping, Sequence
from contextlib import contextmanager
from contextvars import ContextVar
from datetime import UTC, datetime, timedelta

import httpx

from app.middleware.correlation_id import get_correlation_id
from app.services import adzuna_budget, offers_cascade, provider_cache, provider_pricing, run_metrics, source_silence
from app.services.company_filters import reason_for_exception, reason_for_status
from app.services.company_name_variants import company_name_variants
from app.services.data_sources import mantiks_balance
from app.services.data_sources.employer_match import EmployerScope, brand_name, same_employer, same_group_employer
from app.services.internship_posting import drop_internship_postings, title_patterns_not
from app.services.rate_limiter import (
    DEFAULT_BACKOFF_S,
    back_off_provider,
    parse_retry_after,
    retry_after_header,
    throttle,
)
from app.services.source_health import record_degradation
from app.services.zone_tiers import published_position

logger = logging.getLogger(__name__)

_ADZUNA_URL = "https://api.adzuna.com/v1/api/jobs/{country}/search/{page}"
#: DECATHLON 11/10 — « DECATHLON » rendait 536 offres, seule la page 1 était lue.
#: Réglage UNIQUE de la pagination : au plus N pages de 50 (maximum documenté),
#: arrêt dès qu'une page n'apporte plus d'offre du groupe.
_ADZUNA_MAX_PAGES = 5
_ADZUNA_PER_PAGE = 50
#: TheirStack : au plus N noms dans une requête par nom (le compte + ses entités à SIREN connu).
_THEIRSTACK_MAX_NAMES = 5
#: #4182 — graphies essayées côté Fantastic (une requête vide coûte 0, mais prend du temps).
_FANTASTIC_MAX_NAMES = 4
#: CACHE-SOURCES (15/10) — réglage UNIQUE du coût des sources PAYÉES À L'OFFRE (TheirStack,
#: Fantastic.jobs, Mantiks) : UNE page des 25 offres les plus récentes par entreprise, jamais
#: de pagination. Le résultat est gardé 30 j sous la clé « entreprise seule » : une entreprise
#: est payée une fois, quel que soit l'espace, l'écran ou le métier (le tri se fait à la lecture).
_PAID_PAGE_SIZE = 25
#: #4676 (L4, décision Louis 25/10/2026 : la pertinence passe avant le coût) — la recherche PAR COMPÉTENCE lit des
#: pages de 100 offres (le paramètre ``limit`` de TheirStack est un entier libre, ``page`` est déjà employé ici) ;
#: la fiche entreprise garde ses 25. Le nombre de pages et le plafond d'appels vivent chez l'appelant.
PAID_SKILL_PAGE_SIZE = 100
#: SIG-A (A4) — au plus N technologies lues dans les offres publiées.
_PUBLISHED_TECH_MAX = 15
_JOOBLE_URL = "https://{host}/api/{key}"
_JOOBLE_DEFAULT_HOST = "jooble.org"
#: SIG-D1 — doc Jooble : ResultOnPage sans défaut ; une page « pleine » appelle la suivante.
_JOOBLE_PER_PAGE = 20
_THEIRSTACK_URL = "https://api.theirstack.com/v1/jobs/search"
# #3885 (lot RAV) — Mantiks API v2 (mantiks-api.readme.io) et Fantastic.jobs
# (developer.fantastic.jobs), contrats relus sur la doc officielle le 10/10/2026.
_MANTIKS_SEARCH_URL = "https://dashboard.mantiks.io/api/v2/companies/search"
_MANTIKS_JOBS_URL = "https://dashboard.mantiks.io/api/v2/companies/{id}/jobs"
_FANTASTIC_URL = "https://data.fantastic.jobs/v1/active-ats"
_FANTASTIC_JB_URL = "https://data.fantastic.jobs/v1/active-jb"
# DISCOVER-OFFRES (15/10) — la FICHE (offres complètes) paie dans cet ordre : Fantastic.jobs, puis
# Mantiks, puis TheirStack. OFFRES-VEILLE (16/10) : la cascade s'arrête dès que le CUMUL des offres
# RENDUES (France, hors stage, datées, employeur vérifié — AVANT tri métier) atteint
# _CASCADE_RENDERED_ENOUGH : les sources rendent le même employeur, le tri métier les filtrerait pareil.
# Réglage UNIQUE de l'ordre (GA-26).
_CASCADE_RENDERED_ENOUGH = 10
#: Assez d'offres déjà au cache commun (semis des analyses) pour ne payer aucune source : le seuil de l'étape Mantiks.
ENOUGH_OFFERS_FOR_NO_PURCHASE = _CASCADE_RENDERED_ENOUGH
#: Mantiks rend jusqu'à 100 offres pour UN crédit, quel que soit leur nombre : on les garde toutes.
_MANTIKS_KEEP = 100
#: Recherches gratuites supplémentaires (filiales au SIREN connu) — 0 crédit, bornées pour la latence.
_MANTIKS_MAX_EXTRA_QUERIES = 2
#: Geonames « France » : la doc Mantiks exige au moins un lieu (``locations: []`` est refusé).
_MANTIKS_FRANCE = {"id": "3017382", "radius": None}
#: Fenêtre des offres payées (Fantastic ``date_posted_gte``, Mantiks ``published_date_window_days``).
_PAID_WINDOW_DAYS = 90
#: Mêmes offres sur deux jobboards : même titre, même ville, dates à ±3 jours.
_BOARD_DEDUP_DAYS = 3
#: Fantastic : tout sauf INTERN et VOLUNTEER (pas de stage — décision Louis 15/10).
_FANTASTIC_EMPLOYMENT_TYPES = "FULL_TIME,PART_TIME,CONTRACTOR,TEMPORARY,OTHER"
_TIMEOUT_S = 10.0

#: Même règle que France Travail / APEC / WTTJ : une offre de plus de ~12 mois
#: n'est plus un besoin actionnable.
_MAX_AGE_DAYS = 365
#: TheirStack facture chaque offre rendue : on ne demande que les récentes.
_THEIRSTACK_MAX_AGE_DAYS = 90
#: Plafond par fournisseur et par compte — borne le coût TheirStack (≤ 10 crédits).
_LIMIT = 10
#: CASCADE-PLANCHER-5, palier « fenêtre » — la borne d'âge des offres payées, élargie jusqu'à la borne existante
#: (``_MAX_AGE_DAYS``) : jamais au-delà de ce que France Travail / APEC / WTTJ acceptent déjà.
CASCADE_WINDOW_DAYS = _MAX_AGE_DAYS
_window_override: ContextVar[int | None] = ContextVar("paid_window_override", default=None)


@contextmanager
def wide_window(days: int = CASCADE_WINDOW_DAYS) -> Iterator[None]:
    """Le temps d'un appel, les sources payées regardent ``days`` jours en arrière au lieu de 90 (palier fenêtre)."""
    token = _window_override.set(min(max(1, int(days)), _MAX_AGE_DAYS))
    try:
        yield
    finally:
        _window_override.reset(token)


def _window_days(default: int) -> int:
    override = _window_override.get()
    return max(default, override) if override is not None else default


def _clean(value: object) -> str | None:
    s = " ".join(str(value or "").split())
    return s or None


def _fold(value: object) -> str:
    s = unicodedata.normalize("NFD", str(value or "").lower())
    s = "".join(ch for ch in s if unicodedata.category(ch) != "Mn")
    return " ".join(re.findall(r"[a-z0-9]+", s))


def _parse_date(value: object) -> datetime | None:
    s = str(value or "").strip()
    if not s:
        return None
    s = s.replace("Z", "+00:00")
    for candidate in (s, s[:19], s[:10]):
        try:
            dt = datetime.fromisoformat(candidate)
        except ValueError:
            continue
        return dt if dt.tzinfo else dt.replace(tzinfo=UTC)
    return None


def _offer(
    *,
    title: str,
    city: str | None,
    date: object,
    contract: str | None,
    company: str | None,
    url: str | None,
    source: str,
    description: str | None = None,
    position: Mapping[str, float] | None = None,
    source_id: object = None,
) -> dict:
    offer = {
        # Contrat de rendu partagé avec France Travail (dated_signals).
        "title": title,
        "location": city or "",
        "date": _clean(date),
        "contractType": contract,
        "skills": [],
        "company": company,
        "city": city,
        "url": url,
        "source": source,
    }
    # #4419.23 bis — l'extrait de l'annonce voyage : la source a trouvé le mot DEDANS, le contrôle de compétence
    # doit pouvoir l'y relire (sans lui, 95 % des offres Adzuna tombaient en « skillAbsent », prod 24/10).
    if description:
        offer["description"] = description
    # #4515 (lot DÉCOUVRIR-MOTEUR, 27/10) — la position que la source PUBLIE : le rayon d'une ville s'y mesure.
    if position:
        offer.update(position)
    # #4724 — l'identifiant que la SOURCE donne à l'offre (TheirStack ``id``) : il sert à ne pas la repayer au rejeu.
    if isinstance(source_id, int) and not isinstance(source_id, bool):
        offer["sourceId"] = source_id
    return offer


def _scope(company: str, scope: EmployerScope | None) -> EmployerScope:
    return scope if scope is not None else EmployerScope.build(company)


def _cache_key(company: object, scope: EmployerScope | None = None, domain: object = None, **_: object) -> str:
    """CACHE-SOURCES (15/10) — la clé est l'ENTREPRISE seule : SIREN d'ancrage, sinon
    domaine du site, sinon nom normalisé. Ni le métier, ni le pack, ni ``all_roles``, ni
    un plafond d'offres, ni ce qu'on sait du groupe n'y entrent : l'entreprise est payée
    UNE fois par TTL, et le tri métier de l'espace s'applique à la lecture. Préfixe
    ``e1`` : les clés d'avant (``g2``/``t3``) ne sont plus relues, pas de migration."""
    cleaned = str(company or "").strip()
    if not cleaned:
        return ""
    if scope is not None and scope.siren:
        return f"e1|siren:{scope.siren}"
    site = _bare_domain(domain)
    if site:
        return f"e1|domain:{site}"
    return f"e1|name:{_fold(cleaned)}"


def _keep_recent_attributed(
    rows: list[tuple[str | None, dict]], scope: EmployerScope, *, limit: int
) -> list[dict]:
    """Garde les offres du GROUPE de ``scope`` (preuve par nom, entité connue ou
    SIREN — DECATHLON 11/10), récentes, triées récent d'abord."""
    cutoff = datetime.now(UTC) - timedelta(days=_MAX_AGE_DAYS)
    _min = datetime.min.replace(tzinfo=UTC)
    scored: list[tuple[datetime, dict]] = []
    for employer, offer in rows:
        if not offer.get("title") or not scope.matches(employer):
            continue
        published = _parse_date(offer.get("date"))
        if published is not None and published < cutoff:
            continue
        scored.append((published or _min, offer))
    scored.sort(key=lambda t: t[0], reverse=True)
    return [o for _dt, o in scored[:limit]]


async def _request(
    provider: str, company: str, client: httpx.AsyncClient | None, send, gate, *, headers_out: dict | None = None
) -> object | None:
    """Un appel limité, gracieux : ``None`` sur toute panne (tracée), jamais d'exception.

    ``gate`` rend le ``throttle("<clé>")`` du fournisseur, écrit en LITTÉRAL au
    site d'appel (la garde `test_upstream_throttle_coverage` lit ces littéraux)."""
    # SIGNAUX-OPTI (16/10) — clé refusée en série : aucun appel réseau (une sonde par heure).
    if await source_silence.skip_auth_refused(provider):
        return None
    # ALERTES-402 (30/10/2026) point 2 — le fournisseur a demandé d'attendre, et il l'a demandé à la
    # réplique voisine : le refroidissement est partagé, sinon l'autre processus reprend la rafale.
    if await source_silence.in_cooldown(provider):
        logger.info("source_skipped source=%s reason=cooldown", provider)
        return None
    # ALERTES-402 point 1 — un appel TENTÉ s'horodate : c'est le seul témoin de l'absence d'appel.
    await source_silence.note_call(provider)
    owns = client is None
    http = client or httpx.AsyncClient(timeout=_TIMEOUT_S)
    try:
        async with gate():
            resp = await send(http)
        if not resp.is_success:
            if resp.status_code == 429:
                retry_after = retry_after_header(resp)
                back_off_provider(provider, retry_after)
                # ALERTES-402 point 2 — le même silence, mais partagé : `back_off_provider` ne tient que
                # ce processus. Avec le `Retry-After` du fournisseur quand il en donne un.
                await source_silence.start_cooldown(
                    provider, parse_retry_after(retry_after) or DEFAULT_BACKOFF_S
                )
            # INCIDENT 26/10 — l'API NOMME le champ fautif dans le corps : on le journalise tronqué.
            # SIG-C : jamais l'URL, les paramètres ni l'en-tête Authorization — le corps seul.
            logger.warning(
                "%s search failed (status %s) for %r: %s",
                provider,
                resp.status_code,
                company,
                (resp.text or "")[:300],
            )
            # SIG-C — dégradation NOMINATIVE (supervision) ; l'écran la replie en
            # « job_aggregators » (`source_health.public_source`), jamais un fournisseur.
            record_degradation(
                get_correlation_id(),
                source=provider,
                reason=f"HTTP {resp.status_code}",
                code=reason_for_status(resp.status_code),
            )
            await source_silence.record_outcome(
                provider, ok=False, reason=f"HTTP {resp.status_code}", status=resp.status_code
            )
            return None
        payload = resp.json()
        if headers_out is not None:
            headers_out.update({k.lower(): v for k, v in resp.headers.items()})
        # SIG-C C4 — la source a RÉPONDU (même vide) : sa série d'erreurs s'arrête.
        await source_silence.record_outcome(provider, ok=True)
        return payload
    except Exception as exc:  # noqa: BLE001 — une source d'appoint ne casse jamais la recherche
        logger.warning("%s search failed for %r: %s", provider, company, exc)
        # SIG-C — le TYPE d'erreur, jamais `str(exc)` : il peut porter l'URL (et la clé Jooble).
        record_degradation(
            get_correlation_id(), source=provider, reason=type(exc).__name__, code=reason_for_exception(exc)
        )
        await source_silence.record_outcome(provider, ok=False, reason=type(exc).__name__)
        return None
    finally:
        if owns:
            await http.aclose()


def _count_returned(provider: str, returned: int) -> None:
    """SIG-A (A3) — offres RENDUES par le fournisseur (payées ou non), comptées
    avant tout tri ; ``0`` ne crée rien (sans clé ou sans réponse : no-op strict)."""
    if returned > 0:
        run_metrics.record_results(get_correlation_id(), provider, returned=returned)


# ── Adzuna ───────────────────────────────────────────────────────────────────


def _adzuna_area(hit: dict) -> list[str]:
    location = hit.get("location") if isinstance(hit.get("location"), dict) else {}
    area = location.get("area")
    return [str(part) for part in area if isinstance(part, str)] if isinstance(area, list) else []


def _adzuna_row(hit: dict) -> tuple[str | None, dict]:
    company_obj = hit.get("company") if isinstance(hit.get("company"), dict) else {}
    location = hit.get("location") if isinstance(hit.get("location"), dict) else {}
    employer = _clean(company_obj.get("display_name"))
    # `contract_type` documenté : « permanent » = CDI ; toute autre valeur
    # n'est pas traduite au hasard (None).
    contract = "CDI" if str(hit.get("contract_type") or "").strip().lower() == "permanent" else None
    return (
        employer,
        _offer(
            title=_clean(hit.get("title")) or "",
            city=_clean(location.get("display_name")),
            date=hit.get("created"),
            contract=contract,
            company=employer,
            url=_clean(hit.get("redirect_url")),
            source="adzuna",
            description=_clean(hit.get("description")),
            position=published_position(hit),
        ),
    )


@provider_cache.cached_by(
    "jobs:adzuna", _cache_key, ttl=provider_cache.TTL_JOBS, empty_ttl=provider_cache.TTL_EMPTY_JOBS
)
async def adzuna_jobs(
    company: str, *, scope: EmployerScope | None = None, client: httpx.AsyncClient | None = None
) -> list[dict]:
    """Offres Adzuna du groupe de ``company``. NO-OP STRICT sans ``ADZUNA_APP_ID`` + ``ADZUNA_APP_KEY``.

    DECATHLON 11/10 — paginé (``_ADZUNA_MAX_PAGES`` pages au plus) : la recherche
    plein texte d'un grand groupe rend des centaines d'offres dont celles du groupe
    sont dispersées. Arrêt dès qu'une page n'apporte aucune offre du groupe, que la
    dernière page est atteinte ou que le plafond par fournisseur est rempli."""
    app_id = os.environ.get("ADZUNA_APP_ID", "").strip()
    app_key = os.environ.get("ADZUNA_APP_KEY", "").strip()
    cleaned = (company or "").strip()
    if not app_id or not app_key or not cleaned:
        return []
    group = _scope(cleaned, scope)
    # GROUPE-FRANCE (16/10) — le nom légal d'abord ; s'il ne rend aucune offre du groupe, la MARQUE
    # seule (« DECATHLON FRANCE » → « DECATHLON »). L'appariement par groupe reste la preuve.
    brand = brand_name(cleaned) or cleaned
    for what in dict.fromkeys([cleaned, brand]):
        kept = await _adzuna_search(what, cleaned, group, app_id, app_key, client)
        if kept:
            return kept
    return []


async def adzuna_employer_term_offers(
    company: str, term: str, *, scope: EmployerScope | None = None, client: httpx.AsyncClient | None = None
) -> list[dict]:
    """DECATHLON 30/10 — les offres Adzuna du groupe de ``company`` pour UN métier du vendeur (« DECATHLON data »).

    La recherche par nom seul rend les offres les plus récentes d'un grand groupe — de la vente, de la logistique —
    et s'arrête à ``_LIMIT`` : celles du métier du vendeur n'y apparaissaient jamais. NO-OP STRICT sans les deux clés.
    L'appariement au groupe reste la preuve, comme pour ``adzuna_jobs``."""
    app_id = os.environ.get("ADZUNA_APP_ID", "").strip()
    app_key = os.environ.get("ADZUNA_APP_KEY", "").strip()
    cleaned = (company or "").strip()
    wanted = (term or "").strip()
    if not app_id or not app_key or not cleaned or not wanted:
        return []
    brand = brand_name(cleaned) or cleaned
    return await _adzuna_search(f"{brand} {wanted}", cleaned, _scope(cleaned, scope), app_id, app_key, client)


#: Louis 30/10 — offres rendues au plus par la recherche d'un compte « par métier » (la fiche les montre 5 par 5).
ACCOUNT_OFFER_SEARCH_MAX = 50
_ACCOUNT_OFFER_SEARCH_NAMESPACE = "account:offer_search"
#: La réponse ENTREPRISE d'une source payante, gardée 30 j : un autre métier cherché sur le même compte ne rachète rien.
_ACCOUNT_PAID_NAMESPACE = "account:offer_search:paid"


async def _account_paid_offers(source: str, company: str, fetch: Callable[[], Awaitable[list[dict]]]) -> list[dict]:
    """UNE source payante pour la recherche de la fiche : cache 30 j par entreprise, puis un appel au plus."""
    key = f"{source}|{_cache_key(company)}"
    hit = await provider_cache.get_json(_ACCOUNT_PAID_NAMESPACE, key)
    if isinstance(hit, Mapping) and isinstance(hit.get("offers"), list):
        return [o for o in hit["offers"] if isinstance(o, dict)]
    rows = await fetch()
    rows = [o for o in rows if isinstance(o, dict)] if isinstance(rows, list) else []
    await provider_cache.set_json(
        _ACCOUNT_PAID_NAMESPACE,
        key,
        {"offers": rows},
        provider_cache.TTL_JOBS if rows else provider_cache.TTL_EMPTY_JOBS,
    )
    return rows


async def account_offer_search(
    company: str,
    term: str = "",
    *,
    website: str | None = None,
    siren: str | None = None,
    client: httpx.AsyncClient | None = None,
) -> dict:
    """Louis 30/10 — les offres du groupe de ``company`` pour le métier ``term`` (vide : tous métiers), au plus
    ``ACCOUNT_OFFER_SEARCH_MAX``, pour la fiche compte : chercher un AUTRE métier que ceux du profil, en voir plus.

    « Toutes nos sources s'il faut » (Louis 30/10) :
    - gratuites, TOUJOURS : Adzuna (nom + métier, dans son quota du jour) et France Travail (nom + métier, sans
      quota partagé — le quota Adzuna épuisé à 13 h rendait la recherche muette) ; APEC, boards ATS, pages
      carrières et WTTJ (offres de l'entreprise, filtrées sur le métier) ;
    - payantes (Mantiks, TheirStack, Fantastic.jobs), SEULEMENT sous ``OFFERS_FLOOR`` offres : un appel chacune
      au plus par entreprise, gardé 30 j ; sans clé, ni appelée ni comptée.
    Aucun tri métier du vendeur (c'est lui qui nomme le métier), jamais une offre de stage (#4044), sans doublon.
    ``searched=False`` seulement quand AUCUNE source n'a répondu — une liste vide ne se lit alors jamais « aucune
    offre ». Gardé 30 j quand Adzuna ET France Travail ont répondu, un jour sinon."""
    # Imports tardifs : ces modules sont lourds, et certains relisent celui-ci.
    from app.services.data_sources import apec, ats_boards, careers_pages, france_travail, wttj
    from app.services.domain_job_filters import _role_match_text, offer_matches_trade

    cleaned = (company or "").strip()
    wanted = " ".join((term or "").split())
    key = f"{_cache_key(cleaned)}|{_fold(wanted)}"
    hit = await provider_cache.get_json(_ACCOUNT_OFFER_SEARCH_NAMESPACE, key) if cleaned else None
    if isinstance(hit, Mapping) and isinstance(hit.get("offers"), list):
        return {"offers": [o for o in hit["offers"] if isinstance(o, dict)], "searched": True}
    if not cleaned:
        return {"offers": [], "searched": False}
    trade = tuple(t for t in (_role_match_text(wanted),) if t)
    site = _bare_domain(website) or None
    group = _scope(cleaned, None)

    def _about(rows: object) -> list[dict]:
        """Les offres ENTREPRISE d'une source, gardées si elles recoupent le métier cherché."""
        if not isinstance(rows, list):
            return []
        return [o for o in rows if isinstance(o, dict) and (not trade or offer_matches_trade(o, trade))]

    async def _adzuna() -> list[dict] | None:
        if not adzuna_configured() or not await adzuna_budget.analysis_allowed():
            return None
        brand = brand_name(cleaned) or cleaned
        return await _adzuna_search(
            f"{brand} {wanted}".strip(),
            cleaned,
            group,
            os.environ["ADZUNA_APP_ID"].strip(),
            os.environ["ADZUNA_APP_KEY"].strip(),
            client,
            limit=ACCOUNT_OFFER_SEARCH_MAX,
        )

    async def _careers() -> list[dict]:
        if not site:
            return []
        return await careers_pages.it_job_signals_careers(
            cleaned, site, limit=ACCOUNT_OFFER_SEARCH_MAX, all_roles=True
        )

    adzuna, ft, apec_rows, ats_rows, careers_rows, wttj_rows = await asyncio.gather(
        _adzuna(),
        france_travail.account_term_offers(cleaned, wanted, limit=ACCOUNT_OFFER_SEARCH_MAX),
        apec.it_job_signals_apec(cleaned, limit=ACCOUNT_OFFER_SEARCH_MAX, all_roles=True, siren=siren),
        ats_boards.it_job_signals_ats(
            cleaned, website=website, limit=ACCOUNT_OFFER_SEARCH_MAX, all_roles=True, siren=siren
        ),
        _careers(),
        wttj.it_job_signals_wttj(cleaned, limit=ACCOUNT_OFFER_SEARCH_MAX),
        return_exceptions=True,
    )
    searched = any(isinstance(rows, list) for rows in (adzuna, ft))
    merged: list[dict] = []
    seen: set[str] = set()

    def _add(rows: list[dict]) -> None:
        for offer in drop_internship_postings(rows, title_keys=("title",), contract_keys=("contractType",)):
            if _offer_key(offer) in seen:
                continue
            seen.add(_offer_key(offer))
            merged.append(offer)

    for rows in (adzuna, ft):
        if isinstance(rows, list):
            _add([o for o in rows if isinstance(o, dict)])
    for rows in (apec_rows, ats_rows, careers_rows, wttj_rows):
        _add(_about(rows))

    if len(merged) < offers_cascade.OFFERS_FLOOR:
        paid: tuple[tuple[str, Callable[[], Awaitable[list[dict]]]], ...] = (
            ("mantiks", lambda: mantiks_jobs(cleaned, scope=group, domain=site, client=client)),
            ("theirstack", lambda: theirstack_jobs(cleaned, scope=group, domain=site, client=client)),
            ("fantastic", lambda: fantastic_jobs(cleaned, scope=group, domain=site, client=client)),
        )
        for source, fetch in paid:
            if not _source_configured(source):
                continue
            try:
                rows = await _account_paid_offers(source, cleaned, fetch)
            except Exception as exc:  # noqa: BLE001 — une source payante ne casse jamais l'écran
                logger.warning("account_offer_search %s failed for %r: %s", source, cleaned, exc)
                continue
            searched = True
            _add(_about(rows))
            if len(merged) >= offers_cascade.OFFERS_FLOOR:
                break

    if not (searched or merged):
        return {"offers": [], "searched": False}
    offers = merged[:ACCOUNT_OFFER_SEARCH_MAX]
    complete = isinstance(adzuna, list) and isinstance(ft, list)
    await provider_cache.set_json(
        _ACCOUNT_OFFER_SEARCH_NAMESPACE,
        key,
        {"offers": offers},
        provider_cache.TTL_JOBS if offers and complete else provider_cache.TTL_EMPTY_JOBS,
    )
    return {"offers": offers, "searched": True}


async def _adzuna_search(
    what: str,
    cleaned: str,
    group: EmployerScope,
    app_id: str,
    app_key: str,
    client: httpx.AsyncClient | None,
    *,
    limit: int = _LIMIT,
) -> list[dict]:
    params = {
        "app_id": app_id,
        "app_key": app_key,
        "what": what,
        "results_per_page": _ADZUNA_PER_PAGE,
        # Paramètre documenté : rien de plus vieux que la fenêtre de fraîcheur.
        "max_days_old": _MAX_AGE_DAYS,
        "content-type": "application/json",
    }
    rows: list[tuple[str | None, dict]] = []
    for page in range(1, _ADZUNA_MAX_PAGES + 1):
        url = _ADZUNA_URL.format(country="fr", page=page)
        # DISCOVER-OFFRES (15/10, C) — chaque appel RÉSEAU compte dans le quota du jour (le cache = 0).
        await adzuna_budget.record_network_call()
        payload = await _request(
            "adzuna",
            cleaned,
            client,
            lambda http, url=url: http.get(url, params=params),
            lambda: throttle("adzuna"),
        )
        results = payload.get("results") if isinstance(payload, dict) else None
        page_rows = [_adzuna_row(hit) for hit in results or [] if isinstance(hit, dict)]
        _count_returned("adzuna", len(page_rows))
        group_rows = _keep_recent_attributed(page_rows, group, limit=_ADZUNA_PER_PAGE)
        rows.extend(page_rows)
        if (
            not group_rows
            or len(results or []) < _ADZUNA_PER_PAGE
            or len(_keep_recent_attributed(rows, group, limit=limit)) >= limit
        ):
            break
    return _keep_recent_attributed(rows, group, limit=limit)


def adzuna_configured() -> bool:
    """Les DEUX clés Adzuna sont posées ? Sans elles la source est un no-op voulu : elle n'est pas « tentée »."""
    return bool(os.environ.get("ADZUNA_APP_ID", "").strip() and os.environ.get("ADZUNA_APP_KEY", "").strip())


async def adzuna_skill_offers(
    term: str,
    *,
    max_pages: int,
    max_age_days: int,
    stats: dict[str, int] | None = None,
    where: str | None = None,
    meta: dict[str, int] | None = None,
) -> list[dict]:
    """COMPETENCE-TROUVE (20/10) — les offres Adzuna qui citent ``term`` (``what``), TOUS employeurs, en France.

    Mêmes paramètres DOCUMENTÉS que ``_adzuna_search`` (``what``, ``results_per_page``, ``max_days_old``) ;
    #4676 — ``where`` (documenté : developer.adzuna.com/docs/search, relu le 28/10/2026) part quand l'appelant pose
    un lieu (le NOM du département) ; sans lieu : la France, comme avant. Le rayon (``distance``) n'est pas envoyé :
    il ne figure pas dans la page de documentation relue, et un contrat non vérifiable ne se devine pas. La zone se
    juge encore en aval sur l'offre puis sur l'employeur résolu. NO-OP STRICT sans clés. Chaque appel réseau compte dans le quota du jour ;
    sans stage ; gracieux (panne → ce qui a déjà été lu).

    #4419 — ``stats`` (si fourni) dit CE QUI S'EST PASSÉ : ``pagesOk`` / ``pagesFailed`` (réponse absente : HTTP
    refusé, clé refusée en série, réseau), ``rawReturned`` (lignes brutes de la source) et ``noEmployer`` (lignes
    sans employeur, écartées ici). Un « 0 reçu » d'une source configurée ne se confond plus avec une panne.

    #5009.1 — ``meta`` (si fourni) reçoit ``total`` : le ``count`` que la première réponse REÇUE publie (nombre d'offres
    qui correspondent), zéro appel de plus. Absent ou illisible : aucune clé — jamais un total estimé."""
    app_id = os.environ.get("ADZUNA_APP_ID", "").strip()
    app_key = os.environ.get("ADZUNA_APP_KEY", "").strip()
    cleaned = (term or "").strip()
    if not app_id or not app_key or not cleaned:
        return []
    sink = stats if stats is not None else {}
    params = {
        "app_id": app_id,
        "app_key": app_key,
        "what": cleaned,
        "results_per_page": _ADZUNA_PER_PAGE,
        "max_days_old": max(1, int(max_age_days)),
        "content-type": "application/json",
    }
    if where and where.strip():
        params["where"] = where.strip()
    offers: list[dict] = []
    for page in range(1, max(1, int(max_pages)) + 1):
        url = _ADZUNA_URL.format(country="fr", page=page)
        await adzuna_budget.record_network_call()
        payload = await _request(
            "adzuna",
            cleaned,
            None,
            lambda http, url=url: http.get(url, params=params),
            lambda: throttle("adzuna"),
        )
        results = payload.get("results") if isinstance(payload, dict) else None
        count = payload.get("count") if isinstance(payload, dict) else None
        if meta is not None and page == 1 and isinstance(count, int) and not isinstance(count, bool) and count >= 0:
            meta["total"] = count
        sink["pagesOk" if isinstance(payload, dict) else "pagesFailed"] = (
            sink.get("pagesOk" if isinstance(payload, dict) else "pagesFailed", 0) + 1
        )
        hits = [hit for hit in results or [] if isinstance(hit, dict)]
        page_rows = [(_adzuna_row(hit), hit) for hit in hits]
        sink["rawReturned"] = sink.get("rawReturned", 0) + len(page_rows)
        sink["noEmployer"] = sink.get("noEmployer", 0) + sum(1 for (employer, _o), _h in page_rows if not employer)
        _count_returned("adzuna", len(page_rows))
        # #4419.5 — la localisation publiée (``location.area`` : « France › Hauts-de-France › Nord › Lille ») voyage
        # avec l'offre : la zone se juge sur le lieu de l'OFFRE avant le siège de l'employeur.
        offers.extend(
            {**offer, "area": _adzuna_area(hit)} for (employer, offer), hit in page_rows if employer and offer.get("title")
        )
        if len(results or []) < _ADZUNA_PER_PAGE:
            break
    return drop_internship_postings(offers, title_keys=("title",), contract_keys=("contractType",))


# ── #4724 (TS-C) — TheirStack ne cache rien : le STOCK des offres payées évite de les repayer ─────────────────
#
# Guide TheirStack « Avoiding getting the same job twice » : sans ``discovered_at_gte`` / ``job_id_not``, chaque rejeu
# repaie les mêmes offres. Le cache 30 j expire ; le STOCK (même clé, autre espace de noms) lui survit le temps de la
# fenêtre d'âge : offres payées + ``id`` + date du dernier appel. Au rejeu, on n'achète que les offres découvertes
# DEPUIS, et on sert le stock encore dans la fenêtre : jamais moins d'offres qu'un appel complet (la pertinence
# passe avant le coût). ``posted_at_max_age_days`` part toujours (règle « filtre obligatoire » de l'API).
STOCK_NAMESPACE_FICHE = "stock:theirstack:fiche"
STOCK_NAMESPACE_SKILL = "stock:theirstack:skill"
#: Le stock vit autant que la plus large fenêtre d'âge acceptée : une offre plus vieille n'en ressort de toute façon pas.
STOCK_TTL_S = _MAX_AGE_DAYS * 24 * 3600
#: Au plus N offres rangées au stock par clé (les plus récentes).
_STOCK_KEEP_MAX = 100
#: ``job_id_not`` n'est envoyé que tant que la liste reste courte (corps de requête borné).
_JOB_ID_NOT_MAX = 200


def utc_stamp() -> str:
    """L'instant présent, UTC, au format que ``discovered_at_gte`` accepte (pris AVANT l'appel : rien ne se perd entre deux)."""
    return datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%SZ")


def _usable_stock(stock: object, window: int) -> dict | None:
    """Le stock n'autorise un rejeu allégé que s'il a été lu sur une fenêtre au moins aussi large que celle d'aujourd'hui
    (sinon des offres de la bande élargie n'auraient jamais été payées) et s'il porte sa date d'appel."""
    if not isinstance(stock, dict) or not isinstance(stock.get("offers"), list):
        return None
    if not isinstance(stock.get("calledAt"), str) or _parse_date(stock["calledAt"]) is None:
        return None
    stored_window = stock.get("windowDays")
    if not isinstance(stored_window, int) or isinstance(stored_window, bool) or stored_window < window:
        return None
    return stock


def stock_offers(stock: object, window: int | None = None) -> list[dict]:
    """Les offres du stock ENCORE dans la fenêtre d'âge — une offre sortie de la fenêtre ne ressort pas, elle ne se
    rattrape pas en silence. Une offre sans date lisible n'est pas prouvée hors fenêtre : elle reste."""
    days = window if window is not None else _window_days(_THEIRSTACK_MAX_AGE_DAYS)
    usable = _usable_stock(stock, days)
    if usable is None:
        return []
    cutoff = datetime.now(UTC) - timedelta(days=days)
    kept: list[dict] = []
    for offer in usable["offers"]:
        if not isinstance(offer, dict):
            continue
        published = _parse_date(offer.get("date"))
        if published is not None and published < cutoff:
            continue
        kept.append(offer)
    return kept


def replay_filters(stock: object, window: int | None = None) -> dict[str, object]:
    """Les filtres anti-redite d'un rejeu : ``discovered_at_gte`` = date du dernier appel, ``job_id_not`` = les ids des
    offres du stock encore dans la fenêtre tant que la liste reste courte. ``{}`` : pas de stock exploitable, appel complet."""
    days = window if window is not None else _window_days(_THEIRSTACK_MAX_AGE_DAYS)
    kept = stock_offers(stock, days)
    usable = _usable_stock(stock, days)
    if usable is None or not kept:
        return {}
    out: dict[str, object] = {"discovered_at_gte": usable["calledAt"]}
    ids = sorted({o["sourceId"] for o in kept if isinstance(o.get("sourceId"), int)})
    if ids and len(ids) <= _JOB_ID_NOT_MAX:
        out["job_id_not"] = ids
    return out


def merge_stock(stored: Sequence[dict], fresh: Sequence[dict]) -> list[dict]:
    """Stock encore valable + offres neuves, sans doublon d'``id`` (la neuve gagne), plus récentes d'abord."""
    fresh_ids = {o["sourceId"] for o in fresh if isinstance(o.get("sourceId"), int)}
    merged = [o for o in stored if o.get("sourceId") not in fresh_ids] + list(fresh)
    seen: set[int] = set()
    unique: list[dict] = []
    for offer in merged:
        ident = offer.get("sourceId")
        if isinstance(ident, int):
            if ident in seen:
                continue
            seen.add(ident)
        unique.append(offer)
    _min = datetime.min.replace(tzinfo=UTC)
    unique.sort(key=lambda o: _parse_date(o.get("date")) or _min, reverse=True)
    return unique


def stock_record(called_at: str, offers: Sequence[dict], *, keep: int = _STOCK_KEEP_MAX, **extra: object) -> dict:
    """La forme rangée au stock : date d'appel, fenêtre lue, offres (bornées), + ce que l'appelant veut garder."""
    return {
        "calledAt": called_at,
        "windowDays": _window_days(_THEIRSTACK_MAX_AGE_DAYS),
        "offers": list(offers)[:keep],
        **extra,
    }


# ── Recherche PAR COMPÉTENCE (#4419, Louis 25/10) — TheirStack, Mantiks, Fantastic.jobs ────────────
#
# Découvrir par compétence a le droit de payer (geste utilisateur explicite ; la veille reste sans achat).
# On RÉUTILISE ici le socle des clients de la fiche — ``_request`` (limiteur, disjoncteur de clé, dégradation),
# ``_offer`` (contrat de sortie), ``run_metrics`` (coût), ``_fantastic_params`` / ``_mantiks_body`` /
# ``_theirstack`` (URL, France, 90 j, hors stage) — seule la REQUÊTE change : par intitulé de poste, tous employeurs.
# Chaque adaptateur : NO-OP STRICT sans sa clé (``[]`` ni appel réseau : l'appelant teste ``*_configured()``),
# ``None`` quand la source n'a pas répondu (panne : jamais rangé au cache, jamais confondu avec « aucune offre »),
# une page unique (``_PAID_PAGE_SIZE``) — le cache 30 j et le plafond d'appels vivent chez l'appelant.

_PAID_CONFIG_ENV = {
    "theirstack": "THEIRSTACK_API_KEY",
    "mantiks": "MANTIKS_API_KEY",
    "fantastic_jobs": "FANTASTIC_JOBS_API_KEY",
}


def paid_skill_source_configured(source: str) -> bool:
    """La clé de la source payante est posée ? Sinon : no-op voulu, elle n'est ni tentée ni comptée."""
    env = _PAID_CONFIG_ENV.get(source)
    return bool(env and os.environ.get(env, "").strip())


def zone_region_labels(zone: Sequence[str] | None) -> list[str]:
    """#4676 — les NOMS des régions qui couvrent les départements de ``zone`` (triés), ou ``[]`` : zone vide, ou un
    département que la table ne rattache à aucune région — alors aucun lieu n'est envoyé (jamais un lieu deviné,
    jamais une zone rétrécie sur un code inconnu). C'est aussi la part « lieu » des clés de cache des sources payantes."""
    from app.services import geo_labels

    wanted = {str(d).strip().upper() for d in zone or [] if str(d).strip()}
    if not wanted:
        return []
    labels: set[str] = set()
    covered: set[str] = set()
    for code, label in geo_labels._REGION_LABELS.items():
        inside = geo_labels.region_departments(code) & wanted
        if inside:
            labels.add(label)
            covered |= inside
    return sorted(labels) if covered == wanted else []


def _skill_body(
    cleaned: str, forms: Sequence[str], zone: Sequence[str] | None, since: str | None, exclude_ids: Sequence[int]
) -> dict[str, object]:
    """Le corps de la recherche par compétence SANS ``limit`` ni ``page`` : partagé par la page d'offres et par le compte
    (#4725), pour qu'ils ne puissent pas compter autre chose que ce qu'on achète."""
    titles = list(dict.fromkeys([cleaned, *[f.strip() for f in forms if f and f.strip()]]))
    body: dict[str, object] = {
        "job_title_or": titles,
        "job_title_pattern_not": title_patterns_not(),  # #4723 — le stage n'est pas payé
        "job_country_code_or": ["FR"],
        "posted_at_max_age_days": _window_days(_THEIRSTACK_MAX_AGE_DAYS),
    }
    regions = zone_region_labels(zone)
    if regions:
        body["job_location_pattern_or"] = regions
    if since:
        body["discovered_at_gte"] = since
    if exclude_ids:
        body["job_id_not"] = list(exclude_ids)
    return body


async def theirstack_skill_count(
    term: str,
    *,
    forms: Sequence[str] = (),
    zone: Sequence[str] | None = None,
    since: str | None = None,
    exclude_ids: Sequence[int] = (),
) -> int | None:
    """#4725 — combien d'offres la recherche par compétence ramènerait, pour 1 crédit (0 résultat = gratuit).

    Guide « Counting results » : ``include_total_results`` + ``limit:1`` rend ``metadata.total_results``. Le drapeau
    « lit tout le jeu de données » (réponse lente) : il ne part QUE sur cette requête séparée, jamais sur celle qui
    ramène les offres. ``None`` : pas de clé, pas de réponse ou total illisible — l'appelant paie comme avant."""
    key = os.environ.get("THEIRSTACK_API_KEY", "").strip()
    cleaned = (term or "").strip()
    if not key or not cleaned:
        return None
    body = _skill_body(cleaned, forms, zone, since, exclude_ids)
    body.update(limit=1, page=0, include_total_results=True)
    headers = {"Authorization": f"Bearer {key}", "Content-Type": "application/json"}
    payload = await _request(
        "theirstack",
        cleaned,
        None,
        lambda http: http.post(_THEIRSTACK_URL, json=body, headers=headers),
        lambda: throttle("theirstack"),
    )
    meta = payload.get("metadata") if isinstance(payload, dict) else None
    total = meta.get("total_results") if isinstance(meta, dict) else None
    if not isinstance(total, int) or isinstance(total, bool) or total < 0:
        return None
    if total:
        run_metrics.record_cost(get_correlation_id(), "theirstack", provider_pricing.unit_cost_per_result_usd("theirstack"))
    return total


async def theirstack_skill_offers(
    term: str,
    *,
    forms: Sequence[str] = (),
    zone: Sequence[str] | None = None,
    page: int = 0,
    meta: dict | None = None,
    since: str | None = None,
    exclude_ids: Sequence[int] = (),
    limit: int = PAID_SKILL_PAGE_SIZE,
) -> list[dict] | None:
    """Les offres TheirStack dont l'INTITULÉ cite ``term`` ou l'une de ses écritures ``forms`` (``job_title_or``,
    une liste : aucun appel de plus), France, 90 j, une page de ``PAID_SKILL_PAGE_SIZE`` (#4676).
    ``zone`` (départements) posée ⇒ ``job_location_pattern_or`` porte le NOM des régions qui la couvrent (documenté,
    marqué « deprecated » par TheirStack au profit de ``job_location_or`` qui exige des identifiants du catalogue
    des lieux — non lus ici). ``meta["full"]`` dit si la page est pleine (la suivante a des chances d'exister).
    #4724 — ``since`` (``discovered_at_gte``) et ``exclude_ids`` (``job_id_not``) : un rejeu ne paie que les offres neuves.
    Louis 01/11/2026 — ``limit`` (≤ ``PAID_SKILL_PAGE_SIZE``) : la taille de page que le budget de crédits de la recherche
    autorise ; toutes les pages d'une même lecture portent la MÊME ``limit`` (``page × limit`` reste un décalage juste).
    ``meta["returned"]`` : offres RENDUES (= crédits facturés), avant tout tri.
    1 crédit par offre RENDUE, gardée ou non (``run_metrics``). ``None`` : la source n'a pas répondu."""
    key = os.environ.get("THEIRSTACK_API_KEY", "").strip()
    cleaned = (term or "").strip()
    if not key or not cleaned:
        return []
    body = _skill_body(cleaned, forms, zone, since, exclude_ids)
    size = max(1, min(PAID_SKILL_PAGE_SIZE, int(limit)))
    body["limit"] = size
    body["page"] = max(0, int(page))
    headers = {"Authorization": f"Bearer {key}", "Content-Type": "application/json"}
    payload = await _request(
        "theirstack",
        cleaned,
        None,
        lambda http: http.post(_THEIRSTACK_URL, json=body, headers=headers),
        lambda: throttle("theirstack"),
    )
    if not isinstance(payload, dict):
        return None
    hits = [h for h in payload.get("data") or [] if isinstance(h, dict)]
    if meta is not None:
        meta["full"] = len(hits) >= size
        meta["returned"] = len(hits)
    if hits:
        run_metrics.record_cost(
            get_correlation_id(), "theirstack", len(hits) * provider_pricing.unit_cost_per_result_usd("theirstack")
        )
        _count_returned("theirstack", len(hits))
    offers = [
        _offer(
            title=_clean(hit.get("job_title")) or "",
            city=_clean(hit.get("location")),
            date=hit.get("date_posted"),
            contract=None,
            company=_clean(hit.get("company")),
            url=_clean(hit.get("final_url")) or _clean(hit.get("url")),
            source="theirstack",
            source_id=hit.get("id"),
        )
        for hit in hits
    ]
    return drop_internship_postings(
        [o for o in offers if o["title"] and o["company"]], title_keys=("title",), contract_keys=("contractType",)
    )


async def fantastic_skill_offers(term: str) -> list[dict] | None:
    """Les offres Fantastic.jobs dont l'INTITULÉ cite ``term`` (paramètre ``title`` de ``/v1/active-jb``), France,
    hors stage, une page de 25 ; coût réel lu dans ``x-api-jobs-this-request``. ``None`` : pas de réponse."""
    key = os.environ.get("FANTASTIC_JOBS_API_KEY", "").strip()
    cleaned = (term or "").strip()
    if not key or not cleaned:
        return []
    # INCIDENT 26/10 — Fantastic.jobs a renommé `title_filter` en `title` et refuse tout paramètre inconnu (400).
    params = _fantastic_params({"title": f'"{cleaned}"', "exclude_ats_duplicate": "true"})
    headers = {"Authorization": f"Bearer {key}"}
    meta: dict = {}
    payload = await _request(
        "fantastic_jobs",
        cleaned,
        None,
        lambda http: http.get(_FANTASTIC_JB_URL, params=params, headers=headers),
        lambda: throttle("fantastic_jobs"),
        headers_out=meta,
    )
    if not isinstance(payload, list):
        return None
    hits = [h for h in payload if isinstance(h, dict)]
    if hits:
        billed = _header_count(meta.get("x-api-jobs-this-request"), default=len(hits))
        cost = billed * provider_pricing.unit_cost_per_result_usd("fantastic_jobs")
        run_metrics.record_cost(get_correlation_id(), "fantastic_jobs", cost)
        _log_paid_call("fantastic_jobs", "active-jb/skill", cost)
        _count_returned("fantastic_jobs", len(hits))
    offers: list[dict] = []
    for hit in hits:
        locations = hit.get("locations_derived")
        offer = _offer(
            title=_clean(hit.get("title")) or "",
            city=_clean(locations[0]) if isinstance(locations, list) and locations else None,
            date=hit.get("date_posted"),
            contract=None,
            company=_clean(hit.get("organization")),
            url=_clean(hit.get("url")),
            source="fantastic_jobs",
        )
        if offer["title"] and offer["company"]:
            offers.append(offer)
    return drop_internship_postings(offers, title_keys=("title",), contract_keys=("contractType",))


async def mantiks_skill_offers(term: str, *, forms: Sequence[str] = ()) -> list[dict] | None:
    """Les offres Mantiks dont l'INTITULÉ cite ``term``, via ``POST /searches/preview`` (contrat déjà lu pour le
    volume d'offres : ``job.job_title_include``, France, 90 j, hors stage ; lignes ``{company, job}``).
    Coût enregistré à 0 crédit (l'aperçu est gratuit) mais l'appel compte dans le plafond d'achats. Un champ que la
    ligne ne porte pas reste absent : une offre sans date ou sans employeur n'entre pas. ``None`` : pas de réponse.
    #4676 — les écritures ``forms`` rejoignent ``job_title_include`` (une liste). Aucun lieu n'est envoyé : la France
    reste le seul lieu dont le contrat soit connu ici (``locations`` exige des identifiants Geonames que ce dépôt
    ne sait pas tirer d'un département — non vérifiable, donc non deviné)."""
    from app.services.data_sources import mantiks_volume

    key = os.environ.get("MANTIKS_API_KEY", "").strip()
    cleaned = (term or "").strip()
    if not key or not cleaned:
        return []
    body = mantiks_volume._body([])
    body["job"]["job_title_include"] = list(dict.fromkeys([cleaned, *[f.strip() for f in forms if f and f.strip()]]))
    headers = {"X-API-KEY": key, "accept": "application/json"}
    payload = await _request(
        "mantiks",
        cleaned,
        None,
        lambda http: http.post(mantiks_volume._PREVIEW_URL, json=body, headers=headers),
        lambda: throttle("mantiks"),
    )
    if payload is None:
        return None
    _log_paid_call("mantiks", "searches/preview", 0.0)
    offers: list[dict] = []
    for row in mantiks_volume._rows(payload):
        company = row.get("company") if isinstance(row.get("company"), dict) else {}
        job = row.get("job") if isinstance(row.get("job"), dict) else {}
        location = job.get("location") if isinstance(job.get("location"), dict) else {}
        offer = _offer(
            title=_clean(job.get("job_title")) or "",
            city=_clean(location.get("city")) or _clean(location.get("full_name")),
            date=job.get("published_date"),
            contract=_mantiks_contract(job),
            company=_clean(company.get("name")),
            url=_clean(job.get("job_url")),
            source="mantiks",
        )
        if offer["title"] and offer["company"]:
            offers.append(offer)
    _count_returned("mantiks", len(offers))
    return drop_internship_postings(offers, title_keys=("title",), contract_keys=("contractType",))


# ── Jooble ───────────────────────────────────────────────────────────────────


def _jooble_host() -> str:
    """#4016 SIG-D1 — « chaque domaine pays exige sa propre clé » (doc Jooble) : l'hôte
    est réglable par ``JOOBLE_HOST``. Absent ou mal formé ⇒ l'hôte historique."""
    raw = os.environ.get("JOOBLE_HOST", "").strip().lower()
    host = re.sub(r"^[a-z]+://", "", raw).rstrip("/")
    return host if re.fullmatch(r"[a-z0-9]([a-z0-9.-]*[a-z0-9])?", host) else _JOOBLE_DEFAULT_HOST


@provider_cache.cached_by(
    "jobs:jooble", _cache_key, ttl=provider_cache.TTL_JOBS, empty_ttl=provider_cache.TTL_EMPTY_JOOBLE
)
async def jooble_jobs(
    company: str, *, scope: EmployerScope | None = None, client: httpx.AsyncClient | None = None
) -> list[dict]:
    """Offres Jooble de ``company``. NO-OP STRICT sans ``JOOBLE_API_KEY``.

    DECATHLON 11/10 — contrat relu (help.jooble.org, « REST API documentation ») :
    ``POST https://jooble.org/api/{clé}``, corps JSON ``keywords``/``location``/
    ``page``/``ResultOnPage``. Le code y est conforme ; un 403 constant sur TOUS
    les comptes est donc un refus de la CLÉ (à vérifier côté compte partenaire),
    pas un format de requête à deviner."""
    key = os.environ.get("JOOBLE_API_KEY", "").strip()
    cleaned = (company or "").strip()
    if not key or not cleaned:
        return []
    host = _jooble_host()
    group = _scope(cleaned, scope)
    rows: list[tuple[str | None, dict]] = []
    for page in (1, 2):
        # #4016 SIG-D1 — `companysearch: true` (doc : « searches company names »,
        # sinon titres et descriptions) : on cherche une ENTREPRISE.
        body = {
            "keywords": cleaned,
            "location": "France",
            "page": page,
            "ResultOnPage": _JOOBLE_PER_PAGE,
            "companysearch": True,
        }
        payload = await _request(
            "jooble",
            cleaned,
            client,
            lambda http, body=body: http.post(_JOOBLE_URL.format(host=host, key=key), json=body),
            lambda: throttle("jooble"),
        )
        jobs = payload.get("jobs") if isinstance(payload, dict) else None
        _count_returned("jooble", sum(1 for hit in jobs or [] if isinstance(hit, dict)))
        for hit in jobs or []:
            if not isinstance(hit, dict):
                continue
            employer = _clean(hit.get("company"))
            rows.append(
                (
                    employer,
                    _offer(
                        title=_clean(hit.get("title")) or "",
                        city=_clean(hit.get("location")),
                        date=hit.get("updated"),
                        contract=_clean(hit.get("type")),
                        company=employer,
                        url=_clean(hit.get("link")),
                        source="jooble",
                    ),
                )
            )
        # Page 2 seulement si la 1re est pleine ET n'a pas rempli le plafond :
        # le gratuit est limité à 500 requêtes À VIE par clé.
        if len(jobs or []) < _JOOBLE_PER_PAGE or len(_keep_recent_attributed(rows, group, limit=_LIMIT)) >= _LIMIT:
            break
    return _keep_recent_attributed(rows, group, limit=_LIMIT)


# ── TheirStack (offres LinkedIn / Indeed / WTTJ / ATS, sous contrat) ─────────


def _bare_domain(value: object) -> str:
    s = str(value or "").strip().lower()
    s = re.sub(r"^[a-z]+://", "", s).split("/")[0].split(":")[0]
    return s[4:] if s.startswith("www.") else s


def _name_forms(company: str) -> list[str]:
    """#4182 — les graphies sous lesquelles les fournisseurs rangent l'employeur : la MARQUE
    (raison sociale sans pays ni forme juridique : « SIEMENS SAS » → « SIEMENS ») d'abord, puis
    la graphie tapée ; chacune telle quelle et en casse de titre (l'égalité est sensible à la
    casse chez Fantastic). Jamais le SIREN, jamais un nom deviné."""
    out: list[str] = []
    for variant in reversed([v for v in company_name_variants(company) if not v.isdigit()]):
        for form in (variant, variant.title()):
            if form not in out:
                out.append(form)
    return out


_DEPARTMENT_SUFFIX_RE = re.compile(r"\s+[—–-]\s+.*$")


def _search_name(company: str) -> str:
    """OFFRES-VEILLE (16/10) — le nom de l'ESPACE peut porter un service (« DHL Express France —
    Direction des systèmes d'information ») : la recherche d'une société ne reçoit que la marque,
    sans le suffixe après un tiret espacé. L'appariement ``same_employer`` reste strict."""
    return _DEPARTMENT_SUFFIX_RE.sub("", company or "").strip() or (company or "").strip()


def _theirstack_names(group: EmployerScope) -> list[str]:
    """``company_name_or`` est une égalité de NOM : « DECATHLON » seul rendait 0 offre. On
    envoie la graphie tapée, sa forme usuelle et les SEULES entités du groupe dont le
    registre donne le SIREN (``siren_names``) — jamais un nom deviné (GIE, immobilier) :
    TheirStack facture chaque offre rendue, gardée ou non. Borné à ``_THEIRSTACK_MAX_NAMES``."""
    out: list[str] = []
    for name in (*_name_forms(group.company), *group.siren_names):
        if name and name not in out:
            out.append(name)
    return out[:_THEIRSTACK_MAX_NAMES]


async def theirstack_jobs(
    company: str,
    *,
    scope: EmployerScope | None = None,
    domain: str | None = None,
    facts: dict | None = None,
    client: httpx.AsyncClient | None = None,
) -> list[dict]:
    """Offres TheirStack de ``company`` (voir :func:`_theirstack_search`).

    CACHE-SOURCES (15/10) — l'entreprise est payée UNE fois par TTL : ni métier ni plafond
    dans la requête ni dans la clé, le tri se fait chez l'appelant, à la lecture.

    SIG-A (A4) — ``facts`` reçoit ce que les offres GARDÉES disent de l'employeur
    (``technologies``, ``employeeCount``) : lu dans la même réponse payée, mis
    en cache avec elle, jamais un second appel."""
    found = await _theirstack_search(company, scope=scope, domain=domain, client=client)
    if isinstance(found, list):  # forme d'avant A4, encore en cache
        return found
    if not isinstance(found, dict):
        return []
    if facts is not None and isinstance(found.get("employer"), dict):
        facts.update(found["employer"])
    return [o for o in found.get("offers") or [] if isinstance(o, dict)]


def _employer_facts(hits: list[tuple[dict, str | None]], group: EmployerScope, site: str) -> dict:
    """SIG-A (A4) — pile et effectif de l'employeur, lus sur les SEULES offres
    rattachées au groupe. Effectif : la fiche dont le domaine est le site du
    compte, sinon celle qui porte son nom exact ; aucune ⇒ absent (jamais deviné)."""
    counts: dict[str, int] = {}
    headcount: int | None = None
    by_name: int | None = None
    for hit, employer in hits:
        if not group.matches(employer):
            continue
        for slug in hit.get("technology_slugs") or []:
            if isinstance(slug, str) and slug.strip():
                counts[slug.strip()] = counts.get(slug.strip(), 0) + 1
        obj = hit.get("company_object") if isinstance(hit.get("company_object"), dict) else {}
        size = obj.get("employee_count")
        if not isinstance(size, int) or isinstance(size, bool) or size <= 0:
            continue
        if headcount is None and site and _bare_domain(obj.get("domain")) == site:
            headcount = size
        if by_name is None and _fold(obj.get("name")) == _fold(group.company):
            by_name = size
    out: dict = {}
    if counts:
        ranked = sorted(counts, key=lambda slug: -counts[slug])  # tri stable : ordre d'apparition à égalité
        out["technologies"] = ranked[:_PUBLISHED_TECH_MAX]
    size = headcount if headcount is not None else by_name
    if size is not None:
        out["employeeCount"] = size
    return out


def merge_published_technologies(detected: list, facts: dict | None) -> list:
    """SIG-A (A4) — la pile détectée sur le site, complétée par les technologies
    des offres publiées ; même champ (``detectedTechStack``), jamais une 2ᵉ forme.
    Une technologie déjà connue (casse ignorée) n'est pas répétée."""
    out = list(detected)
    seen = {_fold(t).replace(" ", "") for t in out if isinstance(t, str)}
    for slug in (facts or {}).get("technologies") or []:
        key = _fold(slug).replace(" ", "")
        if isinstance(slug, str) and key and key not in seen:
            seen.add(key)
            out.append(slug)
    return out


def published_headcount_label(current: object, facts: dict | None) -> str | None:
    """SIG-A (A4) — l'effectif lu sur les offres publiées, SEULEMENT quand le
    compte n'en a aucun (pas un chiffre) : une valeur connue n'est jamais écrasée."""
    if re.search(r"\d", str(current or "")):
        return None
    size = (facts or {}).get("employeeCount")
    if not isinstance(size, int) or isinstance(size, bool) or size <= 0:
        return None
    return f"{size:,} salariés (offres publiées)".replace(",", " ")


@provider_cache.cached_by(
    "jobs:theirstack",
    _cache_key,
    ttl=provider_cache.TTL_JOBS,
    empty_ttl=provider_cache.TTL_EMPTY_JOBS,
)
async def _theirstack_search(
    company: str,
    *,
    scope: EmployerScope | None = None,
    domain: str | None = None,
    client: httpx.AsyncClient | None = None,
) -> dict:
    """Offres TheirStack de ``company``. NO-OP STRICT sans ``THEIRSTACK_API_KEY``.

    PAYANT au résultat : le coût (crédits rendus × prix unitaire) est inscrit
    dans ``run_metrics`` du run courant — jamais deviné, surchargeable par
    ``COST_PER_RESULT_USD_THEIRSTACK``.

    CACHE-SOURCES (15/10) — UNE page des ``_PAID_PAGE_SIZE`` (25) offres les plus récentes
    par entreprise, jamais de pagination, jamais de filtre métier envoyé
    (``job_title_pattern_or`` retiré ; seul ``job_title_pattern_not`` part, #4723 : le stage) : le résultat, gardé 30 j sous la clé « entreprise
    seule », sert tous les espaces. Les noms envoyés se limitent au compte et aux entités
    dont le SIREN est connu (``_theirstack_names``).

    DECATHLON 11/10 — domaine du compte CONNU ⇒ requête par domaine
    (``company_domain_or``), qui couvre toutes les entités publiant sous ce site ;
    rien rendu ⇒ UNE requête par noms du groupe. SIG-A (A2) — rien rendu non plus ⇒
    les mêmes noms sans la casse (une requête vide ne coûte aucun crédit)."""
    key = os.environ.get("THEIRSTACK_API_KEY", "").strip()
    cleaned = (company or "").strip()
    if not key or not cleaned:
        return {}
    group = _scope(cleaned, scope)
    site = _bare_domain(domain)
    window = _window_days(_THEIRSTACK_MAX_AGE_DAYS)
    base: dict[str, object] = {
        "job_title_pattern_not": title_patterns_not(),  # #4723 — le stage n'est pas payé
        "job_country_code_or": ["FR"],
        "posted_at_max_age_days": window,
        "limit": _PAID_PAGE_SIZE,
        "page": 0,
    }
    names = _theirstack_names(group)
    # SIG-A (A2) — repli documenté « match these names exactly, case-insensitively »
    # quand domaine et graphie exacte ne rendent rien.
    names_ci = list({n.lower(): n for n in reversed(names)}.values())[::-1]
    identities = ([{"company_domain_or": [site]}] if site else []) + [
        {"company_name_or": names},
        {"company_name_case_insensitive_or": names_ci},
    ]
    # #4724 — le cache 30 j a expiré mais le STOCK (même clé) survit : on ne paie que les offres découvertes DEPUIS le
    # dernier appel, par la requête d'identité qui avait répondu (une autre pourrait rendre d'AUTRES entités).
    stock_key = _cache_key(cleaned, scope, domain)
    stock = await provider_cache.get_json(STOCK_NAMESPACE_FICHE, stock_key)
    stored = stock_offers(stock, window)
    replay = replay_filters(stock, window)
    replay_identity = next((i for i in identities if isinstance(stock, dict) and stock.get("identity") in i), None)
    if replay and replay_identity is None:
        replay, stored = {}, []
    if replay:
        identities = [replay_identity]
    headers = {"Authorization": f"Bearer {key}", "Content-Type": "application/json"}
    called_at = utc_stamp()
    answered: str | None = None
    answered_ok = False
    rows: list[tuple[str | None, dict]] = []
    raw: list[tuple[dict, str | None]] = []
    for identity in identities:
        body = {**identity, **base, **replay}
        payload = await _request(
            "theirstack",
            cleaned,
            client,
            lambda http, body=body: http.post(_THEIRSTACK_URL, json=body, headers=headers),
            lambda: throttle("theirstack"),
        )
        answered_ok = answered_ok or isinstance(payload, dict)
        data = payload.get("data") if isinstance(payload, dict) else None
        hits = [h for h in data or [] if isinstance(h, dict)]
        if not hits:
            continue
        answered = next(iter(identity))
        # #3885 — 1 crédit par offre RENDUE, gardée ou non.
        run_metrics.record_cost(
            get_correlation_id(), "theirstack", len(hits) * provider_pricing.unit_cost_per_result_usd("theirstack")
        )
        _count_returned("theirstack", len(hits))
        # Une offre rendue par la requête DOMAINE est prouvée par le site du compte.
        by_domain = "company_domain_or" in identity
        for hit in hits:
            employer = _clean(hit.get("company"))
            raw.append((hit, employer))
            if by_domain and _bare_domain(hit.get("company_domain")) == site and not group.matches(employer):
                # Entité du groupe sous un autre nom (marque) : le site la prouve.
                group = EmployerScope.build(
                    group.company,
                    siren=group.siren,
                    known_names=(*group.known_names, employer),
                    known_sirens=group.known_sirens,
                    siren_names=group.siren_names,
                )
            rows.append(
                (
                    employer,
                    _offer(
                        title=_clean(hit.get("job_title")) or "",
                        city=_clean(hit.get("location")),
                        date=hit.get("date_posted"),
                        contract=None,  # aucun champ contrat vérifié — jamais deviné
                        company=employer,
                        # L'annonce d'origine (ATS de l'employeur) avant la page d'agrégateur.
                        url=_clean(hit.get("final_url")) or _clean(hit.get("url")),
                        source="theirstack",
                        source_id=hit.get("id"),
                    ),
                )
            )
            # SIG-B — l'équipe de recrutement NOMMÉE par l'offre (même réponse, 0 crédit de plus).
            team = _theirstack_hiring_team(hit)
            if team:
                rows[-1][1]["recruiters"] = team
        break
    fresh = _keep_recent_attributed(rows, group, limit=_STOCK_KEEP_MAX)
    known = stock.get("employer") if stored and isinstance(stock, dict) and isinstance(stock.get("employer"), dict) else {}
    facts = {**known, **_employer_facts(raw, group, site)}
    # #4724 — le stock encore dans la fenêtre + les neuves : jamais moins qu'un appel complet. Panne au rejeu : le stock.
    merged = merge_stock(stored, fresh)
    if answered_ok and merged:
        await provider_cache.set_json(
            STOCK_NAMESPACE_FICHE,
            stock_key,
            stock_record(called_at, merged, identity=answered or stock.get("identity"), employer=facts),
            STOCK_TTL_S,
        )
    offers = merged[:_PAID_PAGE_SIZE]
    # Vide ⇒ ``{}`` (falsy) : le cache garde sa règle d'avant sur le vide.
    return {"offers": offers, "employer": facts} if offers else {}


def _theirstack_hiring_team(hit: dict) -> list[dict]:
    """SIG-B — ``hiring_team[]`` documenté (``full_name``, ``role``, ``linkedin_url`` ;
    theirstack.com/en/docs/api-reference/jobs/search_jobs_v1). Une personne sans nom
    complet est ignorée ; la photo n'est jamais reprise ; champ absent → clé absente."""
    team: list[dict] = []
    for member in hit.get("hiring_team") or []:
        if not isinstance(member, dict) or not _clean(member.get("full_name")):
            continue
        person = {"fullName": _clean(member.get("full_name"))}
        if _clean(member.get("role")):
            person["role"] = _clean(member.get("role"))
        if _clean(member.get("linkedin_url")):
            person["linkedinUrl"] = _clean(member.get("linkedin_url"))
        team.append(person)
    return team


# ── Mantiks (offres Indeed / LinkedIn… pour la prospection B2B, sous contrat) ─


def _log_paid_call(source: str, endpoint: str, cost: float) -> None:
    """DISCOVER-OFFRES (15/10, E) — une ligne INFO par appel RÉSEAU d'une source payée (la lecture
    du cache est tracée par ``provider_cache`` : ``outcome=hit``). Jamais une clé ni une URL."""
    logger.info("%s %s cache=miss coût=%s", source, endpoint, round(cost, 6))


def _board_duplicate(offer: dict, kept: list[dict]) -> bool:
    """Même offre reprise par un autre jobboard : titre normalisé + ville, date à ±3 jours."""
    key = _offer_key(offer)
    when = _parse_date(offer.get("date"))
    for other in kept:
        if _offer_key(other) != key:
            continue
        seen = _parse_date(other.get("date"))
        if when is None or seen is None or abs((when - seen).days) <= _BOARD_DEDUP_DAYS:
            return True
    return False


def _dedup_job_boards(offers: list[dict]) -> list[dict]:
    kept: list[dict] = []
    for offer in offers:
        if not _board_duplicate(offer, kept):
            kept.append(offer)
    return kept


def _mantiks_body() -> dict:
    """Corps exigé par le contrat (champs requis, aucune clé en plus). DISCOVER-OFFRES (15/10) :
    la France (la doc exige ≥ 1 lieu — ``[]`` était un défaut invalide), 90 jours, hors stage."""
    return {
        "locations": [dict(_MANTIKS_FRANCE)],
        "job_title_query": None,
        "job_title_include": [],
        "job_title_exclude": [],
        "description_include": [],
        "description_exclude": [],
        "description_query": None,
        "published_date_window_days": _PAID_WINDOW_DAYS,
        "contract_types_exclude": ["internship"],
        "volume": {"gte": None, "lte": None},
        "is_reposting": False,
    }


def _mantiks_contract(hit: dict) -> str | None:
    types = hit.get("contract_types")
    first = next((t for t in types if _clean(t)), None) if isinstance(types, list) else None
    return _clean(first)  # tel que rendu par le fournisseur — jamais traduit au hasard


#: GROUPE-FRANCE (16/10) — un mot de pays dans le nom d'une fiche (ou un champ pays hors France)
#: écarte l'entité : « rester en France ». Liste fermée, repliée (sans accent ni casse).
_FOREIGN_WORDS = frozenset(
    {"brasil", "brazil", "bresil", "greece", "grece", "espana", "spain", "espagne", "italia", "italy", "italie"}
    | {"uk", "usa", "deutschland", "germany", "allemagne", "portugal", "belgium", "belgique", "polska", "poland"}
    | {"pologne", "nederland", "netherlands", "pays-bas", "romania", "roumanie", "maroc", "morocco", "tunisie"}
    | {"china", "chine", "india", "inde", "mexico", "mexique", "argentina", "chile", "canada", "suisse", "switzerland"}
    | {"turkey", "turkiye", "russia", "ukraine", "hungary", "magyarorszag", "czech", "sverige", "sweden", "danmark"}
)
_FRANCE_CODES = frozenset({"fr", "fra", "france"})


def _mantiks_max_entities() -> int:
    """Réglage UNIQUE (GA-26) du nombre d'entités d'un groupe dont on achète les offres (1 crédit chacune)."""
    try:
        return max(1, int(os.environ.get("MANTIKS_MAX_ENTITIES", "5").strip()))
    except ValueError:
        return 5


def _foreign_entity(hit: dict) -> bool:
    country = _fold(hit.get("country_code") or hit.get("country"))
    if country and country not in _FRANCE_CODES:
        return True
    return any(token in _FOREIGN_WORDS for token in _fold(hit.get("name")).split())


def _mantiks_entities(
    found: list[dict], group: EmployerScope, cleaned: str, site: str, brands: list[str]
) -> list[dict]:
    """GROUPE-FRANCE (16/10) — des fiches rendues par les recherches gratuites, celles à ACHETER :
    du groupe (nom exact, entité connue, marque + subdivision), françaises, une par id. Ordre :
    domaine du compte, puis nom exact, puis l'ordre rendu ; un nom distinct passe avant un doublon
    de nom (cinq fiches « Decathlon France » ne mangent pas le plafond)."""
    seen: set[str] = set()
    pool: list[dict] = []
    for hit in found:
        ident = str(hit.get("id") or "")
        if not ident or ident in seen or _foreign_entity(hit):
            continue
        name = _search_name(_clean(hit.get("name")) or "")  # « Decathlon United - Villeneuve-d'Ascq » → « Decathlon United »
        if not name or not (group.matches(name) or any(same_group_employer(name, b) for b in brands)):
            continue
        seen.add(ident)
        pool.append(hit)

    def rank(hit: dict) -> int:
        if site and _bare_domain(hit.get("domain") or hit.get("website")) == site:
            return 0
        return 1 if same_employer(_clean(hit.get("name")), cleaned) else 2

    pool.sort(key=rank)  # stable : l'ordre rendu départage
    names: set[str] = set()
    first: list[dict] = []
    rest: list[dict] = []
    for hit in pool:
        key = _fold(hit.get("name"))
        (rest if key in names else first).append(hit)
        names.add(key)
    return [*first, *rest][: _mantiks_max_entities()]


@provider_cache.cached_by(
    "jobs:mantiks",
    lambda entity_id, **_: f"e1|mantiks:{entity_id}" if entity_id else "",
    ttl=provider_cache.TTL_JOBS,
    empty_ttl=provider_cache.TTL_EMPTY_MANTIKS,
)
async def _mantiks_entity_jobs(
    entity_id: object, *, name: str, headers: dict, client: httpx.AsyncClient | None
) -> list[dict]:
    """Les offres d'UNE entité Mantiks (1 crédit), gardées 30 j sous l'id de l'entité : partagé
    entre espaces, un groupe n'est jamais payé deux fois. VC.2 (18/10) — une entité SANS offre
    se garde 7 j (``TTL_EMPTY_MANTIKS``) : le crédit est payé, vide ou pas. Offres brutes de l'entité (France, 90 j,
    hors stage) ; l'attribution a été décidée à la sélection de l'entité."""
    payload = await _request(
        "mantiks",
        name,
        client,
        lambda http: http.post(_MANTIKS_JOBS_URL.format(id=entity_id), json=_mantiks_body(), headers=headers),
        lambda: throttle("mantiks"),
    )
    if not isinstance(payload, dict):
        return []
    # 1 crédit par appel réussi (doc : « Credits: 1 »).
    credit = provider_pricing.unit_cost_per_result_usd("mantiks")
    run_metrics.record_cost(get_correlation_id(), "mantiks", credit)
    _log_paid_call("mantiks", "companies/jobs", credit)
    await mantiks_balance.check_balance(client=client)  # alerte sous 10 % du solde, au plus 1×/h ; ne lève jamais
    _count_returned("mantiks", sum(1 for hit in payload.get("jobs") or [] if isinstance(hit, dict)))
    offers: list[dict] = []
    for hit in payload.get("jobs") or []:
        if not isinstance(hit, dict):
            continue
        location = hit.get("location") if isinstance(hit.get("location"), dict) else {}
        offer = _offer(
            title=_clean(hit.get("job_title")) or "",
            city=_clean(location.get("city")) or _clean(location.get("full_name")),
            date=hit.get("published_date"),
            contract=_mantiks_contract(hit),
            company=name,
            url=_clean(hit.get("job_url")),
            source="mantiks",
        )
        if _clean(hit.get("job_board")):
            offer["board"] = _clean(hit.get("job_board"))
        offers.append(offer)
    return offers


async def mantiks_jobs(
    company: str,
    *,
    scope: EmployerScope | None = None,
    domain: str | None = None,
    client: httpx.AsyncClient | None = None,
) -> list[dict]:
    """Offres Mantiks du GROUPE de ``company``. NO-OP STRICT sans ``MANTIKS_API_KEY``.

    #3885 (lot RAV) — ``GET /companies/search`` (0 crédit) retrouve les sociétés,
    ``POST /companies/{id}/jobs`` (1 crédit) rend les offres d'UNE société. Un crédit n'est dépensé
    que si le NOM de la société prouve le groupe : jamais d'achat sur un homonyme.

    GROUPE-FRANCE (16/10) — « un groupe = plusieurs sociétés » : toutes les recherches gratuites
    (domaine, nom, marque seule, filiales au SIREN connu) sont rassemblées ; les entités du groupe
    sont gardées (``same_group_employer``), les étrangères écartées, dédoublonnées par id, et
    au plus ``MANTIKS_MAX_ENTITIES`` (5) sont achetées. Cache 30 j PAR ENTITÉ.

    DISCOVER-OFFRES (15/10) — offres de la France sur 90 jours, hors stage ; jusqu'à 100 offres
    gardées par entité (1 crédit quel que soit leur nombre), dédoublonnées entre jobboards."""
    key = os.environ.get("MANTIKS_API_KEY", "").strip()
    cleaned = _search_name(company)
    if not key or not cleaned:
        return []
    headers = {"X-API-KEY": key, "accept": "application/json"}
    site = _bare_domain(domain)
    group = _scope(cleaned, scope)
    brands = list(dict.fromkeys(v for v in (*company_name_variants(cleaned), brand_name(cleaned)) if v and not v.isdigit()))
    queries = dict.fromkeys(
        q for q in (site, *brands[::-1][:2], *brands[:1], *group.siren_names[:_MANTIKS_MAX_EXTRA_QUERIES]) if q
    )
    found: list[dict] = []
    for query in queries:
        result = await _request(
            "mantiks",
            cleaned,
            client,
            lambda http, query=query: http.get(_MANTIKS_SEARCH_URL, params={"query": query}, headers=headers),
            lambda: throttle("mantiks"),
        )
        _log_paid_call("mantiks", "companies/search", 0.0)
        found.extend(c for c in (result if isinstance(result, list) else []) if isinstance(c, dict))
    offers: list[dict] = []
    for entity in _mantiks_entities(found, group, cleaned, site, brands):
        name = _clean(entity.get("name")) or cleaned
        bought = await _mantiks_entity_jobs(entity["id"], name=name, headers=headers, client=client)
        rows = [(o.get("company"), o) for o in bought if isinstance(o, dict)]
        offers.extend(_keep_recent_attributed(rows, EmployerScope.build(name), limit=len(rows) or 1))
    return _dedup_job_boards(offers)[:_MANTIKS_KEEP]


# ── Fantastic.jobs (offres des pages carrières / ATS) ────────────────────────


def _fantastic_params(extra: dict) -> dict:
    """DISCOVER-OFFRES (15/10) — le socle de TOUT appel Fantastic : la France, jamais de
    stage ni de bénévolat, 6 mois côté fournisseur et 90 jours côté date, UNE page de 25,
    pas de ``description_format`` (le corps des offres n'est pas demandé)."""
    # Incident 26/10 — le contrat type ``date_posted_gte`` en ``date-time`` (exemple documenté
    # ``2026-04-20T00:00:00``). Une date seule faisait refuser TOUS les appels Fantastic en 400,
    # y compris celui de la fiche entreprise : ce socle est partagé par tous les appelants.
    since = (datetime.now(UTC) - timedelta(days=_window_days(_PAID_WINDOW_DAYS))).strftime("%Y-%m-%dT00:00:00")
    return {
        **extra,
        "location": "France",
        "ai_employment_type": _FANTASTIC_EMPLOYMENT_TYPES,
        "time_frame": "6m",
        "date_posted_gte": since,
        "limit": _PAID_PAGE_SIZE,
    }


@provider_cache.cached_by(
    "jobs:fantastic_jobs", _cache_key, ttl=provider_cache.TTL_JOBS, empty_ttl=provider_cache.TTL_EMPTY_JOBS
)
async def fantastic_jobs(
    company: str,
    *,
    scope: EmployerScope | None = None,
    domain: str | None = None,
    client: httpx.AsyncClient | None = None,
) -> list[dict]:
    """Offres Fantastic.jobs de ``company``. NO-OP STRICT sans ``FANTASTIC_JOBS_API_KEY``.

    DISCOVER-OFFRES (15/10) — ``GET /v1/active-ats?domain=`` d'abord (les pages carrières de
    l'employeur, URL d'origine) ; rien rendu ⇒ ``GET /v1/active-jb?organization=`` (égalité
    SENSIBLE À LA CASSE : la graphie du compte puis la forme usuelle) avec
    ``exclude_ats_duplicate=true``. Une requête vide coûte 0 (facturé au résultat). Le coût réel
    est lu dans ``x-api-jobs-this-request``. UNE page de 25, jamais d'``offset``. L'attribution
    ``same_employer`` reste la preuve."""
    key = os.environ.get("FANTASTIC_JOBS_API_KEY", "").strip()
    cleaned = (company or "").strip()
    if not key or not cleaned:
        return []
    group = _scope(cleaned, scope)
    site = _bare_domain(domain)
    queries: list[tuple[str, str, dict]] = [("active-ats", _FANTASTIC_URL, _fantastic_params({"domain": site}))] if site else []
    forms = _name_forms(cleaned)[:_FANTASTIC_MAX_NAMES]
    # GROUPE-FRANCE (16/10) — puis les entités du groupe au SIREN connu (les mêmes que TheirStack).
    for name in dict.fromkeys([*forms, *group.siren_names[:_THEIRSTACK_MAX_NAMES]]):
        queries.append(
            ("active-jb", _FANTASTIC_JB_URL, _fantastic_params({"organization": name, "exclude_ats_duplicate": "true"}))
        )
    headers = {"Authorization": f"Bearer {key}"}
    hits: list[dict] = []
    for endpoint, url, params in queries:
        meta: dict = {}
        payload = await _request(
            "fantastic_jobs",
            cleaned,
            client,
            lambda http, url=url, params=params: http.get(url, params=params, headers=headers),
            lambda: throttle("fantastic_jobs"),
            headers_out=meta,
        )
        hits = [h for h in payload if isinstance(h, dict)] if isinstance(payload, list) else []
        if hits:
            billed = _header_count(meta.get("x-api-jobs-this-request"), default=len(hits))
            cost = billed * provider_pricing.unit_cost_per_result_usd("fantastic_jobs")
            run_metrics.record_cost(get_correlation_id(), "fantastic_jobs", cost)
            _log_paid_call("fantastic_jobs", endpoint, cost)
            break
        _log_paid_call("fantastic_jobs", endpoint, 0.0)
    _count_returned("fantastic_jobs", len(hits))
    rows: list[tuple[str | None, dict]] = []
    for hit in hits:
        employer = _clean(hit.get("organization"))
        locations = hit.get("locations_derived")
        offer = _offer(
            title=_clean(hit.get("title")) or "",
            city=_clean(locations[0]) if isinstance(locations, list) and locations else None,
            date=hit.get("date_posted"),
            contract=None,
            company=employer,
            url=_clean(hit.get("url")),
            source="fantastic_jobs",
        )
        # Le métier (``ai_taxonomies_a``) et le recruteur nommé voyagent avec l'offre : le tri
        # selon le secteur de l'ESN se fait à la LECTURE, pas à la collecte.
        categories = [c for c in hit.get("ai_taxonomies_a") or [] if _clean(c)] if isinstance(hit.get("ai_taxonomies_a"), list) else []
        if categories:
            offer["categories"] = categories
        manager = _clean(hit.get("ai_hiring_manager_name"))
        if manager:
            offer["recruiters"] = [{"fullName": manager}]
        rows.append((employer, offer))
    return _keep_recent_attributed(rows, group, limit=_PAID_PAGE_SIZE)


def _header_count(raw: object, *, default: int) -> int:
    """Un compteur d'en-tête HTTP (entier ≥ 0), sinon ``default`` — jamais une valeur devinée."""
    try:
        value = int(str(raw).strip())
    except (TypeError, ValueError):
        return default
    return value if value >= 0 else default


# ── Rassemblement + dédoublonnage ───────────────────────────────────────────


def _offer_key(offer: dict) -> str:
    """Une même offre reprise par deux agrégateurs n'a pas la même URL : on la
    reconnaît à son intitulé et sa ville (normalisés)."""
    return f"{_fold(offer.get('title'))}|{_fold(offer.get('city') or offer.get('location'))}"


def drop_known_offers(offers: list[dict], known: list[dict]) -> list[dict]:
    """Retire de ``offers`` celles que les sources existantes ont déjà (même
    intitulé + même ville, ou même URL) — une offre ne compte jamais deux fois."""
    known_keys = {_offer_key(o) for o in known if isinstance(o, dict)}
    known_urls = {str(o.get("url") or "").strip().lower() for o in known if isinstance(o, dict)} - {""}
    out: list[dict] = []
    for offer in offers:
        url = str(offer.get("url") or "").strip().lower()
        if _offer_key(offer) in known_keys or (url and url in known_urls):
            continue
        out.append(offer)
    return out


def graft_recruiters(direct: list[dict], aggregator: list[dict]) -> list[dict]:
    """SIG-B (B2-RESTES, 12/10) — `drop_known_offers` retire la copie d'agrégateur d'une offre qu'une source
    directe a déjà ; si cette copie NOMMAIT son équipe de recrutement, elle la perdait. Les recruteurs
    voyagent sur l'offre directe gardée (même URL, ou même intitulé + ville) ; sa preuve reste son URL.
    Une offre qui nomme déjà son équipe la garde ; rien ne correspond → rien d'ajouté. L'entrée n'est
    jamais modifiée, et sans copie à recruteurs la MÊME liste est rendue."""
    carriers = [o for o in aggregator if isinstance(o, dict) and o.get("recruiters")]
    if not carriers:
        return direct
    by_key = {_offer_key(o): o["recruiters"] for o in carriers}
    by_url = {u: o["recruiters"] for o in carriers if (u := str(o.get("url") or "").strip().lower())}
    out: list[dict] = []
    for offer in direct:
        team = None
        if isinstance(offer, dict) and not offer.get("recruiters"):
            team = by_key.get(_offer_key(offer)) or by_url.get(str(offer.get("url") or "").strip().lower())
        out.append({**offer, "recruiters": team} if team else offer)
    return out


async def _adzuna_for_analysis(via: Callable[..., Awaitable[list[dict]]], fetch: Callable[[], Awaitable[list[dict]]]) -> list[dict]:
    """DISCOVER-OFFRES (15/10, C) — l'analyse va jusqu'à la LIMITE du jour d'Adzuna ; au-delà elle se
    passe de la source sans erreur et SANS rien ranger au cache (un quota n'est pas « rien trouvé »)."""
    has_keys = os.environ.get("ADZUNA_APP_ID", "").strip() and os.environ.get("ADZUNA_APP_KEY", "").strip()
    if has_keys and not await adzuna_budget.analysis_allowed():
        logger.info("Adzuna — analyse sans la source : limite du jour atteinte")
        return []
    return await via("adzuna", fetch)


_SOURCE_KEYS: dict[str, tuple[str, ...]] = {
    "adzuna": ("ADZUNA_APP_ID", "ADZUNA_APP_KEY"),
    "jooble": ("JOOBLE_API_KEY",),
    "fantastic": ("FANTASTIC_JOBS_API_KEY",),
    "mantiks": ("MANTIKS_API_KEY",),
    "theirstack": ("THEIRSTACK_API_KEY",),
}


def _source_configured(source: str) -> bool:
    return all(os.environ.get(env, "").strip() for env in _SOURCE_KEYS[source])


async def it_job_signals_aggregators(
    company: str,
    *,
    keep_title: Callable[[str], bool] | None = None,
    scope: EmployerScope | None = None,
    domain: str | None = None,
    employer_facts: dict | None = None,
    share: Callable[[str, Callable[[], Awaitable[list[dict]]]], Awaitable[list[dict]]] | None = None,
    client: httpx.AsyncClient | None = None,
    explicit_request: bool = False,
    terms: Sequence[str] = (),
    cascade_out: dict | None = None,
    trade_terms: Sequence[str] = (),
) -> list[dict]:
    """Les offres de ``company`` chez les agrégateurs, dédoublonnées entre eux, filtrées par ``keep_title`` (le tri
    métier du VENDEUR, fourni par le routeur — même règle que France Travail). ``[]`` sans aucune clé.

    DECATHLON 11/10 — ``scope`` porte ce qu'on sait du GROUPE (SIREN d'ancrage, entités lues au registre) et
    ``domain`` le site du compte : toutes les entités du groupe sont rattachées, jamais un homonyme.

    CACHE-SOURCES (15/10) — plus aucun filtre métier n'est poussé chez le fournisseur : il rend les offres RÉCENTES
    de l'entreprise (gardées 30 j, clé = entreprise), et ``keep_title`` les trie ICI, à la lecture.
    ``employer_facts`` reçoit la pile et l'effectif lus dans les offres TheirStack gardées (A4).

    #4045 — ``share(source, fetch)`` : le cache d'offres PARTAGÉ par SIREN. Chaque fournisseur passe par lui
    (lecture avant tout appel payé, écriture après) ; sans lui, appel direct. Sur un cache servi, ``employer_facts``
    n'est pas rempli : pas de réponse, pas de lecture.

    CASCADE-PLANCHER-5 (25/10) — le palier 0 est Adzuna, Jooble et Fantastic.jobs ; sous ``OFFERS_FLOOR`` offres DU
    MÉTIER (le seuil d'avant comptait le RENDU, avant tri : 12 rendues et 1 du métier n'ouvraient rien), la cascade
    parcourt ``TIER_ORDER`` — sources payantes (Mantiks, TheirStack), termes voisins de ``terms``, fenêtre de temps,
    filiales — et s'arrête au plancher, sauf ``explicit_request`` (une demande précise de l'analyse) : tous les
    paliers, dans la borne de ``CASCADE_PAID_CALLS_MAX`` appels payés. Le tri métier n'est jamais relâché.
    ``cascade_out`` reçoit ce que la cascade a fait (``CascadeResult.public()`` + le palier 0).

    DECATHLON 30/10 — ``trade_terms`` : les métiers du vendeur (``placed_role_terms``). Le plancher ne compte que
    les offres qui les recoupent, et le palier « termes » cherche l'employeur AVEC chacun. Vide : chemin d'avant."""
    from app.services.domain_job_filters import offer_matches_trade, trade_offer_count  # import tardif : pas de cycle

    group = _scope((company or "").strip(), scope)
    keep = keep_title or (lambda _title: True)
    budget = offers_cascade.PaidBudget()
    trade = tuple(t for t in trade_terms if t)
    counts = (lambda offer: offer_matches_trade(offer, trade)) if trade else None

    async def _via(source: str, fetch: Callable[[], Awaitable[list[dict]]]) -> list[dict]:
        return await share(source, fetch) if share is not None else await fetch()

    async def _query(source: str, fetch: Callable[[], Awaitable[list[dict]]], *, paid: bool, force: bool = False) -> list[dict]:
        """Interroge UNE source configurée. Sans clé : ni appel ni compteur (seul le cache partagé est relu)."""
        if not _source_configured(source):
            return await share(source, fetch) if share is not None else []
        invoked = False

        async def _counted() -> list[dict]:
            nonlocal invoked
            invoked = True
            if paid and not budget.take(force=force):
                raise offers_cascade.PaidCapReached
            return await fetch()

        try:
            rows = await (_adzuna_for_analysis(_via, _counted) if source == "adzuna" else _via(source, _counted))
        except offers_cascade.PaidCapReached:
            return []
        if paid and not invoked:
            budget.cached()
        return rows

    # Palier 0 : les trois sources interrogées ensemble. Fantastic.jobs est payante : comptée, jamais refusée
    # (la cascade ne retire rien à ce que l'analyse faisait déjà).
    budget.begin("base")
    adzuna, jooble, fantastic = await asyncio.gather(
        _query("adzuna", lambda: adzuna_jobs(company, scope=group, client=client), paid=False),
        _query("jooble", lambda: jooble_jobs(company, scope=group, client=client), paid=False),
        _query(
            "fantastic",
            lambda: fantastic_jobs(company, scope=group, domain=domain, client=client),
            paid=True,
            force=True,
        ),
        return_exceptions=True,
    )

    def _lists(*results: object) -> list[dict]:
        return [o for r in results if isinstance(r, list) for o in r if isinstance(o, dict)]

    def _log(source: str, rows: list[dict], kept: int) -> None:
        # #4182 — de quoi diagnostiquer « rien dans l'onglet » : rendues / gardées après tri métier, par source.
        if rows:
            run_metrics.record_results(get_correlation_id(), str(rows[0].get("source") or "job_aggregators"), kept=kept)
        logger.info("jobs_source_kept source=%s returned=%d kept=%d", source, len(rows), kept)

    base = {"adzuna": _lists(adzuna), "jooble": _lists(jooble), "fantastic_jobs": _lists(fantastic)}
    probe: list[dict] = []
    for source, rows in base.items():
        _log(source, rows, offers_cascade._merge(probe, rows, keep) if rows else 0)

    async def _sources(tier_budget: offers_cascade.PaidBudget) -> list[dict]:
        """Palier 1 — les sources payantes qui ont une clé, l'une après l'autre : la suivante ne part que si la
        précédente n'a pas suffi, sauf demande explicite. Jamais d'achat « au cas où »."""
        steps = (
            ("mantiks", lambda: mantiks_jobs(company, scope=group, domain=domain, client=client)),
            (
                "theirstack",
                lambda: theirstack_jobs(company, scope=group, domain=domain, facts=employer_facts, client=client),
            ),
        )
        got: list[dict] = []
        for source, fetch in steps:
            have = [*probe]
            offers_cascade._merge(have, got, keep)
            have_trade = trade_offer_count(have, trade)
            if have_trade >= offers_cascade.OFFERS_FLOOR and not explicit_request:
                if _source_configured(source):
                    run_metrics.record_skip(
                        get_correlation_id(), source, f"{have_trade} offres du métier (plancher {offers_cascade.OFFERS_FLOOR})"
                    )
                continue
            try:
                rows = await _query(source, fetch, paid=True)
            except Exception as exc:  # noqa: BLE001 — une source d'appoint ne casse jamais la recherche
                logger.warning("%s failed for %r: %s", source, company, exc)
                continue
            _log(source, rows, offers_cascade._merge([*have], rows, keep))
            got += rows
        return got

    from app.services import offers_cascade_tiers as tiers  # import tardif : le module des paliers importe celui-ci

    fetchers: dict[str, offers_cascade.TierFetcher] = {"sources": _sources}
    for name, build in (
        ("terms", lambda: tiers.terms_tier(company, group, terms, trade_terms=trade, client=client)),
        ("window", lambda: tiers.window_tier(company, group, domain)),
        ("group", lambda: tiers.group_tier(company, group)),
    ):
        fetcher = build()
        if fetcher is not None:
            fetchers[name] = fetcher
    result = await offers_cascade.run_cascade(
        [o for rows in base.values() for o in rows],
        fetchers,
        keep=keep,
        explicit_request=explicit_request,
        budget=budget,
        counts=counts,
    )
    if cascade_out is not None:
        cascade_out.update(result.public())
        cascade_out["base"] = budget.stats["base"].public()
    # #4044 — une offre de STAGE n'est jamais un signal (décision Louis 12/10).
    return drop_internship_postings(result.offers, title_keys=("title",), contract_keys=("contractType",))

__all__ = [
    "ACCOUNT_OFFER_SEARCH_MAX",
    "ENOUGH_OFFERS_FOR_NO_PURCHASE",
    "account_offer_search",
    "adzuna_jobs",
    "adzuna_skill_offers",
    "fantastic_skill_offers",
    "mantiks_skill_offers",
    "paid_skill_source_configured",
    "theirstack_skill_offers",
    "drop_known_offers",
    "fantastic_jobs",
    "it_job_signals_aggregators",
    "jooble_jobs",
    "mantiks_jobs",
    "merge_published_technologies",
    "published_headcount_label",
    "theirstack_jobs",
]
