"""#2905 / #2442.16 — la trace des outils d'un run d'analyse, PERSISTÉE.

Avant ce lot, `app/services/run_metrics.py` calculait déjà la répartition par
fournisseur (Brave, Firecrawl, Apollo, Pappers, chaque prompt Claude) d'un run
— appels, erreurs, durée, attente, coût — mais UNIQUEMENT en mémoire
(``_RUNS``, plafonné à 256 runs, perdu à chaque redémarrage du worker) et dans
une ligne de log. Le rejeu d'un pipeline d'analyse (« relancer le modèle et ses
outils contre des résultats enregistrés en sandbox », #2442.16) suppose de
savoir, après coup, quels outils un run a appelés : ce module lui donne son
PRÉALABLE, la trace elle-même, durable — pas le rejeu complet, qui reste un
chantier distinct (touche `phase1_research.py` dans son ensemble, hors d'une
tranche ciblée).

Une ligne = UN fournisseur pour UN run (`correlation_id`) — la MÊME donnée que
`run_metrics.get_metrics` calcule déjà, jamais une seconde agrégation. Fail-
soft par construction (même geste que `tool_call_audit.py`) : un échec
d'écriture de trace ne doit jamais faire planter un run d'analyse par
ailleurs correct.
"""

from __future__ import annotations

import logging
from typing import Any

from app.services.supabase_client import get_supabase

logger = logging.getLogger(__name__)

_TABLE = "analysis_tool_call_trace"


async def record_analysis_tool_trace(
    correlation_id: str,
    *,
    company_name: str,
    account_id: str | None,
    provider_metrics: dict[str, dict[str, Any]],
    sb: Any | None = None,
) -> None:
    """Persiste la répartition par fournisseur d'UN run, telle que calculée par
    `run_metrics.get_metrics`. Un run sans appel mesuré (`provider_metrics`
    vide) n'écrit AUCUNE ligne — on ne persiste jamais une trace vide.
    """
    if not (correlation_id or "").strip() or not provider_metrics:
        return
    try:
        client = sb if sb is not None else get_supabase()
        for provider, metric in provider_metrics.items():
            await (
                client.table(_TABLE)
                .insert(
                    {
                        "correlation_id": correlation_id,
                        "account_id": (account_id or "").strip() or None,
                        "company_name": company_name,
                        "provider": provider,
                        "calls": int(metric.get("calls", 0)),
                        "errors": int(metric.get("errors", 0)),
                        "duration_ms": int(metric.get("duration_ms", 0)),
                        "wait_ms": int(metric.get("wait_ms", 0)),
                        "cost_usd": float(metric.get("cost_usd", 0.0)),
                    }
                )
                .aexecute()
            )
    except Exception:  # noqa: BLE001 — une trace ne doit jamais faire planter un run
        logger.exception(
            "Échec d'écriture de la trace d'outils d'analyse (correlation_id=%s)", correlation_id
        )
