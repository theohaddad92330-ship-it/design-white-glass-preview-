"""SIG-B / B2-RESTES (recette prod 11/10 nuit, 12/10) — « après relance, 0 contact « Offre d'emploi publiée » » sur
un grand groupe : l'offre qui NOMME son recruteur (TheirStack) est la même que celle qu'une source directe (France
Travail, ATS…) a déjà ; `drop_known_offers` retirait la copie de l'agrégateur — et son recruteur avec elle.
Le recruteur voyage maintenant sur l'offre directe gardée, sa preuve (URL, date) restant celle de l'offre."""

from __future__ import annotations

from app.services.data_sources.job_aggregators import graft_recruiters
from app.services.data_sources.job_recruiters import split_job_recruiters

TEAM = [{"fullName": "Claire Martin", "role": "Chargée de recrutement"}]


def _direct() -> dict:
    return {"title": "Data engineer", "city": "Lille", "url": "https://ft.example/1", "date": "2026-10-04"}


def _aggregator(url: str = "https://theirstack.example/9") -> dict:
    return {"title": "Data Engineer", "city": "lille", "url": url, "date": "2026-10-05", "recruiters": TEAM}


def test_recruiters_of_a_duplicate_aggregator_offer_ride_on_the_direct_offer() -> None:
    direct = _direct()
    grafted = graft_recruiters([direct], [_aggregator()])

    assert grafted[0]["recruiters"] == TEAM
    assert "recruiters" not in direct  # l'entrée n'est jamais modifiée
    jobs, people = split_job_recruiters(grafted)
    assert people[0]["fullName"] == "Claire Martin"
    assert people[0]["jobPosting"]["url"] == "https://ft.example/1"  # la preuve est l'offre gardée


def test_same_url_matches_even_when_title_differs() -> None:
    other = {**_aggregator("https://ft.example/1"), "title": "Ingénieur données"}
    assert graft_recruiters([_direct()], [other])[0]["recruiters"] == TEAM


def test_no_match_no_recruiter_invented() -> None:
    unrelated = {**_aggregator(), "title": "Caissier", "city": "Paris"}
    assert graft_recruiters([_direct()], [unrelated]) == [_direct()]
    assert graft_recruiters([_direct()], []) == [_direct()]


def test_an_offer_that_already_names_its_team_keeps_it() -> None:
    mine = {**_direct(), "recruiters": [{"fullName": "Paul Durand"}]}
    assert graft_recruiters([mine], [_aggregator()])[0]["recruiters"] == [{"fullName": "Paul Durand"}]
