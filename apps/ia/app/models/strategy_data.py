"""Typed payload of the Strategist agent (Phase 4).

Subclasses :class:`ActionPlanOutput` to reuse the full plan schema verbatim
(actionPlan / offersToPropose / quickWins / ifNoResponse / evaluation /
prioritySubAccounts / competitiveStrategy) and adds ``extra="allow"`` so
prompt evolutions don't reject payloads at the envelope boundary.

Mirrored by ``packages/contracts/src/schemas/strategy-data.ts``.
"""

from __future__ import annotations

from app.models.outputs.plan import ActionPlanOutput


class StrategyData(ActionPlanOutput):
    model_config = {
        "populate_by_name": True,
        "extra": "allow",
    }
