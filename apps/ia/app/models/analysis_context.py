"""Typed mirror of the ``analysisContextSchema`` zod union in
``@bellum/contracts``.

The web composer sends one variant of this union as ``user_context`` on
the start-analysis payload; the API forwards it untouched to the IA
service. Prompts unpack the typed shape into a structured XML block
instead of feeding Claude a free-text blob.
"""

from __future__ import annotations

from typing import Annotated, Literal, Union

from pydantic import BaseModel, ConfigDict, Field


class _BaseContext(BaseModel):
    model_config = ConfigDict(extra="ignore")


class PushOfferContext(_BaseContext):
    preset: Literal["push-offer"]
    offer: str | None = None
    pricing: str | None = None
    differentiation: str | None = None
    idealMission: str | None = None


class KnownAccountContext(_BaseContext):
    preset: Literal["known-account"]
    commercialStatus: Literal["active", "former", "engaged-prospect"] | None = None
    lastInteraction: str | None = None
    openOpportunity: str | None = None
    revenueOrPipeline: str | None = None


class IncumbentContext(_BaseContext):
    preset: Literal["incumbent"]
    incumbentName: str | None = None
    incumbentScope: str | None = None
    contractEndDate: str | None = None
    weakness: str | None = None


class SignalContext(_BaseContext):
    preset: Literal["signal"]
    signalType: Literal[
        "recruitment", "tender", "fundraise", "appointment", "merger-acquisition", "other"
    ] | None = None
    source: str | None = None
    signalDate: str | None = None
    implication: str | None = None


class StrategicContext(_BaseContext):
    preset: Literal["strategic"]
    prioritizationReason: str | None = None
    targetDecisionMaker: str | None = None
    potentialVolume: str | None = None
    closingHorizon: str | None = None
    similarReference: str | None = None


class RetryContext(_BaseContext):
    preset: Literal["retry"]
    missingFromPrevious: str | None = None
    newAngle: str | None = None
    hypothesis: str | None = None


class FreeContext(_BaseContext):
    preset: Literal["free"]
    notes: str | None = None


AnalysisContext = Annotated[
    Union[
        PushOfferContext,
        KnownAccountContext,
        IncumbentContext,
        SignalContext,
        StrategicContext,
        RetryContext,
        FreeContext,
    ],
    Field(discriminator="preset"),
]


def render_analysis_context(ctx: AnalysisContext | None) -> str:
    """Render a context into the XML-ish block Claude prompts consume.

    Free-form contexts are emitted as-is; structured presets become a
    titled block so the model can recognise hints without having to
    re-parse arbitrary user prose.
    """
    if ctx is None:
        return ""
    if ctx.preset == "free":
        return (ctx.notes or "").strip()

    rendered_fields: list[str] = []
    for key, value in ctx.model_dump(exclude_none=True).items():
        if key == "preset" or value in (None, ""):
            continue
        rendered_fields.append(f"  <{key}>{value}</{key}>")

    if not rendered_fields:
        return ""

    return (
        f"<analysis_context preset=\"{ctx.preset}\">\n"
        + "\n".join(rendered_fields)
        + "\n</analysis_context>"
    )
