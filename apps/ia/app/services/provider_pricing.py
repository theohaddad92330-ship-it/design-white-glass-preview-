"""What one outbound call costs, per provider.

The billing dashboard reported ~$1.11 per analysis. That number was Claude
tokens and nothing else — Apollo credits, Firecrawl page credits, Pappers
lookups and the paid search providers were all invisible, so the real cost per
analysis was understated and no one could see which provider was actually
expensive.

``run_metrics`` already counts every call per provider (they all pass through
``rate_limiter.throttle``). This module turns those counts into money.

Two shapes of pricing:

* **Per call** — most providers bill a credit per request (Apollo enrich,
  Firecrawl page, Pappers lookup).
* **Per token** — Claude/OpenAI, already computed exactly from the response
  usage by ``claude_service``, so it is recorded directly and this table must
  NOT double-count it.

Every price is env-overridable because plans differ and change; the defaults
are list prices at the time of writing, in USD. A provider absent from the
table costs 0 — free sources (BODACC, BOAMP, DECP, recherche-entreprises,
France Travail, INSEE, INPI, GitHub) genuinely are free in money, though never
in latency, which ``run_metrics`` reports separately.

Deliberately NOT guessed: if a provider's real price is unknown, leave it at 0
and let the wall-clock speak, rather than invent a number that would then be
billed onward. An estimate presented as a cost is worse than a visible zero.
"""

from __future__ import annotations

import logging
import os

logger = logging.getLogger(__name__)

# USD per successful call. Sources: public list pricing, mid-tier plan.
#   apollo    — People Search/Match export credit (~$0.02 at Basic annual)
#   firecrawl — 1 scrape credit ≈ $0.001 at the $83/mo 100k-credit tier
#   pappers   — ~0.02 € per company lookup on the API Pro plan
#   brave     — $5 / 1000 queries on the Data for Search plan
#   serper    — $0.30 / 1000 queries
#   tavily    — ~$0.008 per search on the Researcher plan
_DEFAULT_UNIT_COST_USD: dict[str, float] = {
    "apollo": 0.020,
    "firecrawl": 0.001,
    "pappers": 0.022,
    "brave": 0.005,
    "serper": 0.0003,
    "tavily": 0.008,
}

# Priced per token from the API response, never per call — adding a unit price
# here would double-count what claude_service already recorded exactly.
TOKEN_PRICED_PREFIXES = ("claude", "openai", "anthropic")


def _env_key(provider: str) -> str:
    return f"COST_PER_CALL_USD_{provider.upper()}"


def unit_cost_usd(provider: str) -> float:
    """USD per call for ``provider``. 0 when free, unknown, or token-priced."""
    name = (provider or "").strip().lower()
    if not name or name.startswith(TOKEN_PRICED_PREFIXES):
        return 0.0

    raw = os.getenv(_env_key(name), "").strip()
    if raw:
        try:
            return max(float(raw), 0.0)
        except ValueError:
            logger.warning("Invalid %s=%r — using the default price", _env_key(name), raw)
    return _DEFAULT_UNIT_COST_USD.get(name, 0.0)


# #3885 — fournisseurs facturés au RÉSULTAT rendu, pas à l'appel : le connecteur
# inscrit lui-même ``résultats × prix`` via ``run_metrics.record_cost`` (le
# compte d'appels de ``price_run`` ne voit pas combien d'offres sont rendues).
#   theirstack — 1 crédit API par offre rendue ; $49 / 1 500 crédits au palier
#                d'entrée (theirstack.com/en/pricing, relu le 10/10/2026)
#   adzuna, jooble — accès développeur / partenaire gratuits : absents (0)
_DEFAULT_UNIT_COST_PER_RESULT_USD: dict[str, float] = {
    "theirstack": 0.0327,
    # Mantiks : 1 crédit par appel « offres d'une société » (la recherche de
    # société est à 0). Growth 190 €/mois = 1 000 crédits (mantiks.io/fr/pricing,
    # relu le 10/10/2026) => 0,19 € ~ 0,22 $ le crédit.
    "mantiks": 0.22,
    # Fantastic.jobs : 95 $/mois pour 20 000 offres (fantastic.jobs/api#pricing)
    # => ~ 0,00475 $ l'offre rendue au palier d'entrée.
    "fantastic_jobs": 0.00475,
}


def unit_cost_per_result_usd(provider: str) -> float:
    """USD par RÉSULTAT rendu pour ``provider`` ; 0 si gratuit ou inconnu.
    Surchargeable par ``COST_PER_RESULT_USD_<PROVIDER>`` (le palier change)."""
    name = (provider or "").strip().lower()
    if not name:
        return 0.0
    env_key = f"COST_PER_RESULT_USD_{name.upper()}"
    raw = os.getenv(env_key, "").strip()
    if raw:
        try:
            return max(float(raw), 0.0)
        except ValueError:
            logger.warning("Invalid %s=%r — using the default price", env_key, raw)
    return _DEFAULT_UNIT_COST_PER_RESULT_USD.get(name, 0.0)


def cost_for_calls(provider: str, calls: int) -> float:
    """Cost of ``calls`` successful calls to ``provider``."""
    if calls <= 0:
        return 0.0
    return round(unit_cost_usd(provider) * calls, 6)


def price_run(metrics: dict[str, dict]) -> dict[str, dict]:
    """Attach a per-call cost to a ``run_metrics`` snapshot.

    Returns a NEW dict; the input is untouched. Only *successful* calls are
    priced — a provider that errored did not consume a credit (and if it did,
    over-reporting a failure as a cost would be the wrong bias). Token-priced
    providers keep the exact cost claude_service already recorded.
    """
    priced: dict[str, dict] = {}
    for provider, metric in metrics.items():
        entry = dict(metric)
        if not provider.lower().startswith(TOKEN_PRICED_PREFIXES):
            billable = max(int(entry.get("calls", 0)) - int(entry.get("errors", 0)), 0)
            entry["cost_usd"] = round(float(entry.get("cost_usd", 0.0)) + cost_for_calls(provider, billable), 6)
        entry["unit_cost_usd"] = unit_cost_usd(provider)
        priced[provider] = entry
    return priced


def total_cost_usd(metrics: dict[str, dict]) -> float:
    """Full run cost: LLM tokens + every paid provider call."""
    return round(sum(m.get("cost_usd", 0.0) for m in price_run(metrics).values()), 6)
