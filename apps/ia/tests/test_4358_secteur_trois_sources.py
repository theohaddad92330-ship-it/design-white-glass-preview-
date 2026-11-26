"""#4358.4 = #4419.10 = #4435.4 — le SECTEUR se lit par trois sources combinées : NAF + activité + site.

Décision Louis 21/10/2026. Le NAF seul ne suffit plus : une entreprise au NAF flou (70.22Z conseil, 62.01Z,
commerce de gros) est rattachée au secteur que disent son activité déclarée et son site. Sources absentes :
on retombe sur le NAF, jamais un secteur inventé ; le rattachement est NOMMÉ.
"""

from __future__ import annotations

from app.services.account_qualification import ExclusionCode, qualify_candidate
from app.services.application_sector_naf import APPLICATION_SECTOR_NAF
from app.services.sector_reading import read_sector_attachment, sectors_asked_in_naf

ECOMMERCE_NAF = ",".join(APPLICATION_SECTOR_NAF["ecommerce"])
FILTERS = {"nafCode": ECOMMERCE_NAF}


def marketplace(**over):
    base = {
        "name": "SECONDE MAIN MARKET",
        "siren": "123456789",
        "legalCategory": "5710",
        "headcountTranche": "21",
        "department": "75",
        "ceased": False,
        "nafCode": "46.90Z",  # commerce de gros non spécialisé : le code flou de la place de marché
    }
    return {**base, **over}


def test_the_asked_sector_is_read_back_from_the_naf_list():
    assert sectors_asked_in_naf(ECOMMERCE_NAF) == ["ecommerce"]
    assert sectors_asked_in_naf("47.91A") == []  # une liste partielle ne nomme aucun secteur


def test_fuzzy_naf_with_marketplace_activity_is_attached_by_activity():
    company = marketplace(corporatePurpose="Exploitation d'une place de marché en ligne de produits reconditionnés")
    assert read_sector_attachment(company, ["ecommerce"]) == {"sector": "ecommerce", "via": "activity"}


def test_fuzzy_naf_with_marketplace_site_is_attached_by_site():
    company = marketplace(websiteText="Achetez et vendez sur notre marketplace de produits d'occasion")
    assert read_sector_attachment(company, ["ecommerce"]) == {"sector": "ecommerce", "via": "site"}


def test_activity_wins_over_site_when_both_say_it():
    company = marketplace(corporatePurpose="plateforme de vente en ligne", websiteText="marketplace")
    assert read_sector_attachment(company, ["ecommerce"])["via"] == "activity"


def test_no_activity_no_site_is_never_a_sector():
    assert read_sector_attachment(marketplace(), ["ecommerce"]) is None


def test_a_precise_naf_elsewhere_is_not_rescued_by_a_word():
    # Un détaillant au NAF précis (47.11F) qui MENTIONNE sa boutique en ligne reste un détaillant (#4358).
    retailer = marketplace(nafCode="47.11F", corporatePurpose="Hypermarchés, drive et boutique en ligne")
    assert read_sector_attachment(retailer, ["ecommerce"]) is None


def test_a_company_in_the_naf_list_needs_no_attachment():
    assert read_sector_attachment(marketplace(nafCode="47.91B"), ["ecommerce"]) is None


def test_qualification_keeps_the_fuzzy_naf_company_and_names_why():
    company = marketplace(corporatePurpose="Exploitation d'une place de marché en ligne")
    result = qualify_candidate(company, filters=FILTERS)
    assert result["verdict"] != "excluded"
    assert result["sectorAttachment"] == {
        "sector": "ecommerce",
        "via": "activity",
        "label": "rattaché par son activité",
    }


def test_qualification_still_excludes_without_a_reading():
    result = qualify_candidate(marketplace(), filters=FILTERS)
    assert result["verdict"] == "excluded"
    assert result["code"] == ExclusionCode.OUT_OF_SECTOR
    assert "sectorAttachment" not in result


def test_qualification_without_attachment_has_no_label_key():
    result = qualify_candidate(marketplace(nafCode="47.91A"), filters=FILTERS)
    assert result["verdict"] != "excluded"
    assert "sectorAttachment" not in result
