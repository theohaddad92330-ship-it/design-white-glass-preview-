#!/usr/bin/env python3
"""DISCOVER-OFFRES (15/10, D) — SEME le cache commun d'offres depuis les analyses DÉJÀ faites.

    cd apps/ia
    PYTHONPATH=. python3 scripts/seed_jobs_cache_from_analyses.py --dry-run   # compte, n'écrit rien
    PYTHONPATH=. python3 scripts/seed_jobs_cache_from_analyses.py             # sème pour de vrai

Doctrine « un correctif de collecte RATTRAPE l'existant » : les comptes analysés AVANT le cache commun ont
déjà payé leurs offres (``accounts.raw_analysis -> 'it_job_signals'``, fusionnées) ; sans ce semis, Découvrir
les rachèterait ou les ignorerait. Pour chaque compte dont ``signals_collected_at`` a moins de 30 jours :
les offres sont rangées PAR ENTREPRISE (SIREN du compte, sinon domaine du site) sous la variante ``merged``
que l'analyse et Découvrir RELISENT, dates ``collectedAt = signals_collected_at`` et expiration
``collectedAt + 30 j`` — jamais plus fraîches qu'elles ne le sont.

- À LANCER À LA MAIN, jamais au déploiement. IDEMPOTENT (une relance réécrit les mêmes entrées).
- AUCUN appel réseau vers un fournisseur : seule la base (lecture) et le cache (écriture) sont touchés.
- Les stages sont retirés ; rien de propre à un espace ne voyage (liste blanche de champs, garde
  ``public_facts`` sur les marqueurs d'espace) ; la clé respecte les regex VARIANT / company_key.
"""

from __future__ import annotations

import argparse
import asyncio
import sys
from collections.abc import AsyncIterator, Awaitable, Callable, Iterable, Mapping
from dataclasses import dataclass, field
from datetime import UTC, datetime, timedelta
from typing import Any

from app.services import provider_cache, public_facts
from app.services.internship_posting import drop_internship_postings

VARIANT = "merged"
FRESHNESS = timedelta(seconds=provider_cache.TTL_JOBS)  # 30 j : la fraîcheur du cache commun d'offres
_PAGE = 200
#: Les SEULS champs d'une offre qui voyagent : le contrat commun des offres (``job_aggregators._offer``).
_FIELDS = ("title", "location", "date", "contractType", "skills", "company", "city", "url", "source")


@dataclass
class Entry:
    company_key: str
    collected_at: datetime
    rows: list[dict] = field(default_factory=list)

    def ttl_s(self, now: datetime) -> int:
        return int((self.collected_at + FRESHNESS - now).total_seconds())


@dataclass
class Plan:
    accounts_seen: int = 0
    accounts_seeded: int = 0
    skipped_old: int = 0
    skipped_no_key: int = 0
    skipped_no_offer: int = 0
    entries: dict[str, Entry] = field(default_factory=dict)

    @property
    def offers(self) -> int:
        return sum(len(e.rows) for e in self.entries.values())


def _parse(value: object) -> datetime | None:
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        return None
    return parsed if parsed.tzinfo else parsed.replace(tzinfo=UTC)


def _offer(raw: Mapping[str, Any]) -> dict | None:
    """Une offre de ``raw_analysis`` (clés snake_case) au contrat commun ; sans titre : rien."""
    title = " ".join(str(raw.get("title") or "").split())
    if not title:
        return None
    contract = raw.get("contractType") if raw.get("contractType") is not None else raw.get("contract_type")
    offer = {k: raw.get(k) for k in _FIELDS}
    offer.update(title=title, contractType=contract, skills=raw.get("skills") if isinstance(raw.get("skills"), list) else [])
    return {k: v for k, v in offer.items() if v is not None or k in ("url", "contractType")}


