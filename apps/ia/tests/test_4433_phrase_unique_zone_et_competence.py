"""#4433 (c133, `gap`) — zone ET compétence élargies dans la MÊME recherche : UNE phrase, les deux paliers.

Avant : `widening_line_from_output` rendait `zone_line` et s'arrêtait — les compétences voisines, élargies ou
tentées, n'étaient jamais dites (la prose du modèle pouvait « élargir » sans les nommer, le code ne le rattrapait pas).
"""

from __future__ import annotations

from app.prompts.laura_acts import ensure_widening_line, widening_line_from_output

ZONE = "J'ai élargi à 100 km : 2 comptes à Toulouse, 6 autour"


def test_both_axes_widened_say_both_in_one_line() -> None:
    line = widening_line_from_output(
        {"items": [{"name": "A"}], "zone_line": ZONE, "widening_steps": ["TypeScript, React"]}
    )
    assert line is not None
    assert line.startswith(ZONE)
    assert "compétences voisines (TypeScript, React)" in line
    assert "\n" not in line


def test_zone_alone_and_skill_alone_are_unchanged() -> None:
    assert widening_line_from_output({"items": [{"name": "A"}], "zone_line": ZONE}) == ZONE
    assert widening_line_from_output({"items": [{"name": "A"}], "widening_steps": ["TypeScript"]}) == (
        "Peu de comptes sur la compétence exacte : j'ai élargi aux compétences voisines (TypeScript)"
    )


def test_neighbours_tried_in_vain_next_to_a_zone_widening_are_named() -> None:
    line = widening_line_from_output({"items": [], "zone_line": ZONE, "widening_tried": ["Scala", "Kotlin"]})
    assert line is not None and line.startswith(ZONE) and "Scala, Kotlin" in line


def test_no_says_no_when_items_came_back_the_tried_neighbours_stay_silent() -> None:
    line = widening_line_from_output({"items": [{"name": "A"}], "zone_line": ZONE, "widening_tried": ["Scala"]})
    assert line == ZONE


def test_a_reply_that_says_widened_but_names_no_neighbour_still_gets_the_fused_line() -> None:
    fused = widening_line_from_output(
        {"items": [{"name": "A"}], "zone_line": ZONE, "widening_steps": ["TypeScript, React"]}
    )
    out = ensure_widening_line("J'ai élargi la zone.\n\nVoici 8 comptes.", [{"widening_line": fused}])
    assert out.startswith(fused.rstrip(".") + ".")


def test_a_reply_that_names_a_neighbour_is_not_doubled() -> None:
    fused = widening_line_from_output(
        {"items": [{"name": "A"}], "zone_line": ZONE, "widening_steps": ["TypeScript, React"]}
    )
    reply = "J'ai élargi à 100 km et à TypeScript.\n\nVoici 8 comptes."
    assert ensure_widening_line(reply, [{"widening_line": fused}]) == reply
