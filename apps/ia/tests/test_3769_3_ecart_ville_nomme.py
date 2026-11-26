"""#3769.3 (lot Q02, recette prod 09/10 soir) — une question géographique (Montpellier)
listait des entreprises dont le siège est ailleurs (Paris, Issy). Le filtre ville doit
tenir ou l'ÉCART être nommé : la carte dit combien de comptes rendus ont leur siège hors
de la ville demandée. Un siège sans ville n'est ni dedans ni dehors : jamais compté.
"""

from __future__ import annotations

from app.services.known_shape_gate import shape_read_from_tool


def _out(cities: list[str | None], axes: list[str]) -> dict:
    return {
        "status": "ok",
        "axes": axes,
        "items": [{"name": f"Société {i}", "city": c, "why": ["x"]} for i, c in enumerate(cities)],
    }


_AXES = ["Ville : Montpellier", "Établissement actif au registre"]


def _limits(card: dict) -> list[str]:
    return card.get("not_evaluated") or []


def test_accounts_headquartered_elsewhere_are_counted_in_a_named_gap() -> None:
    out = _out(["Montpellier", "Paris", "Issy-les-Moulineaux", "Montpellier"], _AXES)
    card = shape_read_from_tool("run_account_search", out)["blocks"]["account_ranking"]
    assert any("2" in line and "Montpellier" in line and "hors" in line for line in _limits(card))


def test_every_account_in_the_city_means_no_gap_line() -> None:
    out = _out(["Montpellier", "montpellier"], _AXES)
    card = shape_read_from_tool("run_account_search", out)["blocks"]["account_ranking"]
    assert not any("hors" in line for line in _limits(card))


def test_a_missing_city_is_never_counted_as_outside() -> None:
    out = _out(["Montpellier", None], _AXES)
    card = shape_read_from_tool("run_account_search", out)["blocks"]["account_ranking"]
    assert not any("hors" in line for line in _limits(card))


def test_without_a_city_axis_nothing_is_claimed() -> None:
    out = _out(["Paris", "Lyon"], ["Département : Hérault (34)", "Établissement actif au registre"])
    card = shape_read_from_tool("run_account_search", out)["blocks"]["account_ranking"]
    assert not any("hors" in line for line in _limits(card))


def test_the_map_card_names_the_gap_too() -> None:
    out = _out(["Montpellier", "Paris"], _AXES)
    block = shape_read_from_tool("run_account_search", out)["blocks"].get("account_map")
    if block is not None:
        assert any("hors de Montpellier" in line for line in block["not_covered"])
