"""Enrichissement en ligne du brief commercial — « on enrichit sur ce qui manque ».

Chantier « briefs comptes » (01/10/2026, point 44). Demande du CEO : quand le
dossier laisse un trou BLOQUANT pour le brief, on va le chercher en ligne — et
SEULEMENT ce trou, pas tout le compte.

Trous bloquants (trois, pas un de plus) :

* ``headquarters``    — siège non résolu côté API ;
* ``website``         — aucun site connu du compte ;
* ``recent_activity`` — aucun projet / signal récent dans le dossier.

Règles :

* connecteur DÉJÀ utilisé par le pipeline (``brave_search.search_web``) — aucun
  fournisseur neuf ;
* **sans clé = no-op strict** : zéro appel réseau, le brief part avec ses manques
  omis du brief (#3712.6 — ``gaps`` reste renseigné, jamais affiché) ;
* **≤ ``MAX_QUERIES`` requêtes par compte**, une par trou ;
* **France uniquement** : la requête dit « France », et un résultat dont l'hôte
  porte un domaine pays étranger est retiré ;
* les résultats voyagent comme faits « source web » AVEC leur URL — jamais comme
  vérité du dossier ;
* best-effort : un connecteur en panne ne casse jamais le brief.

Aucun contenu de dossier n'est journalisé : seulement les NOMS de trous et les
comptes de requêtes.
"""

from __future__ import annotations

import logging
import os
from dataclasses import dataclass, field
from typing import Any
from urllib.parse import urlparse

from app.services.brave_search import search_web

logger = logging.getLogger(__name__)

#: Plafond de requêtes web par compte (un par trou bloquant, trois trous).
MAX_QUERIES = 3

#: Résultats gardés par requête — des faits à citer, pas un corpus.
_HITS_PER_QUERY = 3

_EXCERPT_CHARS = 300

#: Les familles du dossier qui disent « il s'est passé quelque chose
#: récemment » — la même lecture que le contrat ``accountAnalysisSchema``.
_RECENT_ACTIVITY_KEYS = (
    "recent_signals",
    "public_tenders",
    "awarded_contracts",
    "program_names",
    "it_job_signals",
)

#: Domaines pays (hors France) — un hôte qui s'y termine n'est pas du périmètre.
#: ``.com`` / ``.org`` / ``.eu`` restent : un groupe français y publie souvent.
_FOREIGN_TLDS = frozenset(
    "uk de es it nl be ch lu ie pt pl cz at dk se no fi us ca cn jp in br mx au nz ru tr ma tn dz sn ci".split()
)

#: Gabarits de requête par trou — « France » dedans, jamais un nom de fournisseur.
_QUERY_BY_GAP = {
    "headquarters": '"{name}" siège social adresse France',
    "website": '"{name}" site officiel France',
    "recent_activity": '"{name}" projets contrats appels d\'offres systèmes d\'information France',
}


@dataclass(frozen=True)
class Enrichment:
    """Ce que l'enrichissement a trouvé — et ce qui manquait."""

    gaps: list[str] = field(default_factory=list)
    queries: int = 0
    facts: list[dict[str, str]] = field(default_factory=list)


def _filled(value: Any) -> bool:
    if value is None:
        return False
    if isinstance(value, str):
        return bool(value.strip())
    if isinstance(value, (list, dict, tuple, set)):
        return len(value) > 0
    return True


def detect_gaps(headquarters: dict[str, Any] | None, dossier: dict[str, Any] | None) -> list[str]:
    """Les trous bloquants, dans l'ordre de priorité (déterministe)."""
    dossier = dossier or {}
    gaps: list[str] = []
    if not (headquarters and _filled(headquarters.get("value"))):
        gaps.append("headquarters")
    if not _filled(dossier.get("website")):
        gaps.append("website")
    if not any(_filled(dossier.get(key)) for key in _RECENT_ACTIVITY_KEYS):
        gaps.append("recent_activity")
    return gaps


def _is_french_scope(url: str) -> bool:
    host = (urlparse(url).hostname or "").lower()
    tld = host.rsplit(".", 1)[-1] if "." in host else ""
    return bool(host) and tld not in _FOREIGN_TLDS


async def enrich_missing(
    account_name: str,
    headquarters: dict[str, Any] | None,
    dossier: dict[str, Any] | None,
) -> Enrichment:
    """Détecte les trous puis, pour CEUX-LÀ seulement, cherche en ligne."""
    gaps = detect_gaps(headquarters, dossier)
    if not gaps:
        return Enrichment()
    # Sans clé = no-op STRICT : aucune tentative, les manques restent nommés.
    if not os.environ.get("BRAVE_API_KEY", "").strip():
        return Enrichment(gaps=gaps)

    name = " ".join((account_name or "").split())
    facts: list[dict[str, str]] = []
    queries = 0
    for gap in gaps[:MAX_QUERIES]:
        queries += 1
        try:
            hits = await search_web(_QUERY_BY_GAP[gap].format(name=name), count=_HITS_PER_QUERY)
        except Exception as exc:  # noqa: BLE001 — jamais str(exc) : il peut citer le compte
            logger.warning("Enrichissement du brief : recherche échouée (%s, gap=%s).", type(exc).__name__, gap)
            continue
        for hit in hits or []:
            url = str(hit.get("url") or "").strip()
            if not url or not _is_french_scope(url):
                continue
            facts.append(
                {
                    "gap": gap,
                    "source": "web",
                    "url": url,
                    "title": str(hit.get("title") or "")[:200],
                    "excerpt": str(hit.get("description") or "")[:_EXCERPT_CHARS],
                }
            )
    logger.info("Enrichissement du brief : gaps=%s, requêtes=%d, faits=%d.", ",".join(gaps), queries, len(facts))
    return Enrichment(gaps=gaps, queries=queries, facts=facts)


__all__ = ["MAX_QUERIES", "Enrichment", "detect_gaps", "enrich_missing"]
