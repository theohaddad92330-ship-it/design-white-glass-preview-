"""LAURA-OFFRES-4563 (Louis 25/10/2026) — l'outil de Laura qui rend des OFFRES : ``search_job_offers``.

« trouve moi des offres vue et java sur lille », sans consultant ni compte, rendait deux pages web : aucun outil de Laura
ne rendait d'offres (le seul chemin du moteur, ``find_skill_accounts``, rend des COMPTES et ne garde qu'une preuve par
compte). Cet outil AJOUTE le chemin manquant — le chemin talent (#4421) reste celui qui place un consultant.

Rien n'est redéfini ici (GA-26) :

* le moteur ``discover_skill_offers.harvest_skill_offers`` a les offres et applique le tri métier à CHAQUE offre ;
* ``offers_cascade.run_cascade`` tient le plancher de 5 offres DU MÉTIER, par paliers nommés (sources → termes voisins →
  fenêtre de temps → filiales) : le plancher se tient en CHERCHANT MIEUX, jamais en filtrant moins ;
* le cache 30 j vit dans les lectures du moteur (une compétence n'est payée qu'une fois) et le plafond d'appels payés
  est ``CASCADE_PAID_CALLS_MAX``, palier 0 compris.

Deux paliers sont sans objet ici et le disent : « sources » (la première lecture interroge déjà toutes les sources
branchées) et « filiales » (aucun compte visé). Aucun fournisseur ne sort jamais, un champ inconnu se NOMME (TJM,
statut, télétravail), jamais « 0 », et l'offre n'est pas jetée pour un champ manquant.
"""

from __future__ import annotations

import logging
import time
from collections.abc import Mapping, Sequence
from contextlib import nullcontext
from typing import Any

from app.services import discover_skill_offers as skill
from app.services import offers_cascade as oc
from app.services.data_sources import job_aggregators as agg
from app.models.reply_blocks import validate_reply_block
from app.services.offers_cascade_tiers import CASCADE_TERMS_MAX, neighbour_forms
from app.services.record_listing import remember_listing_card, remember_offers_outcome
from app.services.zone_palier import widen_zone_to_region

logger = logging.getLogger(__name__)

SEARCH_JOB_OFFERS_TOOL_NAME = "search_job_offers"

#: Le temps que prend toute la recherche, cascade comprise (le tour de Laura reste sous sa borne).
_SEARCH_BUDGET_S = 45.0
#: Offres rendues au plus (la borne se DIT : ``truncated``).
OFFERS_RETURNED_MAX = 30
#: Le tri métier du vendeur ne juge pas ici : c'est la COMPÉTENCE demandée qui trie (l'offre doit la citer), freelance
#: ou CDI. Même lecture que le chemin talent (``_talent_offer_profile``).
_PROFILE: dict[str, Any] = {"recruitsForClients": True}

_TIER_LABELS = {
    "sources": "sources branchées",
    "terms": "termes voisins",
    "window": "fenêtre de temps élargie",
    "group": "filiales",
}
#: Les paliers de ZONE (après la cascade d'offres) : Laura élargit la zone TOUTE SEULE, jamais « veux-tu élargir ? ».
_ZONE_DEPARTMENT = "department"
_ZONE_REGION = "region"
_STATUS_FIRST_READ = "lu dès le départ"
_STATUS_NOT_APPLICABLE = "sans objet"
_UNKNOWN = "non précisé"

