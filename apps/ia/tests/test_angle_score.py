"""The top-3 plays must be the three strongest, not the three emitted first.

`result["angles"][:3]` carried a comment saying "the product keeps ONLY the 3
strongest" while the code kept whichever three the model happened to emit first.
Those three become the plays on the deck, and Phase 4 binds each play's
strategy, entry persona and offer from them — so the cut decides the whole
outbound plan, on no merit signal at all.
"""

from __future__ import annotations

from app.services.angle_score import MAX_SCORE, angle_score, rank_angles


def _angle(**over):
    base = {
        "title": "Angle",
        "strategy": "",
        "entry_contact_persona": "",
        "specific_offer": "",
        "estimated_deal_size": "",
        "prerequisites": "",
    }
    return {**base, **over}


def test_empty_angle_scores_zero() -> None:
    assert angle_score(_angle()) == 0


def test_score_is_bounded() -> None:
    full = _angle(
        specific_offer="Migration SAP S/4HANA",
        entry_contact_persona="DSI",
        strategy="x" * 200,
        estimated_deal_size="400 k€",
    )
    assert 0 < angle_score(full, contact_titles=["Directeur des Systèmes d'Information"]) <= MAX_SCORE


def test_a_concrete_offer_beats_consultant_filler() -> None:
    concrete = _angle(specific_offer="Migration SAP S/4HANA")
    vague = _angle(specific_offer="Accompagnement à la transformation digitale")
    assert angle_score(concrete) > angle_score(vague)


def test_filler_offer_still_beats_no_offer() -> None:
    assert angle_score(_angle(specific_offer="Accompagnement digital")) > angle_score(_angle())


def test_persona_matching_a_real_contact_scores_higher() -> None:
    """An angle entering via "le DSI" is worthless on an account with no DSI."""
    angle = _angle(entry_contact_persona="DSI")
    reachable = angle_score(angle, contact_titles=["Directeur des Systèmes d'Information", "DSI Groupe"])
    unreachable = angle_score(angle, contact_titles=["Responsable Achats"])
    assert reachable > unreachable


def test_persona_matching_is_accent_and_case_insensitive() -> None:
    angle = _angle(entry_contact_persona="Directeur Financier")
    assert angle_score(angle, contact_titles=["DIRECTEUR FINANCIER"]) == angle_score(
        angle, contact_titles=["directeur financier"]
    )


def test_a_developed_strategy_beats_a_headline() -> None:
    developed = _angle(strategy="x" * 120)
    headline = _angle(strategy="Vendre du conseil")
    assert angle_score(developed) > angle_score(headline) > angle_score(_angle())


def test_a_deal_size_adds_signal() -> None:
    assert angle_score(_angle(estimated_deal_size="250 k€")) > angle_score(_angle())


def test_a_blocking_prerequisite_costs_points() -> None:
    clear = _angle(specific_offer="Migration SAP S/4HANA")
    blocked = _angle(specific_offer="Migration SAP S/4HANA", prerequisites="Référencement fournisseur obligatoire")
    assert angle_score(clear) > angle_score(blocked)


def test_an_empty_angle_does_not_profit_from_having_no_prerequisite() -> None:
    """Otherwise a content-free angle out-scores a real play that lists a blocker."""
    empty = _angle()
    real_but_blocked = _angle(specific_offer="Migration SAP S/4HANA", prerequisites="Référencement")
    assert angle_score(real_but_blocked) > angle_score(empty)


def test_camelcase_keys_are_read_too() -> None:
    """The strategy prompt emits camelCase; the wire contract is snake_case."""
    camel = _angle()
    camel.pop("specific_offer")
    camel["specificOffer"] = "Migration SAP S/4HANA"
    assert angle_score(camel) == angle_score(_angle(specific_offer="Migration SAP S/4HANA"))


def test_ranking_puts_the_strongest_first() -> None:
    weak = _angle(title="weak")
    strong = _angle(
        title="strong",
        specific_offer="Migration SAP S/4HANA",
        entry_contact_persona="DSI",
        strategy="x" * 120,
        estimated_deal_size="400 k€",
    )
    ranked = rank_angles([weak, strong], contact_titles=["DSI"])
    assert [a["title"] for a in ranked] == ["strong", "weak"]


def test_ranking_is_a_total_order_ties_keep_input_order() -> None:
    """Equal scores must not resolve on sort internals — that is the bug we are
    removing, one level up."""
    a, b, c = _angle(title="a"), _angle(title="b"), _angle(title="c")
    assert [x["title"] for x in rank_angles([a, b, c])] == ["a", "b", "c"]


def test_ranking_is_stable_across_calls() -> None:
    angles = [_angle(title=str(i), specific_offer="Migration SAP") for i in range(6)]
    assert rank_angles(angles) == rank_angles(angles)


def test_limit_truncates_after_ranking_not_before() -> None:
    weak = _angle(title="weak")
    strong = _angle(title="strong", specific_offer="Migration SAP S/4HANA", strategy="x" * 120)
    # strong is emitted LAST — the old [:1] would have dropped it.
    assert [a["title"] for a in rank_angles([weak, strong], limit=1)] == ["strong"]


def test_non_list_input_is_survivable() -> None:
    assert rank_angles(None) == []  # type: ignore[arg-type]
    assert rank_angles("nope") == []  # type: ignore[arg-type]


def test_ranking_never_invents_or_drops_angles() -> None:
    angles = [_angle(title=str(i)) for i in range(5)]
    assert sorted(a["title"] for a in rank_angles(angles)) == ["0", "1", "2", "3", "4"]
