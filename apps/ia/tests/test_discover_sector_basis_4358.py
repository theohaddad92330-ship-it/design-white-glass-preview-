"""#4358.4 — la carte DIT d'où vient son secteur : code NAF, activité déclarée ou site web."""

from app.routers.discover import _registry_row


def _row(**extra: object) -> dict:
    return {"siren": "123456789", "name": "ACME", **extra}


def test_sector_decoded_from_the_naf_code_says_naf() -> None:
    row = _registry_row(_row(nafCode="62.02A"))
    assert row is not None
    assert row["sector"]
    assert row["sectorBasis"] == "naf"


def test_sector_label_supplied_by_the_source_says_declared_activity() -> None:
    row = _registry_row(_row(nafCode="47.91B", activite="Vente de logiciels en ligne"))
    assert row is not None
    assert row["sector"] == "Vente de logiciels en ligne"
    assert row["sectorBasis"] == "declared_activity"


def test_sector_read_from_the_website_says_website_only_when_the_source_says_so() -> None:
    row = _registry_row(_row(sector="Marketplace B2B", sectorSource="website"))
    assert row is not None
    assert row["sectorBasis"] == "website"


def test_unknown_source_value_is_never_trusted() -> None:
    row = _registry_row(_row(sector="Marketplace B2B", sectorSource="rumeur"))
    assert row is not None
    assert row["sectorBasis"] == "declared_activity"


def test_no_sector_means_no_basis() -> None:
    row = _registry_row(_row())
    assert row is not None
    assert row["sector"] is None
    assert "sectorBasis" not in row


def test_a_naf_label_from_the_source_is_still_the_naf() -> None:
    row = _registry_row(_row(nafCode="62.02A", libelle_naf="Conseil en systèmes et logiciels informatiques"))
    assert row is not None
    assert row["sectorBasis"] == "naf"
