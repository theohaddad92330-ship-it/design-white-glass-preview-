#!/usr/bin/env python3
"""#4647 — RATTRAPE les dates de signaux lues « 1er janvier » dans les dossiers DÉJÀ analysés.

    cd apps/ia
    PYTHONPATH=. python3 scripts/rattrapage_dates_signaux_4647.py --simulation   # compte, n'écrit RIEN
    PYTHONPATH=. python3 scripts/rattrapage_dates_signaux_4647.py --apply        # écrit, après la simulation

Doctrine « un correctif de collecte RATTRAPE l'existant » : avant #4647, « 23 octobre 2026 » devenait le
1er janvier, donc `valid_from` / `valid_to` / `freshness` étaient faux et un signal de recrutement récent
était rangé en `historical`. Ici on RELIT la date déjà stockée sur chaque signal — rien d'autre.

- GRATUIT : aucune source, aucun modèle, aucun crédit. Seule la base est lue, puis écrite en `--apply`.
- SEGMENT SIGNAUX UNIQUEMENT : `accounts.recent_signals`, `raw_analysis.recent_signals` et
  `raw_analysis.signal_layers`. Une analyse entière n'est jamais rejouée ; aucune autre clé de
  `raw_analysis` ne change de valeur.
- Un signal n'est « concerné » que si SON `valid_from` recalculé diffère du stocké : les autres signaux
  (et leur `freshness` d'origine) ne sont pas touchés. Un compte sans signal concerné n'est pas écrit.
- IDEMPOTENT et REPRENABLE : une fois corrigé, un compte n'est plus concerné — relancer = rien à faire ;
  interrompu, on relance (ou `--after-id <dernier id>`) sans retraiter ce qui est fait.
- AJOUT SEULEMENT côté schéma : ni colonne, ni ligne, ni énumération. Une correction humaine
  (`corrected` / `human_override`) n'est jamais écrasée : un tel signal est laissé tel quel.
- NE SE LANCE PAS seul au déploiement : c'est le fil qui le lance, après la recette.
"""

from __future__ import annotations

import argparse
import asyncio
import sys
from collections.abc import AsyncIterator, Awaitable, Callable, Iterable, Mapping
from dataclasses import dataclass, field
from datetime import UTC, date, datetime
from typing import Any

from app.services.signal_freshness import stamp_signals_freshness
from app.services.signal_layers import layer_signals

_PAGE = 100
#: Un signal que l'humain a corrigé gagne toujours, quelle que soit sa date (doctrine).
_HUMAN_KEYS = ("corrected", "human_override", "human_corrected")


@dataclass
class Change:
    account_id: str
    signals: list[dict]
    layers: dict
    raw_signals: list[dict] | None  # None : `raw_analysis` n'a pas de copie à suivre


@dataclass
class Plan:
    accounts_seen: int = 0
    accounts_concerned: int = 0
    signals_concerned: int = 0
    skipped_human: int = 0
    changes: list[Change] = field(default_factory=list)


def _fix_signals(signals: Iterable[Any], today: date) -> tuple[list[dict], int, int]:
    """(signaux corrigés, nombre de signaux concernés, nombre laissés à l'humain)."""
    out: list[dict] = []
    concerned = human = 0
    for s in signals:
        if not isinstance(s, Mapping):
            out.append(s)  # type: ignore[arg-type]
            continue
        if any(s.get(k) for k in _HUMAN_KEYS):
            human += 1
            out.append(dict(s))
            continue
        [fresh] = stamp_signals_freshness([s], today=today)
        if fresh.get("valid_from") != s.get("valid_from"):
            concerned += 1
            out.append(fresh)
        else:
            out.append(dict(s))
    return out, concerned, human


