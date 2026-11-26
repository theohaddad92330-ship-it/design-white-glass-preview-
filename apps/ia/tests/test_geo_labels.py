"""#2547 / #2533 (recette prod 07/10) — Laura affichait « Région : 27 » : le code
INSEE brut, jamais lu par un commercial. Un code de région ou de département se
rend TOUJOURS en libellé dans ce que Laura écrit ou montre."""

from app.services.chat_tools import _search_axes
from app.services.geo_labels import department_label, region_label


def test_region_code_becomes_its_name():
    assert region_label("27") == "Bourgogne-Franche-Comté"
    assert region_label("11") == "Île-de-France"
    assert region_label("84") == "Auvergne-Rhône-Alpes"


def test_unknown_region_code_is_kept_as_typed_never_invented():
    assert region_label("99") == "99"
    assert region_label(" ") == ""


def test_department_code_becomes_name_with_code():
    assert department_label("21") == "Côte-d'Or (21)"
    assert department_label("2A") == "Corse-du-Sud (2A)"
    assert department_label("75") == "Paris (75)"
    assert department_label("971") == "Guadeloupe (971)"


def test_department_list_is_labelled_item_by_item():
    assert department_label("21,25") == "Côte-d'Or (21), Doubs (25)"


def test_unknown_department_is_kept_as_typed():
    assert department_label("ZZ") == "ZZ"


def test_search_axes_never_show_a_raw_region_code():
    axes = _search_axes([], "", "", "", ["27"])
    assert "Région : Bourgogne-Franche-Comté" in axes
    assert not any(axis == "Région : 27" for axis in axes)


def test_search_axes_name_the_department():
    axes = _search_axes([], "21", "", "", None)
    assert "Département : Côte-d'Or (21)" in axes
