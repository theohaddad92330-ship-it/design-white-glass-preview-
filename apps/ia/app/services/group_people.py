"""#3983.11 (Louis 15/10) — une filiale sans dirigeant visible emprunte celui de sa maison mère.

Le registre public nomme parfois une personne morale (la holding) et aucune personne physique sur la
filiale : la ligne restait muette alors que le groupe a un dirigeant. Quand un lien capitalistique
SOURCÉ existe (arête `(mère, filiale)` rendue par `group_link_lookup.attach_group_links`), les
mandataires PHYSIQUES de la mère sont rendus sur la filiale, chacun marqué « Dirigeant du groupe »
dans son mandat — jamais présentés comme ceux de la filiale. Sans arête sourcée, rien ne change ;
une filiale qui a déjà ses personnes les garde ; une clé `people` absente reste absente.
"""

from __future__ import annotations

import asyncio
import logging
from collections.abc import Awaitable, Callable, Iterable, MutableMapping
from typing import Any

logger = logging.getLogger(__name__)

GROUP_LEADER_LABEL = "Dirigeant du groupe"
#: Mères distinctes interrogées au plus (registre gratuit, plafond partagé par IP).
_MAX_PARENT_FETCH = 5
_FETCH_TIMEOUT_S = 4.0

PeopleFetcher = Callable[[str], Awaitable[list[dict]]]


def _as_group_leader(person: dict) -> dict:
    out = {**person}
    role = person.get("role")
    base = role.get("value") if isinstance(role, dict) else None
    label = f"{GROUP_LEADER_LABEL} · {base}" if base else GROUP_LEADER_LABEL
    anchor = role if isinstance(role, dict) else person["name"]
    out["role"] = {"value": label, "origin": anchor.get("origin", "registry"), "observedAt": anchor["observedAt"]}
    return out


async def inherit_group_people(
    rows: list[MutableMapping[str, Any]],
    edges: Iterable[tuple[str, str]],
    fetch_people: PeopleFetcher,
) -> None:
    parents_of: dict[str, str] = {}
    for holder, held in edges:
        parents_of.setdefault(held, holder)
    by_siren = {str(r.get("siren") or ""): r for r in rows}
    needy = [r for r in rows if "people" in r and not r["people"] and str(r.get("siren") or "") in parents_of]
    if not needy:
        return
    known: dict[str, list[dict]] = {}
    for parent in {parents_of[str(r["siren"])] for r in needy}:
        listed = by_siren.get(parent)
        if listed is not None and listed.get("people"):
            known[parent] = list(listed["people"])
    missing = [p for p in dict.fromkeys(parents_of[str(r["siren"])] for r in needy) if p not in known]

    async def _one(siren: str) -> tuple[str, list[dict]]:
        try:
            return siren, await asyncio.wait_for(fetch_people(siren), _FETCH_TIMEOUT_S)
        except Exception as exc:  # noqa: BLE001 — pas de dirigeant affirmé sans preuve
            logger.info("group people %s unavailable: %s", siren, exc)
            return siren, []

    for siren, people in await asyncio.gather(*(_one(s) for s in missing[:_MAX_PARENT_FETCH])):
        if people:
            known[siren] = people
    for row in needy:
        leaders = known.get(parents_of[str(row["siren"])])
        if leaders:
            row["people"] = [_as_group_leader(p) for p in leaders]
