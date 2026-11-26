"""#4430 (Louis 21/10/2026) — offres FRAÎCHES pour les comptes que proposent Laura et Découvrir.

Retour client du 21/10 : Laura et Découvrir ne lisaient les sources d'offres payées qu'en CACHE
(``public_facts.CACHE_ONLY_JOB_SOURCES``) — un cache vieux de plusieurs semaines, ou vide.

⚠️ RENVERSEMENT PARTIEL, assumé et daté du 21/10 (``c125_offres_fraiches_laura_decouvrir``) de
« Découvrir sans appel payant » (PR #4230) et de « Mantiks jamais dans Découvrir » (14/10) :

- les ``FRESH_JOBS_MAX_PER_ANSWER`` PREMIERS comptes d'une réponse dont le cache COMMUN d'offres a
  plus de ``FRESH_JOBS_STALE_AFTER_S`` sont recollectés (même cascade que la fiche : Fantastic →
  Mantiks → TheirStack, arrêtée dès qu'il y a assez d'offres) ;
- au plus ``FRESH_JOBS_MAX_PER_SPACE_DAY`` comptes payés par espace et par jour (jour de Paris) ;
- au-delà : cache seul, et la réponse dit la DATE des offres (``FreshPlan.as_of``) ;
- le cache reste COMMUN (30 j, clé = entreprise seule, décision du 15/10) : l'espace n'entre que dans
  la clé du COMPTEUR du jour, sous empreinte, jamais dans celle d'un fait ;
- sans espace connu (appel interne, ancienne API) : rien n'est payé ;
- la veille quotidienne reste en cache seul (VC.1, 18/10) : elle ne passe pas par ici.

Journal : ``jobs_fresh cache=hit|paid`` — jamais le nom d'un fournisseur.
"""

from __future__ import annotations

import asyncio
import hashlib
import logging
import re
import unicodedata
from collections.abc import Mapping, Sequence
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from zoneinfo import ZoneInfo

from app.services import free_text_facts, provider_cache, source_cache
from app.services.public_facts import company_fact_key, jobs_fact_variant, shared_jobs

logger = logging.getLogger(__name__)

_DAY = 24 * 3600
#: Un cache commun d'offres plus vieux que ça est recollecté pour un compte proposé (Louis 21/10).
FRESH_JOBS_STALE_AFTER_S = 7 * _DAY
#: Comptes payés au plus par réponse de Laura ou par recherche Découvrir (Louis 21/10).
FRESH_JOBS_MAX_PER_ANSWER = 10
#: Comptes payés au plus par espace et par jour de Paris (Louis 21/10).
FRESH_JOBS_MAX_PER_SPACE_DAY = 60

#: Les sources PAYÉES du cache commun (fait brut, une variante) et le semis des analyses.
_PAID_SOURCES: tuple[str, ...] = ("fantastic", "mantiks", "theirstack")
_DATED_SOURCES: tuple[str, ...] = (*_PAID_SOURCES, "merged")
#: Les caches INTERNES des connecteurs payés (30 j, clé entreprise) : contournés pendant la collecte.
_PAID_NAMESPACES: tuple[str, ...] = ("jobs:fantastic_jobs", "jobs:theirstack", "jobs:mantiks")
#: « Cherché frais ce jour-là » — même quand rien n'est rendu (un vide ne s'écrit pas au cache des faits).
_CHECKED_NAMESPACE = "jobs_fresh:checked"
_PARIS = ZoneInfo("Europe/Paris")

_local_counts: dict[str, int] = {}


@dataclass
class FreshPlan:
    """Ce que la réponse paie (``to_collect``, dans l'ordre des cartes) et la date des offres de
    chaque compte lu en cache seul (``as_of``, AAAA-MM-JJ). ``capped`` : un plafond a mordu."""

    to_collect: list[str] = field(default_factory=list)
    as_of: dict[str, str] = field(default_factory=dict)
    capped: bool = False


def _parse(value: object) -> datetime | None:
    try:
        moment = datetime.fromisoformat(str(value or ""))
    except ValueError:
        return None
    return moment if moment.tzinfo else moment.replace(tzinfo=UTC)


async def collected_at(siren: str) -> datetime | None:
    """La collecte payée la PLUS RÉCENTE rangée au cache commun pour ce SIREN, ou ``None``."""
    company = company_fact_key(siren=siren)
    if not company:
        return None
    dates: list[datetime] = []
    for source in _DATED_SOURCES:
        hit = await provider_cache.peek_json("facts:jobs", f"{company}|{jobs_fact_variant(source, None, False)}")
        if isinstance(hit, Mapping) and (moment := _parse(hit.get("collectedAt"))):
            dates.append(moment)
    checked = await provider_cache.peek_json(_CHECKED_NAMESPACE, company)
    if isinstance(checked, Mapping) and (moment := _parse(checked.get("at"))):
        dates.append(moment)
    return max(dates) if dates else None


