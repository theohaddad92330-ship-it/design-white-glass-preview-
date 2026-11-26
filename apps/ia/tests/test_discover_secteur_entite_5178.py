"""#5178 — le secteur d'une carte Découvrir vient de l'entité AFFICHÉE : un siège de marque classé 68.xx
(l'immobilier du groupe) ne fait pas « Activités immobilières » ; à défaut de NAF fiable, aucun secteur."""

import pytest

from app.routers.discover import _registry_row


def _row(name: str, naf: str, **extra) -> dict:
    return {"siren": "306138900", "name": name, "nafCode": naf, **extra}


@pytest.mark.parametrize("naf", ["68.20B", "6820B", "68.10Z", "68.31Z"])
def test_marque_a_naf_immobilier_na_aucun_secteur(naf):
    card = _registry_row(_row("DECATHLON", naf))
    assert card is not None
    assert not card["sector"]
    assert "sectorBasis" not in card


def test_enseigne_a_naf_immobilier_na_aucun_secteur():
    card = _registry_row(_row("LISTEN TOO LILLE", "68.20B"))
    assert not card["sector"]


@pytest.mark.parametrize("name", ["NEXITY PROMOTION IMMOBILIER", "SCI DU PARC", "FONCIERE DES REGIONS", "GESTION PATRIMOINE LILLE"])
def test_vraie_entite_immobiliere_garde_son_secteur(name):
    assert _registry_row(_row(name, "68.20B"))["sector"]


def test_activite_declaree_reste_prioritaire():
    card = _registry_row(_row("DECATHLON", "68.20B", sector="Commerce de détail d'articles de sport"))
    assert card["sector"] == "Commerce de détail d'articles de sport"
    assert card["sectorBasis"] == "declared_activity"


def test_naf_hors_immobilier_inchange():
    assert _registry_row(_row("DECATHLON FRANCE", "47.64Z"))["sector"]
