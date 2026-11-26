"""#3278 (recette prod 14/10) — « … 4 à 8 personnes C'est … » : deux phrases
collées par une espace, sans le point qui manquait à la première."""

from __future__ import annotations

from app.services.account_vocabulary import build_vocabulary


def _why_of_competitor(compete: str, partner: str) -> str:
    research = {
        "competitors": [{"name": "Alten"}],
        "esnPresence": [{"name": "Alten", "competeAngle": compete, "partnershipAngle": partner}],
    }
    terms = build_vocabulary(research)["terms"]
    return next(t for t in terms if t["term"] == "Alten")["commercialWhy"]


def test_two_angles_without_final_punctuation_are_separated_by_a_full_stop() -> None:
    why = _why_of_competitor("équipe de 4 à 8 personnes", "C'est un partenaire possible")
    assert why == "équipe de 4 à 8 personnes. C'est un partenaire possible"


def test_an_angle_already_ending_with_punctuation_is_not_doubled() -> None:
    assert _why_of_competitor("Concurrencer.", "Rang 2 possible") == "Concurrencer. Rang 2 possible"


def test_a_single_angle_is_kept_as_is() -> None:
    assert _why_of_competitor("Concurrencer", "") == "Concurrencer"
