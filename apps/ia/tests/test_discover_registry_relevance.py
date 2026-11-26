"""`POST /discover/registry` — les mécanismes du correctif de pertinence (#2490, #2489).

Le banc (`test_discover_relevance_bench.py`) mesure le RÉSULTAT sur des pages
réelles du registre. Ce fichier-ci tient chaque mécanisme isolément, avec son
témoin : ce que le correctif ne doit PAS toucher.
"""

from __future__ import annotations

from typing import Any
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from app.services.data_sources.recherche_entreprises import LIST_PAGE_MAX


def _row(index: int, **over: Any) -> dict:
    return {
        "name": f"SOCIETE {index:03d} SAS",
        "siren": f"{100000000 + index}",
        "nafCode": "30.30Z",
        "sector": "Construction aéronautique et spatiale",
        "city": "TOULOUSE",
        "department": "31",
        "headcountRange": "50 à 99 salariés",
        "headcountTranche": "21",
        "legalCategory": "5710",
        **over,
    }


class _Source:
    def __init__(self, rows: list[dict] | None = None) -> None:
        self.rows = rows or []
        self.calls: list[Any] = []

    async def __call__(self, filters, limit, degraded=None):
        self.calls.append(filters)
        return [dict(row) for row in self.rows[:limit]]


class _PageSource:
    def __init__(self, rows: list[dict] | None = None) -> None:
        self.rows = rows or []
        self.pages: list[int] = []

    async def __call__(self, filters, limit, degraded=None, *, page: int = 1):
        self.pages.append(page)
        return [dict(row) for row in self.rows[:limit]]


@pytest.fixture
def wire(monkeypatch):
    pappers, gouv, page = _Source(), _Source(), _PageSource()
    monkeypatch.setattr("app.routers.discover._registry_search", pappers)
    monkeypatch.setattr("app.routers.discover._fallback_search", gouv)
    monkeypatch.setattr("app.routers.discover._fallback_search_page", page)
    return pappers, gouv, page


def _post(client: TestClient, filters: dict, limit: int = 20, angles: list[dict] | None = None):
    with patch(
        "app.routers.discover.call_claude", new_callable=AsyncMock, return_value=({"angles": angles or []}, None)
    ):
        # #4433 — ces gardes décrivent la requête EXACTE (ordre des sources, une requête par section) ; avec une
        # ou deux lignes simulées, la recherche s'élargirait par paliers, testés dans test_criteria_paliers_4433.py.
        response = client.post("/discover/registry", json={"filters": filters, "limit": limit, "strictCriteria": True})
    assert response.status_code == 200, response.text
    return response.json()


# ── #2490.1 — la catégorie juridique arrive jusqu'à la qualification ────────


def test_a_natural_person_from_the_registry_is_excluded(client: TestClient, wire) -> None:
    pappers, _, _ = wire
    pappers.rows = [_row(1, name="BONILLA CHRISTOPHE", legalCategory="1000"), _row(2)]

    body = _post(client, {"nafCode": "30.30Z"})

    verdicts = {c["name"]: c["qualification"] for c in body["candidates"]}
    assert verdicts["BONILLA CHRISTOPHE"]["code"] == "natural_person"
    # …et une société avec salariés, elle, est enfin RECOMMANDÉE : sans la
    # catégorie, 100 % des lignes sortaient « forme juridique inconnue ».
    assert verdicts["SOCIETE 002 SAS"]["verdict"] == "recommended"


def test_the_registry_nature_juridique_spelling_is_read_too(client: TestClient, wire) -> None:
    pappers, _, _ = wire
    row = _row(1)
    row.pop("legalCategory")
    pappers.rows = [{**row, "nature_juridique": "1000"}]

    body = _post(client, {"nafCode": "30.30Z"})

    assert body["candidates"][0]["qualification"]["code"] == "natural_person"


# ── #2490.4 — la source qui ne sait pas honorer la question ne passe pas devant ─


