"""#3901.12 — parité du lexique cyber entre ``wttj.py`` et ``job_search.py``.

Les deux sources jugent une offre avec LE MÊME couple (``offer_relevant_to_profile``,
``is_it_offer``) : le lexique vit à un seul endroit (GA-26), aucune source ne
garde sa propre liste de termes. La garde sait dire NON : si l'une des deux
recopiait un filtre local, l'identité des fonctions casserait.
"""

import pytest

from app.services import domain_job_filters
from app.services.data_sources import france_travail, job_search, wttj

_CYBER_PROFILE = {
    "companyName": "Cindynia",
    "offers": ["Audit securite", "SOC manage", "IAM"],
    "offerDomain": "cyber",
}


def test_both_sources_share_the_same_filter_and_it_check():
    assert wttj.offer_relevant_to_profile is domain_job_filters.offer_relevant_to_profile
    assert job_search.offer_relevant_to_profile is domain_job_filters.offer_relevant_to_profile
    assert wttj.is_it_offer is france_travail.is_it_offer
    assert job_search.is_it_offer is france_travail.is_it_offer


@pytest.mark.parametrize("title", ["Analyste SOC N2", "Pentester", "RSSI adjoint"])
def test_cyber_titles_pass_identically_in_both_sources(title):
    offer = {"intitule": title}
    verdicts = {
        name: module.offer_relevant_to_profile(offer, _CYBER_PROFILE, it_check=module.is_it_offer)
        for name, module in (("wttj", wttj), ("job_search", job_search))
    }
    assert verdicts["wttj"] is verdicts["job_search"] is True


def test_non_cyber_title_is_rejected_identically():
    offer = {"intitule": "Soudeur atelier"}
    for module in (wttj, job_search):
        assert module.offer_relevant_to_profile(offer, _CYBER_PROFILE, it_check=module.is_it_offer) is False
