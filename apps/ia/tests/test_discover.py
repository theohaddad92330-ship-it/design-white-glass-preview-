from __future__ import annotations

from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient


def test_discover_returns_companies(client: TestClient) -> None:
    mock_companies = {
        "companies": [
            {
                "name": "SNCF",
                "sector": "Transport",
                "why": "Budget IT",
                "priorityScore": 8,
            }
        ]
    }
    with (
        patch(
            "app.routers.discover.brave_search",
            new_callable=AsyncMock,
            return_value=[],
        ),
        patch(
            "app.routers.discover.call_claude",
            new_callable=AsyncMock,
            return_value=(mock_companies, None),
        ),
    ):
        res = client.post(
            "/discover/search",
            json={"criteria": "banques Bordeaux data"},
        )
    assert res.status_code == 200
    assert res.json()["data"]["companies"][0]["name"] == "SNCF"


def test_discover_returns_502_on_claude_error(client: TestClient) -> None:
    with (
        patch(
            "app.routers.discover.brave_search",
            new_callable=AsyncMock,
            return_value=[],
        ),
        patch(
            "app.routers.discover.call_claude",
            new_callable=AsyncMock,
            side_effect=ValueError("fail"),
        ),
    ):
        res = client.post(
            "/discover/search",
            json={"criteria": "test"},
        )
    assert res.status_code == 502
