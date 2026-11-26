"""Portefeuille de domaines (DATAFORGE V10) → profil → prisme de prompts.

Trois propriétés, dans l'ordre d'importance :

1. **Byte-identité** : un portefeuille 100 % tech résout le pack dominant
   ``esn_it`` → ``get_offer_domain_pack`` rend ``None`` → le prisme est
   EXACTEMENT celui d'aujourd'hui (mêmes objets que le chemin historique).
2. Un portefeuille non-IT fait porter au prisme SES libellés français
   (``label_long`` / ``sell_examples``), pas les offres libres.
3. ``esn_row_to_profile_data`` reflète la même règle que le TS : le
   portefeuille prime, les codes inconnus sont écartés seuls.
"""

from __future__ import annotations

from app.services.domain_focus import DEFAULT_BLOCKS, IT_FOCUS, resolve_domain_focus
from app.services.seller_context import esn_row_to_profile_data


def test_all_tech_portfolio_keeps_prompts_byte_identical() -> None:
    profile = esn_row_to_profile_data(
        {
            "esn_name": "TechServices",
            "expertise_areas": ["Cloud & Infrastructure"],
            "offer_domains": ["SW_ENGINEERING", "CLOUD_DEVOPS_SRE", "CYBER_IAM_GRC"],
        }
    )
    # Le pack dominant d'un portefeuille tech est le DÉFAUT → chemin historique.
    assert profile["offerDomain"] == "esn_it"
    focus = resolve_domain_focus(profile)
    assert focus == {**IT_FOCUS, **DEFAULT_BLOCKS}


def test_non_it_portfolio_drives_the_lens_with_its_french_labels() -> None:
    profile = esn_row_to_profile_data(
        {
            "esn_name": "RiskAdvisory",
            "expertise_areas": ["Conseil"],
            "offer_domains": ["RISK_COMPLIANCE_AML", "INTERNAL_AUDIT_CONTROL", "FINANCE_FPNA", "SW_ENGINEERING"],
        }
    )
    assert profile["offerDomain"] == "finance"
    assert profile["offerPortfolio"] == [
        "RISK_COMPLIANCE_AML",
        "INTERNAL_AUDIT_CONTROL",
        "FINANCE_FPNA",
        "SW_ENGINEERING",
    ]
    focus = resolve_domain_focus(profile)
    # La lentille énumère les domaines du PORTEFEUILLE, dans son ordre.
    assert focus["label_long"] == (
        "Risques, conformité, AML/KYC, réglementaire & modèles / "
        "Audit interne, contrôle interne, SOX & assurance / "
        "Finance, comptabilité, FP&A, contrôle de gestion & consolidation"
    )
    assert "Développement logiciel & applications" in focus["sell_examples"]


def test_row_without_portfolio_is_byte_identical_to_before() -> None:
    row = {"esn_name": "Historique", "expertise_areas": ["Data"], "offer_domain": "esn_it"}
    with_empty = esn_row_to_profile_data({**row, "offer_domains": []})
    without_key = esn_row_to_profile_data(row)
    assert with_empty == without_key
    assert "offerPortfolio" not in with_empty


def test_unknown_codes_are_dropped_one_by_one_never_the_whole_portfolio() -> None:
    profile = esn_row_to_profile_data(
        {
            "esn_name": "X",
            "offer_domains": ["DOMAINE_DU_FUTUR", "HRIS_PAYROLL"],
        }
    )
    # Le portefeuille BRUT voyage (le futur build le lira) ; le pack dominant et
    # les libellés ne s'appuient que sur ce que CE build connaît.
    assert profile["offerPortfolio"] == ["DOMAINE_DU_FUTUR", "HRIS_PAYROLL"]
    assert profile["offerPortfolioNames"] == ["SIRH, paie, workforce tech & HR operations"]
    assert profile["offerDomain"] == "rh"


def test_explicit_legacy_offer_domain_still_wins_when_portfolio_empty() -> None:
    profile = esn_row_to_profile_data({"esn_name": "X", "offer_domain": "finance", "offer_domains": []})
    assert profile["offerDomain"] == "finance"
    assert "offerPortfolioNames" not in profile