SEARCH_JOB_OFFERS_TOOL: dict[str, Any] = {
    "name": SEARCH_JOB_OFFERS_TOOL_NAME,
    "description": (
        "Cherche des OFFRES d'emploi et de mission — intitulé, employeur, date, lieu, lien — pour une ou plusieurs "
        "compétences ou métiers sur un lieu : « trouve-moi des offres vue et java sur Lille », « quelles missions "
        "Python en Occitanie ? », « des offres SAP à Nantes ». À employer pour TOUTE demande d'offres, d'annonces ou "
        "de missions publiées du marché, avec ou sans consultant ni compte sélectionné : ne demande ni l'un ni "
        "l'autre. Ce n'est PAS la recherche de comptes (`find_accounts_for_talent` place un consultant) ni les "
        "missions de l'ERP interne (`search_missions`). `skills` = les compétences telles que la personne les nomme ; "
        "`city` ou `regions` / `departments` = le lieu (une ville tapée filtre sur la ville). Les offres rendues "
        "sont des OFFRES lues, pas des pages : la carte `file_export` (une ligne par offre : intitulé, employeur, "
        "date, lieu, lien) est posée par l'outil (`card`) — ne la recopie pas, ne la remplace pas par une phrase, ne "
        "dis JAMAIS que les offres sont « assez nombreuses » ou qu'il est inutile d'élargir : liste-les ou dis qu'il "
        "n'y en a aucune et où tu as cherché. `summary` dit le palier de "
        "recherche atteint et le nombre d'offres du métier : redis-le tel quel. Si la ville est mince, l'outil élargit LUI-MÊME "
        "au département puis à la région et le dit (`zoneTiers`) : les offres d'une autre ville portent `outsideCity`, "
        "dis-le ; ne demande JAMAIS « veux-tu élargir ? ». Sous le plancher de 5, dis "
        "franchement combien il y en a ; n'en ajoute JAMAIS une hors métier ni une trouvée ailleurs pour faire le "
        "compte. Ce qui n'est pas su (`unknown` : statut, TJM, télétravail) se NOMME « non précisé » — jamais 0, "
        "jamais deviné, et l'offre reste dans la liste. Ne nomme JAMAIS d'où viennent les offres. `web_search` n'est "
        "qu'un COMPLÉMENT, nommé comme tel, pour ce que cet outil ne couvre pas : jamais la seule source d'une "
        "réponse sur des offres. Une `error` se dit telle quelle, sans repli inventé."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "skills": {
                "type": "array",
                "items": {"type": "string"},
                "description": 'Les compétences ou métiers cherchés (ex. ["Vue.js", "Java"]).',
            },
            "city": {"type": "string", "description": "La ville (ex. « Lille »)."},
            "regions": {"type": "array", "items": {"type": "string"}, "description": "Régions (libellé ou code)."},
            "departments": {"type": "array", "items": {"type": "string"}, "description": "Départements (code ou nom)."},
        },
        "required": ["skills"],
    },
}


def _as_list(value: object) -> list[str]:
    if isinstance(value, str):
        return [part.strip() for part in value.replace(";", ",").split(",") if part.strip()]
    if isinstance(value, Sequence):
        return [str(item).strip() for item in value if str(item or "").strip()]
    return []


def _charge(budget: oc.PaidBudget, harvest: skill.SkillHarvest) -> None:
    """Reporte ce que la moisson a PAYÉ, servi par le cache et refusé (plafond) sur le compteur de la cascade."""
    if harvest.from_cache:
        # La moisson entière vient du cache : ses compteurs sont ceux du jour où elle a été payée, pas ceux d'aujourd'hui.
        budget.cached()
        return
    for stats in harvest.by_source.values():
        for _ in range(int(stats.get("paid") or 0)):
            budget.take(force=True)
        budget.cached(int(stats.get("cached") or 0))
        budget._tier().not_attempted += int(stats.get("notAttempted") or 0)


def _unknown_fields(offer: Mapping[str, Any]) -> list[str]:
    """Ce que la source ne dit pas — nommé, jamais inventé. Aucune source ne publie aujourd'hui le TJM ni le
    télétravail : ils sont donc nommés tant qu'une offre ne les porte pas."""
    missing = []
    if not offer.get("contract"):
        missing.append("statut")
    if offer.get("dailyRate") is None:
        missing.append("TJM")
    if offer.get("remote") is None:
        missing.append("télétravail")
    return missing


