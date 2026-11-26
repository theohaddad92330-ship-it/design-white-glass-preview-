"""LOT (15/10) DATA-A point 9 — Apollo Organization Enrichment : ce que l'appel payant renvoie et qu'on
jetait est STOCKÉ (croissance 6/12/24 mois, tours de financement, filiales, maison mère ultime, NAICS,
technologies avec catégorie). Présent seulement : jamais de « 0 » pour une absence."""

from __future__ import annotations

from app.services.apollo_org import _to_org_enrichment

RAW = {
    "id": "org1",
    "primary_domain": "acme.fr",
    "organization_headcount_six_month_growth": 0.04,
    "organization_headcount_twelve_month_growth": -0.02,
    "organization_headcount_twenty_four_month_growth": 0.0,
    "funding_events": [
        {"date": "2024-03-01T00:00:00.000+00:00", "type": "Series B", "amount": "25M", "currency": "EUR", "investors": "Idinvest, Partech", "news_url": "https://n/1"},
        {"date": None, "type": None},
    ],
    "suborganizations": [{"id": "s1", "name": "Acme Cloud", "website_url": "https://cloud.acme.fr"}, {"name": ""}],
    "owned_by_organization": {"name": "Acme Holding"},
    "ultimate_parent": {"name": "Acme Group", "website_url": "https://acme.group"},
    "naics_codes": ["541511", "541512", "541511"],
    "current_technologies": [
        {"name": "AWS", "category": "Cloud"},
        {"name": "Salesforce", "category": "CRM"},
        {"name": "NoCat"},
    ],
}


def test_the_dropped_fields_are_now_kept() -> None:
    out = _to_org_enrichment(RAW, "acme.fr").model_dump(by_alias=True, exclude_none=True)
    assert out["headcountGrowth"] == {"sixMonths": 0.04, "twelveMonths": -0.02, "twentyFourMonths": 0.0}
    assert out["fundingEvents"] == [
        {"date": "2024-03-01", "type": "Series B", "amount": "25M", "currency": "EUR", "investors": "Idinvest, Partech", "newsUrl": "https://n/1"}
    ]
    assert out["suborganizations"] == [{"name": "Acme Cloud", "websiteUrl": "https://cloud.acme.fr"}]
    assert out["ultimateParent"] == {"name": "Acme Group", "websiteUrl": "https://acme.group"}
    assert out["naicsCodes"] == ["541511", "541512"]
    assert out["technologiesDetailed"] == [
        {"name": "AWS", "category": "Cloud"},
        {"name": "Salesforce", "category": "CRM"},
        {"name": "NoCat"},
    ]
    # l'existant ne bouge pas
    assert out["technologies"] == ["AWS", "Salesforce", "NoCat"]
    assert out["parentOrganization"] == "Acme Holding"


def test_absent_means_absent_never_zero() -> None:
    out = _to_org_enrichment({"id": "org2", "primary_domain": "x.fr"}, "x.fr").model_dump(by_alias=True, exclude_none=True)
    for key in ("headcountGrowth", "fundingEvents", "suborganizations", "ultimateParent", "naicsCodes", "technologiesDetailed"):
        assert key not in out
