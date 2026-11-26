"""#2887 (recette prod 14/10) — « proche de signer » : les stades s'entrelaçaient
(Bellum puis CRM, dans l'ordre de lecture). Les lignes se rangent par stade : le plus
avancé d'abord, un stade n'est jamais coupé en deux."""

from __future__ import annotations

from app.services.action_plan import compose_action_plan


def _near(bellum: list[tuple[str, str]], crm: list[tuple[str, str]]) -> dict:
    return {
        "bellum": [{"accountId": a, "companyName": a, "stage": s} for a, s in bellum],
        "crm": [{"accountId": a, "companyName": a, "stageLabel": s} for a, s in crm],
    }


def _ids(plan: dict) -> list[str]:
    block = next(g for g in plan["gestures"] if g["gesture"] == "proche_de_signer")
    return [a["accountId"] for a in block["actions"]]


def test_near_signing_rows_are_grouped_by_stage_most_advanced_first() -> None:
    near = _near(
        bellum=[("b1", "profiles_submitted"), ("b2", "negotiation"), ("b3", "profiles_submitted")],
        crm=[("c1", "Proposition envoyée"), ("c2", "Négociation"), ("c3", "Proposition envoyée")],
    )
    plan = compose_action_plan(report=None, near_signing=near)
    # Négociation (Bellum + CRM même libellé), Profils présentés, puis Proposition envoyée (ordre de lecture CRM).
    assert _ids(plan) == ["b2", "c2", "b1", "b3", "c1", "c3"]


def test_without_a_second_stage_the_reading_order_is_kept() -> None:
    near = _near(bellum=[("b1", "negotiation"), ("b2", "negotiation")], crm=[])
    assert _ids(compose_action_plan(report=None, near_signing=near)) == ["b1", "b2"]


def test_r40_the_table_names_the_stage_under_the_near_signing_gesture() -> None:
    """#2887.10 (r40) — le tableau doit porter le stade DANS le libellé du geste : « Proche de signer — Négociation »."""
    near = _near(bellum=[("b1", "negotiation")], crm=[("c1", "Proposition envoyée")])
    plan = compose_action_plan(report=None, near_signing=near)
    gestures = [row["cells"][0] for row in plan["exportTable"]["rows"]]
    assert gestures == ["Proche de signer — Négociation", "Proche de signer — Proposition envoyée"]


def test_r40_other_gestures_keep_their_plain_label() -> None:
    plan = compose_action_plan(
        report={"toAnswer": [], "toFollowUp": [], "sourcesCoverage": {}},
        near_signing=_near(bellum=[], crm=[]),
    )
    assert all(row["cells"][0] in ("Répondre", "Relancer", "Appeler", "Contacter") for row in plan["exportTable"]["rows"])
