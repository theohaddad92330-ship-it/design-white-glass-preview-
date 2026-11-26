"""#4305 — « budget d'appels par recherche borné et MESURÉ » : le nombre d'appels registre d'une
recherche est journalisé (un compteur, jamais les contenus)."""

from __future__ import annotations

import logging
import re
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from app.services.data_sources.recherche_entreprises import LIST_PAGE_MAX


def _row(index: int) -> dict:
    return {
        "name": f"SOCIETE {index:04d} SAS",
        "siren": f"{100000000 + index}",
        "nafCode": "30.30Z",
        "sector": "Construction aéronautique et spatiale",
        "city": "TOULOUSE",
        "department": "31",
        "headcountRange": "50 à 99 salariés",
        "headcountTranche": "21",
        "legalCategory": "5710",
    }


@pytest.fixture
def registry(monkeypatch):
    rows = [_row(i) for i in range(200)]

    def page_of(page: int) -> list[dict]:
        start = (page - 1) * LIST_PAGE_MAX
        return [dict(row) for row in rows[start : start + LIST_PAGE_MAX]]

    async def first(filters, limit, degraded=None):
        return page_of(1)

    async def page(filters, limit, degraded=None, *, page: int = 1):
        return page_of(page)

    monkeypatch.setattr("app.routers.discover._registry_search", AsyncMock(return_value=[]))
    monkeypatch.setattr("app.routers.discover._fallback_search", first)
    monkeypatch.setattr("app.routers.discover._fallback_search_page", page)


def _counter_lines(caplog: pytest.LogCaptureFixture) -> list[str]:
    return [r.getMessage() for r in caplog.records if "registry_calls=" in r.getMessage()]


def _post(client: TestClient, limit: int) -> None:
    with patch("app.routers.discover.call_claude", new_callable=AsyncMock, return_value=({"angles": []}, None)):
        response = client.post("/discover/registry", json={"filters": {"nafCode": "30.30Z,29.10Z"}, "limit": limit})
    assert response.status_code == 200, response.text


def test_a_first_batch_logs_one_registry_call(client: TestClient, registry, caplog) -> None:
    with caplog.at_level(logging.INFO, logger="app.routers.discover"):
        _post(client, 20)
    assert [line.split(" duration_ms=")[0] for line in _counter_lines(caplog)] == ["discover registry_calls=1"]


def test_each_extra_page_is_counted(client: TestClient, registry, caplog) -> None:
    with caplog.at_level(logging.INFO, logger="app.routers.discover"):
        _post(client, 100)
    # page 1 + pages 2, 3, 4
    assert [line.split(" duration_ms=")[0] for line in _counter_lines(caplog)] == ["discover registry_calls=4"]


def test_the_search_log_carries_duration_and_candidate_count(client: TestClient, registry, caplog) -> None:
    # #4363.1 — la durée d'une recherche se journalise (ms) avec le nombre de candidats : deux nombres,
    # jamais un critère, un nom d'entreprise ni un fournisseur.
    with caplog.at_level(logging.INFO, logger="app.routers.discover"):
        _post(client, 20)
    (line,) = _counter_lines(caplog)
    # #4791.5 — la ligne porte aussi les candidats par origine.
    match = re.fullmatch(
        r"discover registry_calls=\d+ duration_ms=(\d+) candidates=(\d+)"
        r" registry=\d+ offers=\d+ common_base=\d+( common_base_reason=(no_rows|filtered))?",
        line,
    )
    assert match is not None, line
    assert int(match.group(2)) > 0


def test_the_search_logs_one_duration_per_step(client: TestClient, registry, caplog) -> None:
    # #4363.1 — la durée par ÉTAPE (collecte, élargissement, classement) : des noms d'étape et des
    # millisecondes, jamais un critère, un nom d'entreprise ni un fournisseur.
    with caplog.at_level(logging.INFO, logger="app.routers.discover"):
        _post(client, 20)
    lines = [r.getMessage() for r in caplog.records if r.getMessage().startswith("discover steps ")]
    assert len(lines) == 1, lines
    assert re.fullmatch(r"discover steps( [a-z_]+_ms=\d+)+", lines[0]), lines[0]
    assert "collect_ms=" in lines[0]
    assert "rank_ms=" in lines[0]


def test_no_step_line_when_nothing_was_timed() -> None:
    from app.routers.discover import _format_step_timings

    assert _format_step_timings({}) is None
    assert _format_step_timings({"collect": 12.4, "rank": 3.6}) == "discover steps collect_ms=12 rank_ms=4"


def test_common_base_zero_says_why_in_the_log(client: TestClient, registry, caplog) -> None:
    # Lot R — `common_base=0` seul ne disait pas POURQUOI : rien reçu de l'API (no_rows), ou reçu puis écarté (filtered).
    def post(extra: dict) -> str:
        caplog.clear()
        with caplog.at_level(logging.INFO, logger="app.routers.discover"), patch(
            "app.routers.discover.call_claude", new_callable=AsyncMock, return_value=({"angles": []}, None)
        ):
            response = client.post(
                "/discover/registry", json={"filters": {"nafCode": "30.30Z,29.10Z"}, "limit": 20, **extra}
            )
        assert response.status_code == 200, response.text
        return _counter_lines(caplog)[-1]

    assert "common_base=0 common_base_reason=no_rows" in post({})
    from app.routers.discover import _common_base_reason

    assert _common_base_reason(10, 3) == ""
    filtered = post({"commonBaseCandidates": [{"siren": "abc", "name": "SANS SIREN"}]})
    assert "common_base=0 common_base_reason=filtered" in filtered
