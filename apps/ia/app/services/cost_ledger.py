"""Registre des coûts par ANALYSE et par FOURNISSEUR (décision Louis 31/07, D19).

Le problème qu'il résout : ``analysis_runs.cost_eur`` déclarait ~0,75 €/run
pendant que la console Anthropic facturait sept fois plus, et personne ne savait
où partait la différence — parce que rien n'agrégeait les coûts AILLEURS que
dans le pipeline d'analyse, et rien ne distinguait les fournisseurs entre eux.

Deux principes, tous les deux non négociables :

1. **On enregistre toujours les UNITÉS, on n'invente jamais un prix.** Un appel
   Firecrawl, c'est une page ; un appel Apollo, c'est une recherche. Le coût en
   euros n'apparaît que si l'opérateur a renseigné le prix unitaire du
   fournisseur (``PROVIDER_UNIT_COST_<NOM>``) — sinon la ligne porte ``None``,
   et l'écran affiche « non tarifé » plutôt qu'un zéro qui se lirait « gratuit ».
   Un coût fabriqué serait pire que pas de coût : on s'en servirait pour fixer
   les prix de vente.

2. **Le registre ne peut pas casser un run.** Toute erreur d'enregistrement est
   avalée : une métrique n'a jamais le droit de faire échouer l'analyse qu'elle
   mesure.

Portée : un ``ContextVar``, donc une par tâche asyncio. Le pipeline pose le
registre au début du run (``bind_run``) ; tout ce qui s'exécute dessous
enregistre dedans, sans qu'aucun client fournisseur n'ait à recevoir un
paramètre de plomberie.
"""

from __future__ import annotations

import logging
import os
import re
from contextlib import contextmanager
from contextvars import ContextVar
from dataclasses import dataclass, replace
from typing import Iterator

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class CostEntry:
    """Ce qu'UN fournisseur a consommé sur UN run, pour UNE opération."""

    provider: str
    operation: str
    calls: int = 0
    units: int = 0
    #: ``None`` = fournisseur non tarifé sur cet environnement. JAMAIS 0.0 par
    #: défaut : « gratuit » et « prix inconnu » ne se lisent pas pareil.
    cost_usd: float | None = None
    # #2440.6/.7/.8/.9/.16/.19 — détail LLM (Anthropic/OpenAI uniquement, un
    # fournisseur de données comme Firecrawl ou Apollo ne les porte jamais).
    # Compteurs : additionnés entre deux appels de la même (provider,
    # operation), comme `units`. Le reste (modèle/statut/version tarifaire) est
    # une valeur SCALAIRE — le dernier appel vu gagne, même convention que le
    # champ `model` de `claude_service.PromptCost`.
    model: str | None = None
    input_tokens: int = 0
    output_tokens: int = 0
    cache_read_tokens: int = 0
    cache_creation_tokens: int = 0
    #: Fait immuable de CET appel (« ok » aujourd'hui — aucun appelant ne
    #: journalise encore un échec ici) : jamais un statut de cycle de vie qui se
    #: mettrait à jour après coup.
    status: str | None = None
    #: La grille de prix qui a produit `cost_usd` — absente si l'appel n'est pas
    #: tarifé (pas de grille appliquée, pas de version à citer).
    tariff_version: str | None = None
    #: #2442.12 (épopée #2879) — l'outil de chat qui a consommé, posé par
    #: `bind_tool` au SEUL point d'exécution d'un outil (`chat_orchestrator`).
    #: `None` = hors outil (génération du tour, phase d'analyse) : la ligne garde
    #: alors sa forme d'avant, sans clé — jamais un outil deviné.
    tool: str | None = None


@dataclass
class RunLedger:
    run_id: str
    entries: dict[tuple[str, str, str | None], CostEntry]


_current: ContextVar[RunLedger | None] = ContextVar("cost_ledger", default=None)

#: #2442.12 — l'outil en cours d'exécution DANS CETTE TÂCHE asyncio. Un
#: `ContextVar` et non un attribut du registre : trois outils lancés ensemble
#: (`asyncio.gather`) ont chacun leur copie du contexte, donc aucun ne déborde
#: sur l'autre.
_current_tool: ContextVar[str | None] = ContextVar("cost_ledger_tool", default=None)

#: La forme qu'admet `provider_costs_tool_check` (migration `ProviderCostTool`) —
#: un identifiant d'outil, rien d'autre. Un nom hors forme n'est PAS transmis :
#: une ligne refusée par la base ferait perdre tout le registre du tour.
_TOOL_NAME_RE = re.compile(r"^[a-z][a-z0-9_]{0,63}$")


@contextmanager
def bind_tool(name: str) -> Iterator[None]:
    """#2442.12 — attribue à l'outil ``name`` tout ce qui s'enregistre dessous."""
    token = _current_tool.set(name if _TOOL_NAME_RE.match(name or "") else None)
    try:
        yield
    finally:
        _current_tool.reset(token)


