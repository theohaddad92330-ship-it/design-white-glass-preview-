"""Pydantic output model for BELLUM-SUMMARY.

Validated by Instructor — Claude must return data matching this schema.
"""

from __future__ import annotations

from pydantic import BaseModel, Field


class SummaryOutput(BaseModel):
    """Full output of BELLUM-SUMMARY prompt."""

    summary: str = ""
    immediate_action: str = ""
    key_contact: str = ""
    entry_angle: str = ""
    adjusted_score: float = Field(default=5.0, ge=0, le=10)
    score_rationale: str = ""
    time_to_first_meeting_estimate: str = ""