def test_a_list_of_naf_codes_sends_the_free_registry_first(client: TestClient, wire) -> None:
    pappers, gouv, _ = wire
    pappers.rows, gouv.rows = [_row(1)], [_row(2)]

    _post(client, {"nafCode": "30.30Z,29.10Z"})

    assert len(gouv.calls) == 1 and pappers.calls == []


def test_several_departments_send_the_free_registry_first(client: TestClient, wire) -> None:
    pappers, gouv, _ = wire
    pappers.rows, gouv.rows = [_row(1)], [_row(2)]

    _post(client, {"nafCode": "30.30Z", "department": "31", "departments": ["31", "33"]})

    assert len(gouv.calls) == 1 and pappers.calls == []


def test_a_single_code_in_a_single_department_keeps_pappers_first(client: TestClient, wire) -> None:
    """Témoin : le chemin sans critère problématique ne bouge pas."""
    pappers, gouv, _ = wire
    pappers.rows, gouv.rows = [_row(1)], [_row(2)]

    _post(client, {"nafCode": "30.30Z", "department": "31", "departments": ["31"]})

    assert len(pappers.calls) == 1 and gouv.calls == []


# ── #2489.2 — une requête par SECTION, et une page qui les mêle ─────────────


def test_codes_of_several_sections_are_queried_section_by_section(client: TestClient, wire) -> None:
    _, gouv, _ = wire

    _post(client, {"nafCode": "30.30Z,64.19Z,64.92Z,62.02A"})

    assert sorted(f.naf_code for f in gouv.calls) == ["30.30Z", "62.02A", "64.19Z,64.92Z"]


def test_codes_of_one_section_stay_one_query(client: TestClient, wire) -> None:
    _, gouv, _ = wire

    _post(client, {"nafCode": "30.30Z,29.10Z"})

    assert [f.naf_code for f in gouv.calls] == ["30.30Z,29.10Z"]


def test_beyond_six_sections_the_last_ones_share_a_query_and_nothing_is_dropped(client: TestClient, wire) -> None:
    _, gouv, _ = wire
    codes = ["30.30Z", "64.19Z", "62.02A", "86.10Z", "84.11Z", "47.11A", "49.10Z", "41.20A"]

    _post(client, {"nafCode": ",".join(codes)})

    assert len(gouv.calls) == 6
    assert sorted(code for f in gouv.calls for code in f.naf_code.split(",")) == sorted(codes)


def test_a_multi_section_page_takes_turns_between_sections(client: TestClient, wire) -> None:
    _, gouv, _ = wire
    banks = [
        _row(i, nafCode="64.19Z", headcountRange="10 000 salariés et plus", headcountTranche="53") for i in range(4)
    ]
    aero = [_row(10 + i, nafCode="30.30Z") for i in range(4)]

    async def _by_section(filters, limit, degraded=None):
        gouv.calls.append(filters)
        return [dict(r) for r in (banks if filters.naf_code.startswith("64") else aero)]

    with patch("app.routers.discover._fallback_search", _by_section):
        body = _post(client, {"nafCode": "64.19Z,30.30Z"})

    first_four = [c["nafCode"] for c in body["candidates"][:4]]
    assert sorted(first_four) == ["30.30Z", "30.30Z", "64.19Z", "64.19Z"], first_four


def test_a_single_sector_page_keeps_the_pure_ranking(client: TestClient, wire) -> None:
    """Témoin : sans plusieurs secteurs, l'ordre est celui du classement."""
    _, gouv, _ = wire
    big = [_row(i, headcountRange="10 000 salariés et plus", headcountTranche="53") for i in range(3)]
    gouv.rows = [*[_row(10 + i, headcountRange="20 à 49 salariés", headcountTranche="12") for i in range(3)], *big]

    body = _post(client, {"nafCode": "30.30Z,29.10Z"})

    assert [c["headcountTranche"] for c in body["candidates"][:3]] == ["53", "53", "53"]


# ── #2490.9 — le rappel de page 2 ───────────────────────────────────────────


def _full_page() -> list[dict]:
    return [_row(i) for i in range(LIST_PAGE_MAX)]