async def mark_collected(siren: str) -> None:
    """Date la collecte fraîche de ce SIREN (clé = entreprise seule), qu'elle ait rendu ou non."""
    company = company_fact_key(siren=siren)
    if company:
        await provider_cache.set_json(
            _CHECKED_NAMESPACE, company, {"at": datetime.now(UTC).isoformat()}, provider_cache.TTL_JOBS
        )


def _day_key(space_key: str, counter: str = "jobs_fresh") -> str:
    digest = hashlib.sha256(space_key.encode()).hexdigest()[:16]
    return f"{counter}:space:{digest}:{datetime.now(UTC).astimezone(_PARIS).date().isoformat()}"


async def _space_used(key: str) -> int:
    redis = await provider_cache._redis()
    if redis is not None:
        try:
            raw = await redis.get(key)
            return int(raw) if raw is not None else 0
        except Exception as exc:  # noqa: BLE001 — le compteur est au mieux
            logger.debug("fresh_jobs: lecture Redis impossible (%s) — compteur local", exc)
    return _local_counts.get(key, 0)


async def _space_take(key: str) -> None:
    redis = await provider_cache._redis()
    if redis is not None:
        try:
            await redis.incr(key)
            await redis.expire(key, 2 * _DAY)
            return
        except Exception as exc:  # noqa: BLE001
            logger.debug("fresh_jobs: écriture Redis impossible (%s) — compteur local", exc)
    _local_counts[key] = _local_counts.get(key, 0) + 1


async def take_space_day(counter: str, space_key: str, cap: int) -> bool:
    """#4421.10 — le MÊME compteur espace × jour de Paris (empreinte de l'espace, Redis sinon local), pour une
    autre dépense que les offres (``counter`` la nomme) : ``True`` et compté si le plafond le permet."""
    key = _day_key(space_key, counter)
    if await _space_used(key) >= cap:
        return False
    await _space_take(key)
    return True


async def plan_fresh_collection(candidates: Sequence[Mapping[str, object]], *, space_key: str | None) -> FreshPlan:
    """Décide, carte par carte et dans l'ordre de la réponse, qui est recollecté frais.

    Les ``FRESH_JOBS_MAX_PER_ANSWER`` premières cartes PÉRIMÉES paient. Une carte au cache commun de
    moins de 7 jours ne paie rien (``cache=hit``) ; une carte périmée paie tant que les
    deux plafonds (réponse, espace × jour) le permettent — chaque achat décidé est compté ICI,
    avant l'appel, pour qu'une réponse parallèle ne passe jamais au-dessus du plafond du jour."""
    plan = FreshPlan()
    now = datetime.now(UTC)
    day_key = _day_key(space_key) if space_key else None
    for candidate in candidates:
        siren = str(candidate.get("siren") or "").strip()
        if not siren:
            continue
        moment = await collected_at(siren)
        if moment is not None and now - moment < timedelta(seconds=FRESH_JOBS_STALE_AFTER_S):
            plan.as_of[siren] = moment.date().isoformat()
            logger.info("jobs_fresh cache=hit")
            continue
        answer_full = len(plan.to_collect) >= FRESH_JOBS_MAX_PER_ANSWER
        if day_key is None or answer_full or await _space_used(day_key) >= FRESH_JOBS_MAX_PER_SPACE_DAY:
            plan.capped = plan.capped or day_key is not None
            if moment is not None:
                plan.as_of[siren] = moment.date().isoformat()
            reason = "no_space" if day_key is None else "answer_ceiling" if answer_full else "space_ceiling"
            logger.info("jobs_fresh cache=hit reason=%s", reason)
            continue
        await _space_take(day_key)
        plan.to_collect.append(siren)
    return plan


async def collect_fresh_jobs(name: str, siren: str, *, pack: str | None, all_roles: bool) -> list[dict]:
    """La cascade payée de la fiche, pour UN compte décidé par :func:`plan_fresh_collection`.

    Les sources payées repartent au réseau (leur cache interne et leur entrée commune ne sont pas
    relus) et leur réponse est rangée au cache COMMUN (30 j, clé = entreprise seule) ; les sources
    gratuites gardent leur lecture ordinaire. Rend les offres collectées (non triées au métier)."""
    from app.services.data_sources.job_aggregators import it_job_signals_aggregators

    company = company_fact_key(siren=siren)

    async def _share(source: str, fetch):  # noqa: ANN001, ANN202 — signature du connecteur
        if source not in _PAID_SOURCES:
            return await shared_jobs(source, company, fetch, pack=pack, all_roles=all_roles, read="full")

        async def _fetch_attached() -> list[dict]:
            # #4437 — le texte libre LU (intitulés) est rattaché AVANT d'être rangé : il voyage avec le fait.
            rows = await fetch()
            return await free_text_facts.attach_offer_titles(rows) if isinstance(rows, list) and rows else rows

        return await shared_jobs(source, company, _fetch_attached, pack=pack, all_roles=all_roles, read="none")

    with source_cache.fresh_paid_reads(_PAID_NAMESPACES):
        rows = await it_job_signals_aggregators(name, share=_share)
    await mark_collected(siren)
    logger.info("jobs_fresh cache=paid offers=%d", len(rows))
    return rows


