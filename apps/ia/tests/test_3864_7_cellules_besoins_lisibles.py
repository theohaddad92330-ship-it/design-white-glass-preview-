"""#3864.7 (recette prod 10/10) — la carte des besoins affichait 37 cellules de
JSON brut (« {'term': 'Java', 'level': None, 'required': True} »), des statuts
bruts (`to_match`, `decide_expired`) et des dates ISO complètes. La sérialisation
se corrige À LA SOURCE : une cellule est un texte humain, jamais un objet.
"""

from __future__ import annotations

from app.services.chat_tools import _needs_export_card, _needs_export_cell

_SKILLS = [
    {"term": "Java", "level": None, "required": True},
    {"term": "Spark", "level": "confirmé", "required": False},
    "AWS",
]


def test_skill_objects_become_labels_never_a_dict_repr() -> None:
    cell = _needs_export_cell(_SKILLS)
    assert cell == "Java, Spark (confirmé), AWS"
    assert cell is not None and "{" not in cell and "None" not in cell and "True" not in cell


def test_statuses_and_next_actions_are_labelled() -> None:
    assert _needs_export_cell("to_match", key="status") == "Matching à lancer"
    assert _needs_export_cell("decide_expired", key="next_action") == "Échéance passée — trancher"
    # An unknown key is never shown as a raw snake_case token.
    assert _needs_export_cell("zzz_inconnu", key="status") is None


def test_dates_are_date_only() -> None:
    assert _needs_export_cell("2026-09-11T07:54:14.668Z", key="deadline_at") == "2026-09-11"


def test_card_has_no_cell_starting_with_a_brace_or_bracket() -> None:
    need = {
        "label": "Dev Java",
        "account": "ACME",
        "skills": _SKILLS,
        "status": "to_match",
        "starts_on": "2026-11-02T00:00:00Z",
        "deadline_at": None,
        "next_action": "run_matching",
    }
    card = _needs_export_card([need])
    assert card is not None
    for row in card["rows"]:
        for cell in row["cells"]:
            assert cell is None or not cell.lstrip().startswith(("{", "["))
    cells = card["rows"][0]["cells"]
    assert "Matching à lancer" in cells and "Lancer le matching" in cells
    assert cells[5] is None
