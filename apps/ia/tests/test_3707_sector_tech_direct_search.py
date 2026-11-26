"""#3707 (recette prod 06/10) — « comptes Java dans la banque » = une LISTE, pas un cadrage.

Laura posait des questions de cadrage puis terminait sur « comparer ou analyse de
fond ? » sans aucune carte. Une demande « secteur + techno » est une recherche
directe : `run_account_search` dans CE tour, les cartes ensuite, pas de question.
"""

from __future__ import annotations

from app.prompts.bellum_advisor import build_system_prompt


def _prompt() -> str:
    return build_system_prompt({}, {}, "", "")


def test_sector_plus_tech_request_goes_straight_to_search() -> None:
    out = _prompt()
    assert "RECHERCHE DIRECTE (#3707)" in out
    assert "comptes Java dans la banque" in out
    assert "aucune question de cadrage" in out


def test_direct_search_forbids_ending_on_a_choice_without_list() -> None:
    out = _prompt()
    assert "jamais « comparer ou analyse de fond ? » sans la liste" in out