def _shape(offer: Mapping[str, Any], terms: Sequence[str], wanted_city: str = "") -> dict[str, Any]:
    """Une OFFRE telle que l'écran la montre : jamais la source, jamais le corps de l'annonce."""
    text = skill.offer_trade_text(dict(offer))
    shaped: dict[str, Any] = {
        "title": str(offer.get("title") or "").strip(),
        "employer": str(offer.get("employer") or offer.get("company") or "").strip(),
        "date": str(offer.get("date") or "")[:10],
        "city": str(offer.get("city") or offer.get("location") or "").strip(),
        "url": str(offer.get("url") or "").strip(),
        "contract": str(offer.get("contractType") or "").strip() or None,
        "dailyRate": offer.get("tjm") if offer.get("tjm") is not None else offer.get("dailyRate"),
        "remote": offer.get("remote"),
        "matchedSkills": [t for t in terms if skill._mentions(t, text)],
        # Une offre d'un palier de zone le DIT : elle n'est pas dans la ville demandée.
        "outsideCity": bool(wanted_city)
        and not skill.offer_in_city(offer.get("city") or offer.get("location"), wanted_city),
    }
    shaped["unknown"] = _unknown_fields(shaped)
    return shaped


def _reached_at(result: oc.CascadeResult) -> str | None:
    """Le palier où le plancher s'est tenu, relu des gains (le premier passage d'abord)."""
    running = len(result.offers) - sum(t.gained for t in result.tiers)
    if running >= result.floor:
        return "sources"
    for tier in result.tiers:
        running += tier.gained
        if running >= result.floor:
            return tier.name
    return None


def _public_tiers(result: oc.CascadeResult) -> list[dict[str, object]]:
    rows = []
    for tier in result.tiers:
        row = tier.public()
        if tier.status == oc.STATUS_UNAVAILABLE:
            row["status"] = _STATUS_FIRST_READ if tier.name == "sources" else _STATUS_NOT_APPLICABLE
        rows.append(row)
    return rows


def _zone_label(tier: str, city: str, region: str | None) -> str:
    if tier == _ZONE_DEPARTMENT:
        return f"département de {city}" if city else "autres villes de la zone"
    return f"région {region}" if region else "région"


def _summary(
    result: oc.CascadeResult,
    reached: str | None,
    outside_city: int,
    *,
    zone_tiers: Sequence[Mapping[str, Any]] = (),
    city: str = "",
    searched: Sequence[str] = (),
) -> str:
    found = len(result.offers)
    labels = {**_TIER_LABELS, **{str(t["tier"]): str(t["label"]) for t in zone_tiers}}
    around = f" autour de {city}" if city else ""
    if reached is not None:
        where = "dès la première lecture" if reached == "sources" else f"au palier « {labels[reached]} »"
        line = f"{found} offres du métier trouvées — le plancher de {result.floor} est atteint {where}."
        if any(t["tier"] == reached and t["gained"] for t in zone_tiers):
            line += f" J'ai élargi la zone{around} toute seule : les offres hors de la ville demandée sont marquées."
    else:
        walked = [_TIER_LABELS[t.name] for t in result.tiers if t.status in (oc.STATUS_TRIED, oc.STATUS_FAILED)]
        walked += [str(t["label"]) for t in zone_tiers if t["status"] in (oc.STATUS_TRIED, oc.STATUS_FAILED)]
        done = f" ({', '.join(walked)})" if walked else ""
        count = "Aucune offre du métier" if not found else f"{found} offre{'s' if found > 1 else ''} du métier"
        what = f" pour « {', '.join(searched)} »" if searched else ""
        line = (
            f"{count}{what} sur {result.floor} visées{around} : j'ai élargi la recherche palier par palier{done} et il n'y "
            "en a pas davantage. Je n'ai rien ajouté hors de ton métier pour faire le compte."
        )
        if result.reason == oc.REASON_CAPPED:
            line += " Le plafond d'appels payés a été atteint avant la fin des paliers."
    if outside_city:
        line += f" {outside_city} offre{'s' if outside_city > 1 else ''} hors de la ville demandée écartée{'s' if outside_city > 1 else ''}."
    return line


_LINK_MAX = 200
_OFFERS_COLUMNS = ["Intitulé", "Employeur", "Date", "Lieu", "Lien"]


