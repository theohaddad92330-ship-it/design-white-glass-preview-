"""#4055.1 (recette prod 14/10, FAIL) — la carte « Cartographie » (``account_map``,
``known_shape_gate._search_map``) groupait les comptes par activité sans jamais lire
``already_in_workspace`` ni ``workspace_match`` : un calcul déjà posé par
``run_account_search`` (lot W-C, #4055) pour la carte `account_ranking`, mais jamais relu ici
— du code juste, calculé, testé, que cette carte-ci n'appelait pas.

Les trois niveaux (déjà dans ta base / groupe dont tu connais déjà une filiale / rapprochement
à vérifier) se disent désormais sur la ligne de chaque compte groupé, jamais fusionnés ni
confondus avec une « nouvelle cible »."""

from __future__ import annotations

from app.services.known_shape_gate import shape_read_from_tool


def _output(**item_extra: object) -> dict:
    return {
        "axes": ["Secteur télécom"],
        "items": [
            {
                "name": "Orange SA",
                "activity": "Télécommunications filaires",
                "city": "Paris",
                "headcount": 5000,
                **item_extra,
            }
        ],
    }


def test_already_in_workspace_is_named_on_the_map_item() -> None:
    read = shape_read_from_tool("run_account_search", _output(already_in_workspace=True), language="fr")
    card = read["blocks"]["account_map"]
    detail = card["groups"][0]["items"][0]["detail"]
    assert "Déjà dans ta base" in detail


def test_group_known_level_is_named_on_the_map_item() -> None:
    output = _output(workspace_match={"level": "group_known", "name": "Orange France"})
    read = shape_read_from_tool("run_account_search", output, language="fr")
    card = read["blocks"]["account_map"]
    detail = card["groups"][0]["items"][0]["detail"]
    assert "Groupe dont vous connaissez déjà une filiale" in detail
    assert "Orange France" in detail


def test_to_verify_level_is_named_on_the_map_item() -> None:
    output = _output(workspace_match={"level": "to_verify", "name": "Orange Business"})
    read = shape_read_from_tool("run_account_search", output, language="fr")
    card = read["blocks"]["account_map"]
    detail = card["groups"][0]["items"][0]["detail"]
    assert "Rapprochement à vérifier" in detail
    assert "Orange Business" in detail


def test_no_workspace_match_leaves_the_detail_untouched() -> None:
    read = shape_read_from_tool("run_account_search", _output(), language="fr")
    card = read["blocks"]["account_map"]
    detail = card["groups"][0]["items"][0]["detail"]
    assert detail == "Paris · 5000 salariés"


def test_already_in_workspace_wins_over_a_proposed_match() -> None:
    # #4055 (lot W-C) — un rapprochement PROPOSÉ ne doit jamais contredire un fait déjà vérifié.
    output = _output(already_in_workspace=True, workspace_match={"level": "to_verify", "name": "Orange Business"})
    read = shape_read_from_tool("run_account_search", output, language="fr")
    card = read["blocks"]["account_map"]
    detail = card["groups"][0]["items"][0]["detail"]
    assert "Déjà dans ta base" in detail
    assert "vérifier" not in detail
