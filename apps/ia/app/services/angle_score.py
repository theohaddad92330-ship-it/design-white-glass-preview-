"""Deterministic merit score for an attack angle.

``angles`` was cut to three with ``result["angles"][:3]`` under a comment saying
"the product keeps ONLY the 3 strongest". The code kept the 3 the model happened
to emit first — there is no score field on :class:`Angle` to sort by, so the
ranking signal *was* emission order, which is not merit and shifts between runs.
Those three become the plays on the deck, and Phase 4 binds each play's strategy,
entry persona and offer from them, so the cut decides the whole outbound plan.

Same shape as ``perimeter_score``: the LLM supplies the content, code scores it
on axes we can actually check, code sorts. Nothing here calls a model, so it
costs no latency and cannot itself vary between runs.

The axes reward an angle a salesperson can act on **today**:

* a named, concrete offer to sell (not "accompagnement digital")
* an entry persona that resolves to a real contact we found
* a strategy that says something (a one-liner is a placeholder)
* an estimated deal size — the model only ventures one when it has a basis
* no blocking prerequisite

Deliberately NOT scored: how impressive the title sounds. That is exactly the
axis an LLM optimises for and a buyer ignores.
"""

from __future__ import annotations

from typing import Any

from app.services.text_norm import normalize_name

MAX_SCORE = 20

# Generic filler an angle falls back to when it has nothing specific. Scored as
# absent: "transformation digitale" is not an offer you can put on a quote.
_VAGUE_OFFER_TOKENS = frozenset(
    {
        "accompagnement",
        "conseil",
        "transformation",
        "digital",
        "digitale",
        "innovation",
        "strategie",
        "modernisation",
        "expertise",
        "solution",
        "solutions",
    }
)


def _text(value: object) -> str:
    return str(value or "").strip()


def _is_specific_offer(offer: str) -> bool:
    """An offer is specific when it is not purely made of filler words.

    "Migration SAP S/4HANA" keeps `migration` and `sap`; "accompagnement à la
    transformation digitale" reduces to nothing.
    """
    tokens = [t for t in normalize_name(offer).split() if len(t) > 2]
    if not tokens:
        return False
    return any(t not in _VAGUE_OFFER_TOKENS for t in tokens)


def _persona_matches_a_contact(persona: str, contact_titles: list[str]) -> bool:
    """True when the entry persona maps onto someone we actually found.

    An angle whose entry point is "le DSI" is worthless on an account where we
    have no DSI — it reads well and cannot be executed.
    """
    norm_persona = normalize_name(persona)
    if not norm_persona:
        return False
    persona_tokens = {t for t in norm_persona.split() if len(t) > 2}
    if not persona_tokens:
        return False
    for title in contact_titles:
        title_tokens = {t for t in normalize_name(title).split() if len(t) > 2}
        if persona_tokens & title_tokens:
            return True
    return False


def angle_score(angle: dict[str, Any], *, contact_titles: list[str] | None = None) -> int:
    """Merit score in ``[0, MAX_SCORE]``. Higher = more actionable."""
    titles = contact_titles or []

    offer = _text(angle.get("specific_offer") or angle.get("specificOffer"))
    persona = _text(angle.get("entry_contact_persona") or angle.get("entryContactPersona"))
    strategy = _text(angle.get("strategy"))
    deal_size = _text(angle.get("estimated_deal_size") or angle.get("estimatedDealSize"))
    prerequisites = _text(angle.get("prerequisites"))

    score = 0
    # A concrete offer is the difference between a play and a talking point.
    if _is_specific_offer(offer):
        score += 6
    elif offer:
        score += 2
    # Reachability: an entry persona we can actually put a name against.
    if _persona_matches_a_contact(persona, titles):
        score += 6
    elif persona:
        score += 2
    # A strategy under ~80 chars is a headline, not a plan.
    if len(strategy) >= 80:
        score += 4
    elif strategy:
        score += 2
    # The model only ventures a figure when the corpus gave it a basis.
    if deal_size:
        score += 2
    # A prerequisite is a blocker to clear before the play can start. Only worth
    # a bonus once the angle has substance — an empty angle has no prerequisite
    # either, and must not out-score a real play that happens to list one.
    if score > 0 and not prerequisites:
        score += 2

    return min(score, MAX_SCORE)


def rank_angles(
    angles: list[dict[str, Any]],
    *,
    contact_titles: list[str] | None = None,
    limit: int | None = None,
) -> list[dict[str, Any]]:
    """Sort by merit, then truncate. Stable and total.

    The ``-index`` tiebreak makes the order a TOTAL one: two angles scoring the
    same keep their original relative order, and the result never depends on
    Python's sort internals or on how the caller built the list. Same idiom as
    ``prioritization.assign_priority_tiers``.
    """
    if not isinstance(angles, list):
        return []
    scored = sorted(
        range(len(angles)),
        key=lambda i: (angle_score(angles[i], contact_titles=contact_titles), -i),
        reverse=True,
    )
    ordered = [angles[i] for i in scored]
    return ordered[:limit] if limit is not None else ordered
