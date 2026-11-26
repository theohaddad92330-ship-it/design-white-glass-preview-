"""Typed payload of the Messenger agent (post-pipeline + on-demand).

Each :class:`MessageBundle` carries the LLM output for ONE contact (pitch +
icebreaker today, future fields via ``extra='allow'``). The agent accepts
1 or N contacts and returns one bundle per contact for which a message
was successfully generated — per-contact failures land in
``meta.warnings`` so the caller can see exactly which contact failed.

Mirrored by ``packages/contracts/src/schemas/messenger-data.ts``.
"""

from __future__ import annotations

from pydantic import BaseModel, Field


class MessageBundle(BaseModel):
    contact: str = ""
    messages: dict = Field(default_factory=dict)

    model_config = {
        "populate_by_name": True,
        "extra": "allow",
    }


class MessengerData(BaseModel):
    messages: list[MessageBundle] = Field(default_factory=list)

    model_config = {
        "populate_by_name": True,
        "extra": "allow",
    }
