"""#4454 (IA-C) — le producteur de l'étape research honore le contrat partagé : un champ de premier niveau
dont le modèle a dévié de TYPE (nombre à la place d'une chaîne, ``null`` sur un champ non nullable) est
ramené à la forme du contrat AVANT validation — sans rien inventer (jamais une valeur par défaut)."""

from __future__ import annotations

from app.contracts.shared_schemas import conform_to_contract, validate_step

DRIFTED = {
    "employees": 5000,
    "revenue": 1200000000,
    "website": None,
    "siren": None,
    "priority_score": "7.5",
    "pains": None,
    "capital": None,
    "sector": "Banque",
    "is_public": True,
}


def test_la_derive_de_type_viole_le_contrat() -> None:
    assert validate_step("research", DRIFTED)


def test_conform_ramene_la_derive_au_contrat_sans_inventer() -> None:
    fixed = conform_to_contract("research", dict(DRIFTED))
    assert validate_step("research", fixed) == []
    assert fixed["employees"] == "5000"
    assert fixed["revenue"] == "1200000000"
    assert fixed["priority_score"] == 7.5
    assert "website" not in fixed and "siren" not in fixed and "pains" not in fixed
    assert fixed["capital"] is None  # nullable dans le contrat : intact
    assert fixed["sector"] == "Banque" and fixed["is_public"] is True


def test_conform_suit_les_cles_camel_de_la_voie_ia() -> None:
    fixed = conform_to_contract("research", {"priorityScore": "8", "companyLogoUrl": None, "websiteX": None})
    assert fixed == {"priorityScore": 8.0, "companyLogoUrl": None, "websiteX": None}


def test_conform_laisse_intact_ce_quil_ne_sait_pas_ramener() -> None:
    payload = {"priority_score": "high", "employees": ["a"], "booleen": False}
    assert conform_to_contract("research", dict(payload)) == payload


def test_conform_descend_dans_les_objets_et_ramene_les_entiers() -> None:
    """R23 #4454 — IA-C a continué après le correctif de premier niveau : la dérive est aussi dans les objets
    imbriqués (compteurs flottants ou en chaîne là où le contrat veut un entier) et ``branch_count``."""
    drifted = {
        "subsidiaries_summary": {"total": 3.0, "meaningful": "2", "filtered": None},
        "entity_tier_counts": {"P1": 1.0, "P2": "4"},
        "confidence": {"score": "0.8", "tier": "high"},
        "branch_count": "12",
    }
    assert validate_step("research", drifted)
    fixed = conform_to_contract("research", {**drifted, "subsidiaries_summary": dict(drifted["subsidiaries_summary"])})
    assert validate_step("research", fixed) == []
    assert fixed["subsidiaries_summary"] == {"total": 3, "meaningful": 2}
    assert fixed["entity_tier_counts"] == {"P1": 1, "P2": 4}
    assert fixed["confidence"] == {"score": 0.8, "tier": "high"}


def test_conform_nested_ne_devine_rien() -> None:
    payload = {"subsidiaries_summary": {"total": "beaucoup"}, "entity_zones": {"quick_win": 2.5}}
    assert conform_to_contract("research", {k: dict(v) for k, v in payload.items()}) == payload
