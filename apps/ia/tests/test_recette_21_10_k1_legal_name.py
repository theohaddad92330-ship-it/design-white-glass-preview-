"""#recette-21-10-K1 — les comptes sociaux de `financials_history` sont ceux d'une ENTITÉ
(ici une holding) : la fiche doit pouvoir la nommer, donc `legal_name` voyage jusqu'à l'analyse."""

from app.routers.phase1_research import _merge_pappers
from app.services.pappers.models import CompanyProfile


def test_registry_legal_name_reaches_the_analysis() -> None:
    profile = CompanyProfile(siren="552059024", nom_entreprise="THALES")
    assert _merge_pappers({}, profile)["legal_name"] == "THALES"


def test_no_registry_profile_invents_no_legal_name() -> None:
    assert "legal_name" not in _merge_pappers({}, None)