def build_plan(accounts: Iterable[Mapping[str, Any]], today: date) -> Plan:
    plan = Plan()
    for account in accounts:
        plan.accounts_seen += 1
        signals = account.get("recent_signals")
        if not isinstance(signals, list) or not signals:
            continue
        fixed, concerned, human = _fix_signals(signals, today)
        plan.skipped_human += human
        if concerned == 0:
            continue
        raw = account.get("raw_signals")
        raw_fixed = _fix_signals(raw, today)[0] if isinstance(raw, list) else None
        plan.accounts_concerned += 1
        plan.signals_concerned += concerned
        plan.changes.append(
            Change(str(account["id"]), fixed, layer_signals(fixed), raw_fixed)
        )
    return plan


async def read_accounts(after_id: str | None = None, page_size: int = _PAGE) -> AsyncIterator[dict]:
    """Les comptes portant des signaux (lecture seule, pages triées sur l'identifiant)."""
    from app.services.supabase_client import get_supabase

    client = get_supabase()
    last_id = after_id
    while True:
        query = (
            client.table("accounts")
            .select("id,recent_signals,raw_signals:raw_analysis->recent_signals")
            .not_is("recent_signals", "null")
            .order("id")
            .limit(page_size + 1)
        )
        if last_id is not None:
            query = query.gte("id", last_id)  # pas de `gt` au client : on écarte la ligne déjà vue
        rows = [r for r in (await query.aexecute()).data or [] if r.get("id") != last_id]
        for row in rows[:page_size]:
            yield row
        if len(rows) <= page_size - 1:
            return
        last_id = rows[page_size - 1]["id"]


async def write_changes(plan: Plan) -> int:
    """Écrit chaque compte concerné ; rend le nombre de comptes écrits.

    `raw_analysis` est relu juste avant l'écriture : seules les clés `recent_signals` et `signal_layers`
    sont remplacées, les autres repartent telles que relues. Si les signaux ont bougé entre la lecture
    du plan et cette relecture (une analyse a réécrit le compte), le compte est laissé : relancer."""
    from app.services.supabase_client import get_supabase

    client = get_supabase()
    written = 0
    for change in plan.changes:
        rows = (
            await client.table("accounts").select("recent_signals,raw_analysis").eq("id", change.account_id).limit(1).aexecute()
        ).data or []
        if not rows:
            continue
        current = rows[0]
        if [s.get("signal") for s in current.get("recent_signals") or [] if isinstance(s, Mapping)] != [
            s.get("signal") for s in change.signals if isinstance(s, Mapping)
        ]:
            continue
        raw = dict(current.get("raw_analysis") or {})
        if change.raw_signals is not None:
            raw["recent_signals"] = change.raw_signals
        raw["signal_layers"] = change.layers
        await client.table("accounts").update({"recent_signals": change.signals, "raw_analysis": raw}).eq(
            "id", change.account_id
        ).aexecute()
        written += 1
    return written


async def run(
    *,
    apply: bool,
    after_id: str | None = None,
    accounts: Callable[[str | None], AsyncIterator[dict]] = read_accounts,
    write: Callable[[Plan], Awaitable[int]] = write_changes,
    today: date | None = None,
) -> Plan:
    day = today or datetime.now(UTC).date()
    plan = build_plan([a async for a in accounts(after_id)], day)
    print(
        f"{'[simulation] ' if not apply else ''}comptes lus={plan.accounts_seen} "
        f"concernés={plan.accounts_concerned} signaux concernés={plan.signals_concerned} "
        f"(laissés à une correction humaine : {plan.skipped_human})"
    )
    if apply:
        print(f"comptes écrits : {await write(plan)}")
    return plan


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--simulation", action="store_true", help="compte comptes et signaux concernés, n'écrit RIEN")
    mode.add_argument("--apply", action="store_true", help="écrit la correction (après une simulation)")
    parser.add_argument("--after-id", help="reprend après cet identifiant de compte")
    args = parser.parse_args(argv)
    asyncio.run(run(apply=args.apply, after_id=args.after_id))
    return 0


if __name__ == "__main__":
    sys.exit(main())