def _offers_card(
    offers: Sequence[Mapping[str, Any]], terms: Sequence[str], city: str, summary: str
) -> dict[str, Any] | None:
    """#4563.1 — la carte `file_export` des offres LUES, posée par le code (le modèle ne la recopie plus : c'est
    lui qui, le 27/10, la remplaçait par une phrase). Une absence ne fait aucune ligne : zéro offre, zéro carte.
    Un champ inconnu reste vide (jamais « 0 »), un lien trop long pour une cellule n'est pas tronqué."""
    if not offers:
        return None
    rows = [
        {
            "cells": [
                str(o["title"])[:200],
                o["employer"] or None,
                o["date"] or None,
                (str(o["city"]) + (" (hors ville demandée)" if o["outsideCity"] else "")).strip() or None,
                o["url"] if o["url"] and len(o["url"]) <= _LINK_MAX else None,
            ]
        }
        for o in offers
    ]
    where = f" à {city}" if city else ""
    return validate_reply_block(
        {
            "type": "file_export",
            "title": f"Offres {', '.join(terms)}{where}"[:120],
            "filename": "offres.csv",
            "columns": _OFFERS_COLUMNS,
            "rows": rows,
            "note": summary[:300],
        }
    )


async def search_job_offers(
    skills: Sequence[str],
    *,
    city: str | None = None,
    regions: Sequence[str] = (),
    departments: Sequence[str] = (),
    budget_s: float = _SEARCH_BUDGET_S,
) -> dict[str, Any]:
    terms = skill.harvest_terms(skills)
    if not terms:
        return {"error": "Il me faut au moins une compétence ou un métier pour chercher des offres (ex. Vue.js, Java)."}
    deadline = time.monotonic() + budget_s
    zone = skill.zone_departments(regions, departments, city)
    wanted_city = (city or "").strip()
    paid = oc.PaidBudget()
    credits = [0]  # Louis 01/11/2026 — UN budget de crédits TheirStack pour toute la cascade, pas un par moisson
    outside_city = 0
    pool: list[dict] = []  # tout ce que la moisson a lu, ville ou non : le palier « département » le RELIT, sans appel

    def _city_filter(offers: Sequence[dict]) -> list[dict]:
        nonlocal outside_city
        if not wanted_city:
            return list(offers)
        kept = [o for o in offers if skill.offer_in_city(o.get("city"), wanted_city)]
        outside_city = max(outside_city, len(offers) - len(kept))
        return kept

    async def _read(
        read_terms: Sequence[str], *, age: int | None = None, where: Sequence[str] | None = None
    ) -> skill.SkillHarvest:
        left = max(0, paid.cap - paid.used)
        with skill.skill_scope(max_age_days=age, paid_cap=left, credits=credits), agg.wide_window(age) if age else nullcontext():
            harvest = await skill.harvest_skill_offers(
                list(read_terms), zone if where is None else where, _PROFILE, deadline=deadline
            )
        _charge(paid, harvest)
        pool.extend(harvest.offers)
        return harvest

    paid.begin("sources")
    try:
        first = await _read(terms)
    except Exception as exc:  # noqa: BLE001 — une panne se DIT, elle ne se déguise pas en « aucune offre »
        logger.warning("LAURA-OFFRES-4563 — lecture des offres impossible: %s", type(exc).__name__)
        return {"error": "La recherche d'offres n'a pas abouti : je ne peux pas dire qu'il n'y en a pas."}
    if first.failed and not first.offers and first.failed >= first.tried:
        return {"error": "Les sources d'offres n'ont pas répondu : je ne peux pas dire qu'il n'y en a pas."}

    async def _terms(_budget: oc.PaidBudget) -> list[dict]:
        forms = [f for t in terms[:CASCADE_TERMS_MAX] for f in neighbour_forms(t)]
        if not forms:
            return []
        return _city_filter((await _read(forms[: skill.HARVEST_MAX_TERMS])).offers)

    async def _window(_budget: oc.PaidBudget) -> list[dict]:
        return _city_filter((await _read(terms, age=agg.CASCADE_WINDOW_DAYS)).offers)

    def keep_title(title: str) -> bool:
        return bool(title.strip())

    base = _city_filter(first.offers)
    result = await oc.run_cascade(
        base,
        {"terms": _terms, "window": _window},
        keep=keep_title,
        budget=paid,
    )
    reached = _reached_at(result)
    zone_tiers: list[dict[str, Any]] = []
    if result.below_floor and wanted_city:
        # Laura AGIT : la ville est mince, elle relit ce qu'elle a déjà lu sur le département (aucun appel de plus).
        label = _zone_label(_ZONE_DEPARTMENT, wanted_city, None)
        gained = oc._merge(
            result.offers, [o for o in pool if not skill.offer_in_city(o.get("city"), wanted_city)], keep_title
        )
        zone_tiers.append({"tier": _ZONE_DEPARTMENT, "label": label, "status": oc.STATUS_TRIED, "gained": gained})
    if result.below_floor and zone:
        wide = widen_zone_to_region(zone)
        if wide is None:
            zone_tiers.append({"tier": _ZONE_REGION, "label": "région", "status": _STATUS_NOT_APPLICABLE, "gained": 0})
        else:
            region_name, region_zone = wide
            label = _zone_label(_ZONE_REGION, wanted_city, region_name)
            try:
                harvest = await _read(terms, where=region_zone)
                gained = oc._merge(result.offers, harvest.offers, keep_title)
                status = oc.STATUS_TRIED
            except Exception as exc:  # noqa: BLE001 — un palier tombé se DIT, il ne casse pas ce qui est déjà trouvé
                logger.warning("LAURA-OFFRES-4563 — palier région en échec: %s", type(exc).__name__)
                gained, status = 0, oc.STATUS_FAILED
            zone_tiers.append({"tier": _ZONE_REGION, "label": label, "status": status, "gained": gained})
    if zone_tiers:
        running = len(result.offers) - sum(int(t["gained"]) for t in zone_tiers)
        for tier in zone_tiers:
            running += int(tier["gained"])
            if running >= result.floor and reached is None:
                reached = str(tier["tier"])
        if not result.below_floor:
            result.reason = None
        outside_city = 0  # les offres des autres villes sont RENDUES, marquées : plus rien n'est « écarté »
    shaped = [_shape(o, terms, wanted_city) for o in result.offers]
    shaped.sort(key=lambda o: (not o["outsideCity"], len(o["matchedSkills"]), o["date"]), reverse=True)
    out = {
        "offers": shaped[:OFFERS_RETURNED_MAX],
        "truncated": len(shaped) > OFFERS_RETURNED_MAX,
        "summary": _summary(result, reached, outside_city, zone_tiers=zone_tiers, city=wanted_city, searched=terms),
        "cascade": {**result.public(), "tiers": _public_tiers(result), "zoneTiers": zone_tiers, "reachedAt": reached},
    }
    # #4563.1 — la demande d'offres rend les offres, jamais une justification
    remember_offers_outcome(len(out["offers"]), out["summary"])
    card = _offers_card(out["offers"], terms, wanted_city, out["summary"])
    if card:
        out["card"] = card
        remember_listing_card(card)
    logger.info(
        "LAURA-OFFRES-4563 trouvées=%d plancher=%d palier=%s payés=%d",
        len(shaped),
        result.floor,
        reached,
        result.paid_total,
    )
    return out


async def execute_search_job_offers(tool_input: Mapping[str, Any]) -> dict[str, Any]:
    return await search_job_offers(
        _as_list(tool_input.get("skills")),
        city=str(tool_input.get("city") or "").strip() or None,
        regions=_as_list(tool_input.get("regions")),
        departments=_as_list(tool_input.get("departments")),
    )


__all__ = [
    "OFFERS_RETURNED_MAX",
    "SEARCH_JOB_OFFERS_TOOL",
    "SEARCH_JOB_OFFERS_TOOL_NAME",
    "execute_search_job_offers",
    "search_job_offers",
]