def _fold(value: object) -> str:
    text = unicodedata.normalize("NFD", str(value or ""))
    text = "".join(ch for ch in text if unicodedata.category(ch) != "Mn").lower()
    return " " + " ".join(re.findall(r"[a-z0-9+#.]+", text)) + " "


def cites_skill(title: object, skills: Sequence[str]) -> str | None:
    """La compétence (telle que tapée) que l'intitulé LU cite en mot entier, ou ``None``.
    Jamais une proximité : « JavaScript » ne cite pas « Java »."""
    folded = _fold(title)
    for skill in skills:
        term = _fold(skill).strip()
        if term and f" {term} " in folded:
            return skill
    return None


async def fill_skill_accounts(
    skills: Sequence[str],
    companies: Sequence[Mapping[str, object]],
    *,
    space_key: str | None,
    pack: str | None,
    all_roles: bool,
    wait_s: float,
) -> tuple[list[dict], dict[str, int]]:
    """#4430 — une recherche par COMPÉTENCE qui rend moins que demandé se REMPLIT : les comptes de la
    zone (tirage registre, dans son ordre) passent par le MÊME plan d'offres fraîches (7 j, plafonds) ;
    un compte n'est gardé que si une offre RÉELLEMENT lue (fraîche, ou du cache commun) cite la
    compétence dans son intitulé — jamais un compte sans preuve. Les collectes qui dépassent
    ``wait_s`` finissent en arrière-plan et rangent au cache commun (la recherche suivante les lit).

    Rend les comptes au format de ``find_skill_accounts`` (``skillEvidence``, ``skillFreshFill``) et
    ``{"examined", "found"}`` — ce que la réponse dit de son remplissage."""
    from app.services.discover_skill_offers import _evidence, offer_trade_text

    if not space_key or not skills:
        return [], {}
    rows = [c for c in companies if str(c.get("siren") or "").strip()]
    plan = await plan_fresh_collection(rows, space_key=space_key)
    by_siren = {str(c["siren"]): c for c in rows}
    tasks = {
        siren: asyncio.ensure_future(
            collect_fresh_jobs(str(by_siren[siren].get("name") or ""), siren, pack=pack, all_roles=all_roles)
        )
        for siren in plan.to_collect
    }
    for task in tasks.values():
        task.add_done_callback(lambda t: t.cancelled() or t.exception())  # jamais « exception non lue »
    if tasks:
        await asyncio.wait(tasks.values(), timeout=max(wait_s, 0.0))
    found: list[dict] = []
    examined = 0
    for siren, row in by_siren.items():
        task = tasks.get(siren)
        if task is not None and not task.done():
            continue  # pas encore lu : rien n'est affirmé (ni trouvé, ni absent)
        if task is not None:
            offers = task.result() if task.exception() is None else []
        elif siren in plan.as_of:
            offers = await _cached_offers(siren)
        else:
            continue
        examined += 1
        cited = []
        for offer in offers:
            # #4469 — le MÉTIER de l'offre (intitulé + description), lieu et employeur retirés : « Agent de
            # sécurité Saint-Cloud » ou un employeur « LEKLA SAINT-CLOUD » ne citent pas « cloud ».
            skill = cites_skill(offer_trade_text({**offer, "employer": row.get("name")}), skills)
            if skill and offer.get("date"):
                cited.append({**offer, "skill": skill})
        if cited:
            found.append({**row, "skillEvidence": _evidence(cited), "skillFreshFill": True})
    return found, {"examined": examined, "found": len(found)}


async def _cached_offers(siren: str) -> list[dict]:
    company = company_fact_key(siren=siren)
    offers: list[dict] = []
    for source in _DATED_SOURCES:
        hit = await provider_cache.peek_json("facts:jobs", f"{company}|{jobs_fact_variant(source, None, False)}")
        if isinstance(hit, Mapping) and isinstance(hit.get("rows"), list):
            offers.extend(r for r in hit["rows"] if isinstance(r, dict))
    return offers
