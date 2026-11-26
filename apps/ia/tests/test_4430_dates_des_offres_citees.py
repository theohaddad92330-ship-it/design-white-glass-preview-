"""#4430.9 / #4429 (recette prod 22/10) — « trouve-moi des comptes à Toulouse » : sur 5 résultats, 4 citaient une
offre SANS sa date. Laura reçoit la date (commit ff48acbc43, `signals[].date`) mais le modèle l'omettait : l'APPELANT
manquait. Le code pose la date à côté de toute offre citée par son intitulé, dans la prose seulement."""

from __future__ import annotations

from app.prompts.laura_acts import ensure_offer_dates, offer_dates_from_output

OUTPUT = {
    "items": [
        {
            "name": "Airbus",
            "signals": [
                {"type": "hiring", "label": "Offre d'emploi — Ingénieur systèmes embarqués", "date": "2026-10-14"},
                {"type": "hiring", "label": "Offre d'emploi — Dev", "date": "2026-10-10"},
            ],
        },
        {"name": "Thales", "signals": [{"type": "tender", "label": "Ingénieur test avionique", "date": None}]},
    ]
}


def test_4430_9_dated_offers_are_collected_from_the_search_output() -> None:
    assert offer_dates_from_output("run_account_search", OUTPUT) == [("Ingénieur systèmes embarqués", "2026-10-14")]
    assert offer_dates_from_output("run_account_search", {"error": "x"}) == []
    assert offer_dates_from_output("search_talents", OUTPUT) == []


def test_4430_9_the_needs_of_a_talent_search_are_collected_too() -> None:
    out = {"accounts": [{"name": "Alten", "needs": [{"title": "Développeur Java / Vue", "date": "2026-10-14"}]}]}
    assert offer_dates_from_output("find_accounts_for_talent", out) == [("Développeur Java / Vue", "2026-10-14")]


def test_4430_9_a_cited_offer_without_a_date_gets_its_date() -> None:
    actions = [{"offer_dates": [("Ingénieur systèmes embarqués", "2026-10-14")]}]
    reply = "- Airbus recrute un ingénieur systèmes embarqués à Blagnac.\n- Thales : rien."
    out = ensure_offer_dates(reply, actions)
    assert "ingénieur systèmes embarqués (14/10/2026) à Blagnac" in out
    assert "offer_dates" not in actions[0]


def test_4430_9_a_line_that_already_carries_a_date_is_left_alone() -> None:
    actions = [{"offer_dates": [("Ingénieur systèmes embarqués", "2026-10-14")]}]
    for line in (
        "Airbus : ingénieur systèmes embarqués (offre du 14 octobre).",
        "Airbus : ingénieur systèmes embarqués, 14/10.",
        "Airbus : ingénieur systèmes embarqués — 2026-10-14.",
    ):
        assert ensure_offer_dates(line, [dict(actions[0], offer_dates=list(actions[0]["offer_dates"]))]) == line


def test_4430_9_cards_are_never_touched_and_unrelated_text_stays() -> None:
    actions = [{"offer_dates": [("Ingénieur systèmes embarqués", "2026-10-14")]}]
    reply = 'Voici.\n\n```json\n{"why": ["Ingénieur systèmes embarqués"]}\n```\n\nRien d\'autre.'
    assert ensure_offer_dates(reply, actions) == reply


def test_4430_9_without_offers_the_reply_is_returned_as_is() -> None:
    assert ensure_offer_dates("Bonjour.", [{"tool": "x"}]) == "Bonjour."