def _unit_price(provider: str) -> float | None:
    """Prix unitaire d'un fournisseur, en dollars, depuis l'environnement.

    ``PROVIDER_UNIT_COST_FIRECRAWL=0.001`` = un dollar pour mille pages. Absent
    ou illisible ⇒ ``None`` : on comptera les unités sans prétendre au prix.
    """
    raw = os.getenv(f"PROVIDER_UNIT_COST_{provider.upper()}")
    if raw is None or not raw.strip():
        return None
    try:
        value = float(raw)
    except ValueError:
        logger.warning("PROVIDER_UNIT_COST_%s=%r illisible — unités comptées sans prix", provider.upper(), raw)
        return None
    return value if value >= 0 else None


@contextmanager
def bind_run(run_id: str) -> Iterator[RunLedger]:
    """Ouvre un registre pour la durée d'un run."""
    ledger = RunLedger(run_id=run_id, entries={})
    token = _current.set(ledger)
    try:
        yield ledger
    finally:
        _current.reset(token)


def record(
    provider: str,
    operation: str,
    units: int = 1,
    cost_usd: float | None = None,
    *,
    model: str | None = None,
    input_tokens: int = 0,
    output_tokens: int = 0,
    cache_read_tokens: int = 0,
    cache_creation_tokens: int = 0,
    status: str | None = None,
    tariff_version: str | None = None,
) -> None:
    """Enregistre une consommation. Hors run, c'est un no-op silencieux.

    ``cost_usd`` explicite (cas d'Anthropic, qui connaît son propre prix) prime
    sur la table de prix unitaires.

    Les paramètres nommés (#2440.6/.7/.8/.9/.16/.19) ne concernent que les
    fournisseurs de MODÈLE — un fournisseur de données (Firecrawl, Apollo…) les
    laisse à leur défaut, et `snapshot()` les omet alors de la ligne plutôt que
    d'écrire des clés vides sur des lignes qui n'ont rien à en dire.
    """
    try:
        ledger = _current.get()
        if ledger is None:
            return
        tool = _current_tool.get()
        key = (provider, operation, tool)
        previous = ledger.entries.get(key, CostEntry(provider=provider, operation=operation, tool=tool))

        if cost_usd is None:
            price = _unit_price(provider)
            cost_usd = price * units if price is not None else None

        merged_cost: float | None
        if previous.cost_usd is None and cost_usd is None:
            merged_cost = None
        else:
            merged_cost = (previous.cost_usd or 0.0) + (cost_usd or 0.0)

        ledger.entries[key] = replace(
            previous,
            calls=previous.calls + 1,
            units=previous.units + units,
            cost_usd=merged_cost,
            model=model if model is not None else previous.model,
            input_tokens=previous.input_tokens + input_tokens,
            output_tokens=previous.output_tokens + output_tokens,
            cache_read_tokens=previous.cache_read_tokens + cache_read_tokens,
            cache_creation_tokens=previous.cache_creation_tokens + cache_creation_tokens,
            status=status if status is not None else previous.status,
            tariff_version=tariff_version if tariff_version is not None else previous.tariff_version,
        )
    except Exception as exc:  # noqa: BLE001 — une métrique ne casse jamais un run
        logger.debug("cost_ledger.record ignoré: %s", exc)


def snapshot() -> list[dict]:
    """Le registre du run courant, prêt à voyager vers l'API (JSON).

    Les clés du détail LLM (#2440.6/.7/.8/.9/.16/.19) ne sont écrites QUE
    lorsqu'elles portent une valeur : une ligne Firecrawl/Apollo garde sa forme
    d'avant, byte pour byte — sinon chaque ligne de données gonflerait l'en-tête
    `x-bellum-costs` (borné à 4000 caractères, silencieux au-delà) de clés qui
    ne lui disent jamais rien.
    """
    ledger = _current.get()
    if ledger is None:
        return []
    rows: list[dict] = []
    for entry in sorted(ledger.entries.values(), key=lambda e: (e.provider, e.operation, e.tool or "")):
        row: dict = {
            "provider": entry.provider,
            "operation": entry.operation,
            "calls": entry.calls,
            "units": entry.units,
            "cost_usd": entry.cost_usd,
        }
        if entry.model is not None:
            row["model"] = entry.model
        if entry.input_tokens:
            row["input_tokens"] = entry.input_tokens
        if entry.output_tokens:
            row["output_tokens"] = entry.output_tokens
        if entry.cache_read_tokens:
            row["cache_read_tokens"] = entry.cache_read_tokens
        if entry.cache_creation_tokens:
            row["cache_creation_tokens"] = entry.cache_creation_tokens
        if entry.status is not None:
            row["status"] = entry.status
        if entry.tariff_version is not None:
            row["tariff_version"] = entry.tariff_version
        if entry.tool is not None:
            row["tool"] = entry.tool
        rows.append(row)
    return rows


def total_usd() -> float | None:
    """Total tarifé du run — ``None`` si AUCUNE ligne n'est tarifée.

    Un total qui additionnerait des lignes non tarifées comme des zéros
    annoncerait un run moins cher qu'il n'est. Les lignes sans prix sont donc
    exclues du total, et l'écran dit combien il en reste.
    """
    priced = [e.cost_usd for e in (_current.get().entries.values() if _current.get() else []) if e.cost_usd is not None]
    return sum(priced) if priced else None
