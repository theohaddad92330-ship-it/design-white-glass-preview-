"""#3705.5 — rattachement de groupe d'une entreprise, vérifié PAR LIGNE de résultat.

DÉCISION Louis 11/10 : OUI pour repérer une FILIALE par ligne (0,022 $ l'appel, valeur de
`provider_pricing`). Utilisée par la recherche de Laura ET par Découvrir : UNE fonction, UN réglage
(GA-26).

RENVERSEMENT daté (Louis 11/10, second arbitrage) : une ligne dont le mandataire est une PERSONNE
MORALE (indice `legal_entity_officer`) passe AUSSI par la vérification — dans le MÊME plafond. Sans
ça, la règle « holding → filiale » (#3983, `holding_subsidiary.redirect_holdings`) ne joue pas dans le
cas courant où la holding PRÉSIDE la SAS filiale. Seul un lien capitalistique déjà sourcé
(`capital_link`) n'est pas redemandé.

- plafond d'appels PAR RECHERCHE (`CHAT_SEARCH_GROUP_LOOKUP_MAX`, défaut 8, `0` coupe) ; dans le
  plafond passent d'abord les lignes où la réponse peut CHANGER LA CIBLE (holding NAF 64.20Z/70.10Z
  au siège hors zone, ou mandataire personne morale), puis l'ordre affiché ;
- cache par SIREN : celui de `pappers.get_company` (un SIREN déjà vu ne coûte rien) ;
- coût inscrit : chaque appel vivant passe par `throttle("pappers")` (compté au run) ; ici on pose
  son prix (`provider_pricing`) sur le run, les hits de cache ne coûtent rien ;
- sans `PAPPERS_API_KEY` : zéro appel (no-op strict) ;
- un échec ou une absence ne pose RIEN : jamais de lien inventé — l'indice du registre reste tel
  quel. La filiale est NOMMÉE, jamais retirée.
"""

from __future__ import annotations

import asyncio
import logging
import os
from collections.abc import MutableMapping
from typing import Any

from app.middleware.correlation_id import get_correlation_id
from app.services import provider_pricing, run_metrics
from app.services.holding_subsidiary import is_holding

logger = logging.getLogger(__name__)

# Raison du défaut : chaque ligne vivante coûte (entreprise + cartographie, prix de `provider_pricing`)
# et la latence se paie en parallèle ;
# 8 couvre une page de résultats lisible sans multiplier la facture par la taille du registre.
_DEFAULT_MAX = 8


def _read_max() -> int:
    raw = os.getenv("CHAT_SEARCH_GROUP_LOOKUP_MAX", "").strip()
    if not raw:
        return _DEFAULT_MAX
    try:
        return int(raw)
    except ValueError:
        logger.warning("CHAT_SEARCH_GROUP_LOOKUP_MAX=%r invalide — défaut %d", raw, _DEFAULT_MAX)
        return _DEFAULT_MAX


GROUP_LOOKUP_MAX = _read_max()
_GROUP_LOOKUP_TIMEOUT_S = 15.0


def _live_calls(correlation_id: str) -> int:
    from app.services.pappers import budget

    return budget.run_calls(correlation_id) if correlation_id else 0


async def attach_group_links(items: list[MutableMapping[str, Any]]) -> set[tuple[str, str]]:
    """Pose `group_link = {observed_entities, kind: "capital_link"}` sur les lignes sans lien
    capitalistique déjà sourcé (aucun indice, ou mandataire personne morale) dont Pappers connaît une
    société mère. Bornée, en parallèle, un SIREN une seule fois ; les lignes décisives d'abord.
    Une ligne peut porter `nafCode` et `geography` (bloc #3983.1) : ils servent à la priorité.

    #3983 (reste) — rend aussi les liens capitalistiques SOURCÉS lus dans ces MÊMES réponses (aucun
    appel en plus), en paires `(détenteur, détenue)` de SIREN : la société mère (sens strict,
    `extract_parent_companies`) et, quand la ligne est une tête de groupe ORIENTÉE (`group_affiliation
    .role == "groupe"`), ses filiales. Un nom sans SIREN ne fait aucune paire (jamais rapproché au nom)."""
    edges: set[tuple[str, str]] = set()
    if not os.getenv("PAPPERS_API_KEY", "").strip() or GROUP_LOOKUP_MAX <= 0:
        return edges
    by_siren: dict[str, list[MutableMapping[str, Any]]] = {}
    for item in items:
        siren = str(item.get("siren") or "").strip()
        if siren and not _already_sourced(item):
            by_siren.setdefault(siren, []).append(item)
    # Tri stable : à priorité égale, l'ordre affiché est gardé.
    ranked = sorted(by_siren, key=lambda s: 0 if any(_may_change_target(i) for i in by_siren[s]) else 1)
    sirens = ranked[:GROUP_LOOKUP_MAX]
    if not sirens:
        return edges
    from app.services import pappers

    async def _profile(siren: str) -> Any:
        try:
            return await asyncio.wait_for(pappers.get_company(siren, include_graph=True), _GROUP_LOOKUP_TIMEOUT_S)
        except Exception as exc:  # noqa: BLE001 — pas de lien affirmé sans preuve
            logger.warning("group lookup %s failed: %s", siren, exc)
            return None

    cid = get_correlation_id() or ""
    before = _live_calls(cid)
    profiles = await asyncio.gather(*(_profile(siren) for siren in sirens))
    live = max(_live_calls(cid) - before, 0)
    if cid and live:
        run_metrics.record_cost(cid, "pappers", provider_pricing.cost_for_calls("pappers", live))
    for siren, profile in zip(sirens, profiles, strict=True):
        parent_companies = getattr(profile, "parent_companies", None) or []
        parents = [str(c.name).strip() for c in parent_companies if getattr(c, "name", None)]
        if parents:
            for item in by_siren[siren]:
                item["group_link"] = {"observed_entities": parents[:3], "kind": "capital_link"}
        edges.update((_siren(c), siren) for c in parent_companies if _siren(c) and _siren(c) != siren)
        affiliation = getattr(profile, "group_affiliation", None)
        if getattr(affiliation, "role", None) == "groupe":
            subsidiaries = getattr(profile, "subsidiaries", None) or []
            edges.update((siren, _siren(c)) for c in subsidiaries if _siren(c) and _siren(c) != siren)
    return edges


def _already_sourced(item: MutableMapping[str, Any]) -> bool:
    link = item.get("group_link")
    return isinstance(link, dict) and link.get("kind") == "capital_link"


def _may_change_target(item: MutableMapping[str, Any]) -> bool:
    """La réponse peut déplacer la cible (#3983) : la ligne est une holding dont le siège est hors
    zone (elle peut céder sa place), ou elle est dirigée par une personne morale (filiale probable)."""
    link = item.get("group_link")
    if isinstance(link, dict) and link.get("kind") == "legal_entity_officer":
        return True
    geo = item.get("geography")
    return is_holding(item) and isinstance(geo, dict) and geo.get("basis") == "establishment"


def _siren(company: Any) -> str:
    return str(getattr(company, "siren", None) or "").strip()
