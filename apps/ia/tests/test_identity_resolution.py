"""Company Resolver — hard block on a homonym legal entity (retour Thales
2026-07-07).

The Pappers name search accepts the top hit at name-similarity ≥ 0.55, so a
homonym trading under an identical legal name ("THALES", transports fluviaux,
1-2 salariés, Saint-Étienne-du-Vauvray) passes and poisons the whole dossier:
registry firmo overwrites the web firmo in the header and the SIREN anchor
inflates confidence to 100/100. ``assess_identity`` is the deterministic gate:
it compares the resolved LEGAL entity against the WEB-collected firmographics
and refuses to trust the registry when they contradict each other.
"""

from __future__ import annotations

from app.services.identity_resolution import (
    IdentityAssessment,
    assess_identity,
    parse_employee_count,
)

# ── The Thales homonym (the exact bug) ────────────────────────────────────────
_THALES_WEB = {
    "sector": "Défense, aérospatiale et électronique",
    "employees": "80 000",
    "revenue": "18 000 000 000",
    "description": "Groupe technologique mondial spécialisé dans la défense.",
    "subsidiaries_count": 12,
    "competitors_count": 4,
}
_THALES_REGISTRY = {
    "legal_name": "THALES",
    "naf_label": "Transports fluviaux de fret",
    "headcount_label": "1 ou 2 salariés",
    "headcount_max": 2,
    "city": "Saint-Étienne-du-Vauvray",
    "subsidiaries_count": 0,
    "branch_count": 1,
}


def test_thales_homonym_is_detected_and_registry_distrusted() -> None:
    res = assess_identity(target_name="Thales", web=_THALES_WEB, registry=_THALES_REGISTRY)
    assert isinstance(res, IdentityAssessment)
    assert res.status == "homonyme"
    assert res.use_registry_data is False
    assert res.mode == "web_group"
    assert res.identity_confidence < 0.3
    # Both the size and the sector contradiction must be surfaced for the operator.
    joined = " ".join(res.reasons).lower()
    assert "effectif" in joined or "taille" in joined
    assert "secteur" in joined


def test_brand_differs_from_legal_name_but_entity_is_real() -> None:
    # OVHcloud → OVH GROUPE SA: the brand ≠ legal name (Pappers name search would
    # miss it), but the resolved entity is genuinely large with a corporate graph
    # → NOT a homonym. Must stay verified so we keep using the registry.
    web = {
        "sector": "Cloud computing et hébergement",
        "employees": "2 800",
        "revenue": "900 000 000",
        "description": "Fournisseur de cloud et d'hébergement.",
        "subsidiaries_count": 8,
        "competitors_count": 3,
    }
    registry = {
        "legal_name": "OVH GROUPE SA",
        "naf_label": "Programmation, conseil et autres activités informatiques",
        "headcount_label": "2 000 à 4 999 salariés",
        "headcount_max": 4999,
        "city": "Roubaix",
        "subsidiaries_count": 6,
        "branch_count": 3,
    }
    res = assess_identity(target_name="OVHcloud", web=web, registry=registry)
    assert res.status == "verified"
    assert res.use_registry_data is True
    assert res.mode == "registre"
    assert res.identity_confidence >= 0.9


def test_genuine_small_company_is_not_a_homonym() -> None:
    # A real SME: small on the web AND small in the registry, same sector → the
    # gate must not fire (no size conflict, no group hint).
    web = {
        "sector": "Conseil en informatique",
        "employees": "8",
        "description": "Petite ESN régionale.",
        "subsidiaries_count": 0,
        "competitors_count": 0,
    }
    registry = {
        "legal_name": "PETITE ESN",
        "naf_label": "Conseil en systèmes et logiciels informatiques",
        "headcount_label": "6 à 9 salariés",
        "headcount_max": 9,
        "city": "Nantes",
        "subsidiaries_count": 0,
        "branch_count": 1,
    }
    res = assess_identity(target_name="Petite ESN", web=web, registry=registry)
    assert res.status == "verified"
    assert res.use_registry_data is True


