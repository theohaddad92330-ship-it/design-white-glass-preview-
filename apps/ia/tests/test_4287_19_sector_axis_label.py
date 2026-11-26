"""#4287.19 — « Secteur d'activité visé : industry » : aucune clé brute dans la carte du tour d'horizon."""

from app.services.chat_tools import _DISCOVER_SECTORS, _SEARCH_NAF_SECTORS, _SECTOR_LABELS_FR, _search_axes


def test_sector_axis_uses_the_french_label_not_the_raw_key():
    axes = _search_axes(["industry"], "", "", "", None)
    assert "Secteur d'activité visé : Industrie" in axes
    assert not any("industry" in axis for axis in axes)


def test_every_known_sector_key_has_a_label_no_key_leaks():
    for key in (*_DISCOVER_SECTORS, *_SEARCH_NAF_SECTORS):
        axis = next(a for a in _search_axes([key], "", "", "", None) if a.startswith("Secteur"))
        assert key in _SECTOR_LABELS_FR, key
        assert axis.endswith(_SECTOR_LABELS_FR[key]), axis


def test_two_sectors_are_joined_with_their_labels():
    axes = _search_axes(["industry", "energy"], "", "", "", None)
    assert "Secteur d'activité visé : Industrie, Énergie" in axes
