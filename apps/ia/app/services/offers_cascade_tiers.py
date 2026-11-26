"""CASCADE-PLANCHER-5 — les fetchers des paliers « termes », « fenêtre » et « groupe » d'un compte.

Le moteur (``offers_cascade``) ne sait rien des fournisseurs : il parcourt les paliers et filtre. Ici, ce que
chaque palier ÉLARGIT — et rien d'autre :

    terms  → les formes voisines de la compétence demandée (référentiel #4434), jamais un voisin deviné
    window → les sources payées regardent plus loin dans le temps (jusqu'à la borne d'âge existante)
    group  → les filiales dont le registre donne le SIREN, par les sources gratuites

Le cache 30 j est lu AVANT tout appel payé ; un appel payé passe par ``PaidBudget.take()``. Aucun tri métier ici :
il vit dans le moteur, appliqué à chaque offre de chaque palier. Sans clé, une source n'est ni appelée ni comptée.
"""

from __future__ import annotations

import logging
import os
from collections.abc import Awaitable, Callable, Mapping, Sequence

import httpx

from app.services import adzuna_budget, offers_cascade, provider_cache
from app.services.data_sources import job_aggregators as agg
from app.services.data_sources.employer_match import EmployerScope

logger = logging.getLogger(__name__)

#: Formes voisines tentées par compétence demandée, et compétences demandées par compte.
CASCADE_TERM_FORMS_MAX = 3
CASCADE_TERMS_MAX = 2
#: DECATHLON 30/10 — métiers du vendeur cherchés avec l'employeur (Adzuna, sans crédit, dans le quota du jour).
CASCADE_TRADE_TERMS_MAX = 3
#: Filiales (SIREN connu) interrogées par le palier « groupe ».
CASCADE_GROUP_NAMES_MAX = 3
_WINDOW_NAMESPACE = "cascade:window"
_GROUP_NAMESPACE = "cascade:group"
_TRADE_NAMESPACE = "cascade:trade"
_TERMS_NAMESPACE = "discover:skill_paid"  # le même cache que Découvrir : une compétence n'est payée qu'une fois


def neighbour_forms(term: str) -> list[str]:
    """Les écritures DÉCLARÉES au référentiel pour la compétence de ``term`` (« Vue.js » → vuejs, vue 3, vue3), sauf
    celle déjà tapée et les mots courants du français (« vue »). Aucun voisin deviné : pas dans le référentiel ⇒ []."""
    from app.services.criteria_referential import canonical_skill, normalise_skill_text, referential
    from app.services.discover_skill_offers import _COMMON_WORD_ALIASES

    canonical = canonical_skill(term)
    if not canonical:
        return []
    entry = (referential().get("skills") or {}).get(canonical) or {}
    common = {normalise_skill_text(a) for a in _COMMON_WORD_ALIASES.get(canonical.lower(), ())}
    typed = normalise_skill_text(term)
    out: dict[str, str] = {}
    for form in [canonical, *(entry.get("aliases") or [])]:
        key = normalise_skill_text(form)
        if key and key != typed and key not in common and key not in out:
            out[key] = str(form)
    return list(out.values())[:CASCADE_TERM_FORMS_MAX]


def _raw(fn: Callable) -> Callable:
    """La fonction SANS son cache « entreprise seule » : les paliers rangent sous leur propre clé (30 j), la
    réponse déjà gardée sous la clé entreprise ne répondrait pas à la question élargie."""
    return getattr(fn, "__wrapped__", fn)


def _paid_fetchers() -> dict[str, Callable[[str], Awaitable[list[dict] | None]]]:
    return {
        "theirstack": agg.theirstack_skill_offers,
        "mantiks": agg.mantiks_skill_offers,
        "fantastic_jobs": agg.fantastic_skill_offers,
    }


async def _cached_or_paid(
    namespace: str, key: str, budget: offers_cascade.PaidBudget, fetch: Callable[[], Awaitable[list[dict] | None]]
) -> list[dict]:
    """Cache 30 j d'abord (aucun crédit), puis UN appel payé réservé au plafond. ``None`` = la source n'a pas répondu :
    jamais rangé, jamais « aucune offre »."""
    hit = await provider_cache.get_json(namespace, key)
    if isinstance(hit, Mapping) and isinstance(hit.get("offers"), list):
        budget.cached()
        return [o for o in hit["offers"] if isinstance(o, dict)]
    if not budget.take():
        return []
    rows = await fetch()
    if rows is None:
        raise RuntimeError("pas de réponse")
    await provider_cache.set_json(
        namespace, key, {"offers": rows}, provider_cache.TTL_JOBS if rows else provider_cache.TTL_EMPTY_JOBS
    )
    return rows