def test_size_conflict_alone_is_uncertain_not_homonym() -> None:
    # Big brand on the web, tiny registry, but the sector is NOT contradictory
    # (registry is plausibly a holding of the group) → uncertain, not homonym.
    web = {
        "sector": "Édition de logiciels",
        "employees": "5 000",
        "description": "Éditeur de logiciels.",
        "subsidiaries_count": 1,
        "competitors_count": 1,
    }
    registry = {
        "legal_name": "ACME SOFTWARE",
        "naf_label": "Édition de logiciels applicatifs",
        "headcount_label": "1 ou 2 salariés",
        "headcount_max": 2,
        "city": "Paris",
        "subsidiaries_count": 0,
        "branch_count": 1,
    }
    res = assess_identity(target_name="Acme Software", web=web, registry=registry)
    assert res.status == "uncertain"
    assert res.use_registry_data is False
    assert 0.3 <= res.identity_confidence < 0.9


def test_cross_family_sector_is_homonym_even_at_plausible_size() -> None:
    # "Société Générale" → "Société Générale d'Électricité" (un électricien de
    # taille correcte, PAS un TPE) : le contrôle de TAILLE ne se déclenche pas,
    # mais la SPLIT DE FAMILLE (finance ≠ btp) trahit l'homonyme. Théo p.10.
    web = {
        "sector": "Banque de détail et services financiers",
        "employees": "500",
        "description": "Banque régionale.",
        "subsidiaries_count": 1,
        "competitors_count": 1,
    }
    registry = {
        "legal_name": "SOCIETE GENERALE D'ELECTRICITE",
        "naf_label": "Travaux d'installation électrique",
        "headcount_label": "100 à 199 salariés",
        "headcount_max": 199,
        "city": "Lyon",
        "subsidiaries_count": 0,
        "branch_count": 2,
    }
    res = assess_identity(target_name="Société Générale", web=web, registry=registry)
    assert res.status == "uncertain"
    assert res.use_registry_data is False
    assert res.mode == "web_group"
    assert "secteur" in " ".join(res.reasons).lower()


def test_same_family_sector_synonyms_stay_verified() -> None:
    # "informatique" (registry) vs "cloud" (web) are the SAME family → the coarse
    # classifier must NOT flag a homonym (avoids the false positive the old bare
    # token overlap would have risked).
    web = {
        "sector": "Cloud computing et hébergement",
        "employees": "500",
        "description": "Fournisseur de cloud.",
        "subsidiaries_count": 1,
    }
    registry = {
        "legal_name": "ACME CLOUD",
        "naf_label": "Programmation, conseil et autres activités informatiques",
        "headcount_label": "100 à 199 salariés",
        "headcount_max": 199,
        "city": "Paris",
        "subsidiaries_count": 0,
        "branch_count": 1,
    }
    res = assess_identity(target_name="Acme Cloud", web=web, registry=registry)
    assert res.status == "verified"
    assert res.use_registry_data is True


def test_generic_registry_sector_does_not_false_positive() -> None:
    # A registry NAF that is too generic to classify (conseil / holding) must NOT
    # trigger a family conflict — absence of a confident family ≠ a mismatch.
    web = {"sector": "Banque", "employees": "500", "subsidiaries_count": 1}
    registry = {
        "legal_name": "HOLDING X",
        "naf_label": "Activités des sièges sociaux",
        "headcount_max": 199,
        "subsidiaries_count": 0,
        "branch_count": 1,
    }
    res = assess_identity(target_name="Holding X", web=web, registry=registry)
    assert res.status == "verified"
    assert res.use_registry_data is True


def test_missing_registry_firmo_does_not_false_positive() -> None:
    # No headcount / NAF on the registry side → we cannot assert a mismatch, so
    # the entity stays verified (absence of data is not evidence of a homonym).
    web = {"sector": "Banque", "employees": "100 000", "subsidiaries_count": 20}
    registry = {"legal_name": "BIG BANK", "naf_label": None, "headcount_max": None, "subsidiaries_count": 40}
    res = assess_identity(target_name="Big Bank", web=web, registry=registry)
    assert res.status == "verified"
    assert res.use_registry_data is True


def test_no_registry_is_web_only_mode() -> None:
    # No registry at all (Pappers down / not found) → nothing to distrust, but the
    # mode is honestly web-only and registry data is unavailable.
    res = assess_identity(target_name="Anything", web=_THALES_WEB, registry=None)
    assert res.status == "no_registry"
    assert res.use_registry_data is False
    assert res.mode == "web_group"


def test_parse_employee_count() -> None:
    assert parse_employee_count("80 000") == 80000
    assert parse_employee_count("2 000 à 4 999 salariés") == 2000
    assert parse_employee_count("8") == 8
    assert parse_employee_count("Non identifié") is None
    assert parse_employee_count(None) is None
    assert parse_employee_count(1200) == 1200
