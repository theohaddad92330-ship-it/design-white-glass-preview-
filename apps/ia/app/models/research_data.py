"""Typed payload of the Researcher agent (Phase 1).

Subclasses :class:`ResearchOutput` so the existing field set carries over
verbatim, and adds ``extra="allow"`` so the Pappers merge fields (``siren``,
``legal_form``, ``headquarters_display``, ``cities``, ``financials_history``,
``executives``, ``branches``, ...) and the ``_api_metrics`` sidecar flow
through unchanged. The strict typing exists at the field level (priority
score range, structured sub-objects) where we already had it; everything new
that the LLM or Pappers adds is captured rather than rejected.

Mirrored by ``packages/contracts/src/schemas/research-data.ts``.
"""

from __future__ import annotations

from app.models.outputs.research import ResearchOutput


class ResearchData(ResearchOutput):
    model_config = {
        "populate_by_name": True,
        "extra": "allow",
    }
