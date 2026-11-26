"""BELLUM-IA-C — l'étape research ne doit pas émettre ``registry_annuaire: None`` :
le contrat partagé veut un objet, la clé est optionnelle (absente = non rendu)."""

from __future__ import annotations

from app.contracts.shared_schemas import validate_step
from app.routers.phase1_research import _registry_annuaire_present


def _annuaire_errors(payload: dict) -> list[str]:
    return [e for e in validate_step("research", payload) if "registry_annuaire" in e]


def test_none_violates_the_contract() -> None:
    assert _annuaire_errors({"registry_annuaire": None})


def test_absent_key_honours_the_contract() -> None:
    assert _annuaire_errors({}) == []


def test_empty_annuaire_or_registry_off_omits_the_key() -> None:
    assert _registry_annuaire_present(None, True) is False
    assert _registry_annuaire_present({"siren": "1"}, False) is False
    assert _registry_annuaire_present({"siren": "1"}, True) is True