def terms_tier(
    company: str,
    scope: EmployerScope,
    terms: Sequence[str],
    *,
    trade_terms: Sequence[str] = (),
    client: httpx.AsyncClient | None = None,
) -> offers_cascade.TierFetcher | None:
    """Palier « termes » : les formes voisines de chaque compétence demandée, tous employeurs, rattachées au GROUPE.
    ``None`` sans compétence nommée (rien à élargir) ou sans forme déclarée.

    DECATHLON 30/10 — puis l'employeur cherché AVEC chaque métier du vendeur (``trade_terms``, « DECATHLON data ») :
    Adzuna, sans crédit, dans le quota du jour, gardé 30 j sous sa propre clé."""
    from app.services.discover_skill_offers import HARVEST_KEY_VERSION, _fold

    forms = [f for t in list(terms)[:CASCADE_TERMS_MAX] for f in neighbour_forms(t)]
    trade = list(dict.fromkeys(t for t in trade_terms if t))[:CASCADE_TRADE_TERMS_MAX]
    base_key = agg._cache_key(company, scope)
    if not forms and not (trade and base_key):
        return None

    async def fetch(budget: offers_cascade.PaidBudget) -> list[dict]:
        found: list[dict] = []
        for term in trade if base_key else ():
            key = f"{base_key}|{_fold(term)}"
            hit = await provider_cache.get_json(_TRADE_NAMESPACE, key)
            if isinstance(hit, Mapping) and isinstance(hit.get("offers"), list):
                found += [o for o in hit["offers"] if isinstance(o, dict)]
                continue
            if not agg.adzuna_configured() or not await adzuna_budget.analysis_allowed():
                continue
            rows = await agg.adzuna_employer_term_offers(company, term, scope=scope, client=client)
            await provider_cache.set_json(
                _TRADE_NAMESPACE, key, {"offers": rows}, provider_cache.TTL_JOBS if rows else provider_cache.TTL_EMPTY_JOBS
            )
            found += rows
        for form in forms:
            if agg.adzuna_configured() and await adzuna_budget.analysis_allowed():
                rows = await agg.adzuna_skill_offers(form, max_pages=1, max_age_days=agg._MAX_AGE_DAYS)
                found += [o for o in rows if scope.matches(o.get("company"))]
            for source, call in _paid_fetchers().items():
                if not agg.paid_skill_source_configured(source):
                    continue
                key = f"{HARVEST_KEY_VERSION}|{source}|{_fold(form)}"
                rows = await _cached_or_paid(_TERMS_NAMESPACE, key, budget, lambda call=call, form=form: call(form))
                found += [o for o in rows if scope.matches(o.get("company"))]
        return found

    return fetch


def window_tier(company: str, scope: EmployerScope, domain: str | None) -> offers_cascade.TierFetcher | None:
    """Palier « fenêtre » : Fantastic.jobs et TheirStack regardent jusqu'à ``CASCADE_WINDOW_DAYS`` jours en arrière.
    L'entité est relue sous une clé À PART (la réponse de 90 j gardée sous la clé entreprise ne répondrait pas)."""
    base_key = agg._cache_key(company, scope, domain)
    if not base_key:
        return None

    async def fetch(budget: offers_cascade.PaidBudget) -> list[dict]:
        found: list[dict] = []
        sources = {
            "fantastic": ("FANTASTIC_JOBS_API_KEY", _raw(agg.fantastic_jobs)),
            "theirstack": ("THEIRSTACK_API_KEY", _raw(agg._theirstack_search)),
        }
        for source, (env, call) in sources.items():
            if not os.environ.get(env, "").strip():
                continue

            async def _wide(call=call) -> list[dict]:
                with agg.wide_window():
                    got = await call(company, scope=scope, domain=domain)
                return [o for o in (got.get("offers") if isinstance(got, dict) else got) or [] if isinstance(o, dict)]

            found += await _cached_or_paid(_WINDOW_NAMESPACE, f"w1|{base_key}|{source}", budget, _wide)
        return found

    return fetch


def group_tier(company: str, scope: EmployerScope) -> offers_cascade.TierFetcher | None:
    """Palier « groupe » : les filiales dont le registre donne le SIREN, par les sources GRATUITES (Adzuna, Jooble).
    Aucun appel payé ; le cache 30 j se lit avant."""
    own = agg._fold(company)
    names = [n for n in scope.siren_names if agg._fold(n) and agg._fold(n) != own][:CASCADE_GROUP_NAMES_MAX]
    if not names:
        return None

    async def fetch(budget: offers_cascade.PaidBudget) -> list[dict]:
        found: list[dict] = []
        sources = {
            "adzuna": (agg.adzuna_configured, _raw(agg.adzuna_jobs)),
            "jooble": (lambda: bool(os.environ.get("JOOBLE_API_KEY", "").strip()), _raw(agg.jooble_jobs)),
        }
        for name in names:
            for source, (configured, call) in sources.items():
                if not configured():
                    continue
                key = f"g1|{agg._fold(name)}|{source}"
                hit = await provider_cache.get_json(_GROUP_NAMESPACE, key)
                if isinstance(hit, Mapping) and isinstance(hit.get("offers"), list):
                    budget.cached()
                    found += [o for o in hit["offers"] if isinstance(o, dict)]
                    continue
                if source == "adzuna" and not await adzuna_budget.analysis_allowed():
                    continue
                rows = await call(name, scope=scope)
                await provider_cache.set_json(
                    _GROUP_NAMESPACE,
                    key,
                    {"offers": rows},
                    provider_cache.TTL_JOBS if rows else provider_cache.TTL_EMPTY_JOBS,
                )
                found += rows
        return found

    return fetch