def build_plan(accounts: Iterable[Mapping[str, Any]], now: datetime) -> Plan:
    plan = Plan()
    for account in accounts:
        plan.accounts_seen += 1
        collected = _parse(account.get("signals_collected_at"))
        if collected is None or now - collected >= FRESHNESS:
            plan.skipped_old += 1
            continue
        key = public_facts.company_fact_key(siren=account.get("siren"), domain=account.get("website"))
        if key is None:
            plan.skipped_no_key += 1
            continue
        raw_offers = account.get("it_job_signals")
        offers = [o for o in (_offer(r) for r in raw_offers if isinstance(r, Mapping)) if o] if isinstance(raw_offers, list) else []
        offers = drop_internship_postings(offers, title_keys=("title",), contract_keys=("contractType",))
        if not offers:
            plan.skipped_no_offer += 1
            continue
        entry = plan.entries.setdefault(key, Entry(company_key=key, collected_at=collected))
        if collected > entry.collected_at:
            entry.collected_at = collected
        seen = {(o.get("url") or f"{o['title']}|{o.get('city')}") for o in entry.rows}
        entry.rows.extend(o for o in offers if (o.get("url") or f"{o['title']}|{o.get('city')}") not in seen)
        plan.accounts_seeded += 1
    return plan


async def write_plan(plan: Plan, now: datetime) -> int:
    """Range chaque entrée dans le cache commun ; rend le nombre d'entreprises écrites."""
    written = 0
    for entry in plan.entries.values():
        ttl = entry.ttl_s(now)
        if ttl <= 0:
            continue
        await public_facts.share_fact(
            "jobs", entry.company_key, VARIANT, entry.rows, collected_at=entry.collected_at, ttl_s=ttl
        )
        written += 1
    return written


async def read_accounts(page_size: int = _PAGE) -> AsyncIterator[dict]:
    """Les comptes analysés depuis moins de 30 jours (lecture seule, par pages triées sur l'identifiant)."""
    from app.services.supabase_client import get_supabase

    client = get_supabase()
    since = (datetime.now(UTC) - FRESHNESS).isoformat()
    last_id: str | None = None
    while True:
        query = (
            client.table("accounts")
            .select("id,siren,website,signals_collected_at,it_job_signals:raw_analysis->it_job_signals")
            .gte("signals_collected_at", since)
            .order("id")
            .limit(page_size + 1)
        )
        if last_id is not None:
            query = query.gte("id", last_id)
        rows = (await query.aexecute()).data or []
        rows = [r for r in rows if r.get("id") != last_id]
        for row in rows[:page_size]:
            yield row
        if len(rows) <= page_size - 1:
            return
        last_id = rows[page_size - 1]["id"]


async def run(
    *,
    dry_run: bool,
    accounts: Callable[[], AsyncIterator[dict]] = read_accounts,
    write: Callable[[Plan, datetime], Awaitable[int]] = write_plan,
    now: datetime | None = None,
) -> Plan:
    moment = now or datetime.now(UTC)
    collected = [a async for a in accounts()]
    plan = build_plan(collected, moment)
    print(
        f"{'[dry-run] ' if dry_run else ''}comptes lus={plan.accounts_seen} semés={plan.accounts_seeded} "
        f"entreprises={len(plan.entries)} offres={plan.offers} "
        f"(ignorés : > 30 j={plan.skipped_old}, sans clé SIREN/domaine={plan.skipped_no_key}, sans offre={plan.skipped_no_offer})"
    )
    if not dry_run:
        if not await provider_cache.cache_available():
            raise SystemExit("Aucun cache (Redis / Postgres) branché : rien n'a été écrit.")
        print(f"entreprises écrites : {await write(plan, moment)}")
    return plan


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--dry-run", action="store_true", help="compte (comptes, entreprises, offres) sans rien écrire")
    args = parser.parse_args(argv)
    asyncio.run(run(dry_run=args.dry_run))
    return 0


if __name__ == "__main__":
    sys.exit(main())
