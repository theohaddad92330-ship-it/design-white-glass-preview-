"""#2975 / #2440.82 — la déclaration d'évaluations de routage, ÉCRITE.

`provider_evals.py` disait déjà « à évaluer » pour toute destination autre que
la référence Anthropic, tant que l'opérateur n'avait pas posé la variable
d'env `LLM_ROUTING_EVALS_PASSED` ET redéployé — le seul geste pour sortir une
destination de ce statut passait donc par qui a accès au déploiement, jamais
par la console d'opérations qui AFFICHE pourtant le statut. Ce module donne
l'écriture : une table, une ligne par destination, posée depuis
`POST /config/model-routing/evals` (console d'opérations, back-office).

Une destination déclarée une seconde fois CORRIGE sa ligne (auteur, note,
horodatage) plutôt que de la dupliquer — la déclaration dit « cette
destination est évaluée aujourd'hui par cette personne », jamais un historique
d'évaluations.

Lecture fail-soft (jamais de panne qui casse la console, jamais une
destination non lue qui passerait pour « évaluée ») ; écriture qui REMONTE
l'échec (un geste explicite d'opérateur qui échoue doit se voir).
"""

from __future__ import annotations

import logging
from typing import Any

from app.services.supabase_client import get_supabase

logger = logging.getLogger(__name__)

_TABLE = "llm_routing_eval_declarations"


def _normalize_key(raw: str) -> str:
    return (raw or "").strip().lower()


async def declared_keys(*, sb: Any | None = None) -> frozenset[str]:
    """Les clés (`provider` ou `provider:model`, normalisées) déjà déclarées
    évaluées. Une panne de lecture rend un ensemble VIDE, jamais une
    exception : une destination non lue reste « à évaluer », jamais « ok »
    par erreur."""
    try:
        client = sb if sb is not None else get_supabase()
        res = await client.table(_TABLE).select("destination_key").aexecute()
        rows = res.data or []
        return frozenset(_normalize_key(r["destination_key"]) for r in rows if r.get("destination_key"))
    except Exception:  # noqa: BLE001 — jamais bloquant, voir docstring du module
        logger.exception("Échec de lecture des déclarations d'évaluation de routage")
        return frozenset()


async def declare(destination_key: str, declared_by: str, note: str | None = None, *, sb: Any | None = None) -> None:
    """Pose ou corrige la déclaration d'UNE destination. Lève `ValueError` si
    la clé ou l'auteur manque — jamais une ligne à moitié renseignée."""
    key = _normalize_key(destination_key)
    author = (declared_by or "").strip()
    if not key:
        raise ValueError("destination_key manquant")
    if not author:
        raise ValueError("declared_by manquant")

    client = sb if sb is not None else get_supabase()
    payload = {"destination_key": key, "declared_by": author, "note": (note or "").strip() or None}
    existing = await client.table(_TABLE).select("destination_key").eq("destination_key", key).aexecute()
    if existing.data:
        await client.table(_TABLE).update(payload).eq("destination_key", key).aexecute()
    else:
        await client.table(_TABLE).insert(payload).aexecute()