def test_a_zone_search_with_an_activity_reads_the_second_page(client: TestClient, wire) -> None:
    _, gouv, page = wire
    gouv.rows = _full_page()
    page.rows = [_row(100, name="AIRBUS OPERATIONS", headcountTranche="53", headcountRange="10 000 salariés et plus")]

    body = _post(client, {"nafCode": "30.30Z,29.10Z", "department": "31", "departments": ["31"]})

    assert page.pages == [2]
    assert body["candidates"][0]["name"] == "AIRBUS OPERATIONS"


@pytest.mark.parametrize(
    "filters",
    [
        {"nafCode": "30.30Z,29.10Z"},  # pas de zone : la page 1 ne contient pas de sièges lointains
        {"department": "31", "departments": ["31"]},  # une zone seule : réseaux nationaux, page 2 comprise
        # quatre sections avec zone : 4 + 4 appels dépasseraient le budget de 6
        {"nafCode": "30.30Z,64.19Z,62.02A,86.10Z", "department": "31", "departments": ["31"]},
    ],
)
def test_no_second_page_outside_its_case(client: TestClient, wire, filters: dict) -> None:
    _, gouv, page = wire
    gouv.rows = _full_page()

    _post(client, filters)

    assert page.pages == []


def test_no_second_page_when_the_first_is_not_full(client: TestClient, wire) -> None:
    _, gouv, page = wire
    gouv.rows = _full_page()[:-1]

    _post(client, {"nafCode": "30.30Z,29.10Z", "department": "31", "departments": ["31"]})

    assert page.pages == []


def test_a_failed_second_page_keeps_the_first(client: TestClient, wire, monkeypatch) -> None:
    _, gouv, _ = wire
    gouv.rows = _full_page()

    async def _boom(filters, limit, degraded=None, *, page=1):
        raise RuntimeError("registre injoignable")

    monkeypatch.setattr("app.routers.discover._fallback_search_page", _boom)
    body = _post(client, {"nafCode": "30.30Z,29.10Z", "department": "31", "departments": ["31"]})

    assert len(body["candidates"]) == 20


# ── #2490.3 — classer, couper, PUIS écrire l'angle ──────────────────────────


def test_the_page_is_cut_to_the_limit_after_ranking(client: TestClient, wire) -> None:
    _, gouv, _ = wire
    small = [_row(i, headcountRange="20 à 49 salariés", headcountTranche="12") for i in range(20)]
    big = _row(99, name="GRAND COMPTE", headcountRange="10 000 salariés et plus", headcountTranche="53")
    gouv.rows = [*small, big]  # le plus gros arrive DERNIER de la source

    body = _post(client, {"nafCode": "30.30Z,29.10Z"}, limit=5)

    assert len(body["candidates"]) == 5
    assert body["candidates"][0]["name"] == "GRAND COMPTE"


def test_the_model_only_writes_angles_for_the_rows_shown_and_never_for_an_excluded_one(
    client: TestClient, wire
) -> None:
    _, gouv, _ = wire
    gouv.rows = [*[_row(i) for i in range(3)], _row(50, name="DUPONT JEAN", legalCategory="1000")]
    seen: list[list[str]] = []

    def _spy(companies, query, internal_knowledge=""):
        seen.append([c["siren"] for c in companies])
        return "prompt"

    with patch("app.routers.discover.build_angle_user_prompt", side_effect=_spy):
        _post(client, {"nafCode": "30.30Z,29.10Z"}, limit=2)

    assert len(seen) == 1 and len(seen[0]) == 2
    assert "100000050" not in seen[0]


def test_angles_are_attached_to_the_rows_shown(client: TestClient, wire) -> None:
    _, gouv, _ = wire
    gouv.rows = [_row(1)]

    body = _post(
        client,
        {"nafCode": "30.30Z,29.10Z"},
        angles=[{"siren": "100000001", "angle": "Programme de cabine connectée", "suggestedRoles": []}],
    )

    assert body["candidates"][0]["angle"] == "Programme de cabine connectée"
