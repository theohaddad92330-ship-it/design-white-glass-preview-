"""#274 — réduire les tokens output de ``bellum_strategy`` sans perte de qualité.

The measurement rig for the strategy-output campaign: a 15-account golden set, a
published /100 quality barème, a resumable baseline capture and an A/B that
answers "tokens down, quality held?".

Isolated and additive — importing this package changes no engine behaviour, and
every reduction lever it can drive is OFF by default (see
``app/prompts/strategy_levers.py``). Doc: ``agent_docs/strategy-token-eval.md``.
"""

from .campaign import Record, Summary, Verdict, capture, compare, summarize
from .catalog import CampaignCompany, list_companies, load_company
from .rubric import MAX_SCORE, RubricScore, score_strategy
from .variants import VARIANTS, Variant, get_variant

__all__ = [
    "MAX_SCORE",
    "VARIANTS",
    "CampaignCompany",
    "Record",
    "RubricScore",
    "Summary",
    "Variant",
    "Verdict",
    "capture",
    "compare",
    "get_variant",
    "list_companies",
    "load_company",
    "score_strategy",
    "summarize",
]
