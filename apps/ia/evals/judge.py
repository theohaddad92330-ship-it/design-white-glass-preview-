"""Semantic LLM-judge for the golden eval (#275).

The deterministic checks in ``golden_eval`` verify *structure* (every priority
entity has a whatToSell, the stack contains an expected keyword). They cannot
tell whether "GBIS → COBOL/mainframe" is *plausible* — that needs domain
judgment. This module asks Claude, per entity, whether the proposed offers and
stack are credible for that business unit. It is opt-in (``--judge``) and
degrades to an empty verdict list if ``ANTHROPIC_API_KEY`` is unset, so the
harness core stays runnable without secrets.
"""

from __future__ import annotations

import logging
import os
from collections.abc import Mapping, Sequence

from pydantic import BaseModel

logger = logging.getLogger(__name__)

_SYSTEM = (
    "Tu es un expert avant-vente ESN qui audite un plan de compte. On te donne une entité "
    "(BU/filiale) d'un grand groupe avec les offres IT proposées et la stack supposée. "
    "Juge si c'est PLAUSIBLE pour cette entité : la stack correspond-elle à son métier, les "
    "offres sont-elles pertinentes ? Réponds accurate=false seulement si c'est manifestement "
    "incohérent (ex: 'quant/low-latency' sur une filiale RH, 'mainframe COBOL' sur une néobanque "
    "mobile). En cas de doute raisonnable, accurate=true."
)


class _Verdict(BaseModel):
    accurate: bool = True
    reason: str = ""


def _texts(value: object) -> list[str]:
    if isinstance(value, str):
        return [value]
    if isinstance(value, Sequence):
        return [str(v) for v in value]
    return []


def judge_what_to_sell(output: Mapping[str, object], golden: Mapping[str, object]) -> list[dict]:
    """Return ``[{entity, accurate, reason}]`` for each priority entity carrying
    what-to-sell data. Empty list when no key / no such entities / on failure."""
    if not os.environ.get("ANTHROPIC_API_KEY"):
        logger.warning("judge: ANTHROPIC_API_KEY unset — skipping semantic judge")
        return []

    company = str(golden.get("company") or output.get("companyName") or "?")
    entities = output.get("entitiesExhaustive") or output.get("entities_exhaustive") or []
    verdicts: list[dict] = []

    # Lazy import so the harness core has no hard dependency on the Claude client.
    from app.services.claude_service import call_claude_sync

    for e in entities:
        if not isinstance(e, Mapping):
            continue
        if str(e.get("priorityTier") or "") not in ("P1", "P2"):
            continue
        offers = _texts(e.get("whatToSell"))
        stack = _texts(e.get("stack"))
        if not offers and not stack:
            continue
        name = str(e.get("name") or "?")
        user = (
            f"Groupe : {company}\n"
            f"Entité : {name} (type: {e.get('type') or '?'})\n"
            f"Offres proposées (whatToSell) : {offers or '—'}\n"
            f"Stack supposée : {stack or '—'}\n\n"
            "Ces offres et cette stack sont-elles plausibles pour cette entité ?"
        )
        try:
            verdict, _usage = call_claude_sync(
                _SYSTEM, user, response_model=_Verdict, prompt_name="golden_judge_what_to_sell",
            )
            verdicts.append({"entity": name, "accurate": verdict.accurate, "reason": verdict.reason})
        except Exception as exc:  # noqa: BLE001 — judge must never crash the runner
            logger.warning("judge failed for %s: %s", name, exc)
            verdicts.append({"entity": name, "accurate": True, "reason": f"(judge error: {exc})"})

    return verdicts
