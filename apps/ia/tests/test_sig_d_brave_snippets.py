"""SIG-D4 (11/10) — Brave `extra_snippets` sur la presse et la recherche persona.

Doc Brave relue le 11/10/2026 : `extra_snippets=true` ajoute jusqu'à 5 extraits
par résultat (web ET news). Ils nourrissent le texte DÉJÀ analysé (le champ
`description`) — aucun nouveau champ n'apparaît. `BRAVE_EXTRA_SNIPPETS=0` coupe.
"""

from __future__ import annotations

from unittest.mock import AsyncMock

import httpx
import pytest

from app.routers import phase2_contacts
from app.services import brave_snippets
from app.services.data_sources import brave_news


@pytest.fixture(autouse=True)
def _env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("BRAVE_API_KEY", "k")
    monkeypatch.delenv("BRAVE_EXTRA_SNIPPETS", raising=False)


def _resp(payload: object) -> httpx.Response:
    return httpx.Response(200, json=payload, request=httpx.Request("GET", "https://x"))


def test_merge_appends_extras_without_new_field() -> None:
    assert brave_snippets.merge_description("base", ["e1", " e2 ", ""]) == "base e1 e2"
    assert brave_snippets.merge_description("base", None) == "base"
    assert brave_snippets.merge_description("base", "not-a-list") == "base"


def test_switch_off(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("BRAVE_EXTRA_SNIPPETS", "0")
    assert brave_snippets.extra_snippets_params() == {}
    assert brave_snippets.merge_description("base", ["e1"]) == "base"


async def test_news_requests_and_merges_extra_snippets() -> None:
    client = AsyncMock(spec=httpx.AsyncClient)
    client.get = AsyncMock(
        return_value=_resp({"results": [{"title": "T", "url": "https://m/1", "description": "d", "extra_snippets": ["x1", "x2"]}]})
    )
    out = await brave_news.recent_news("Acme Extra", client=client)
    assert client.get.call_args.kwargs["params"]["extra_snippets"] == "true"
    assert out[0]["description"] == "d x1 x2"
    assert set(out[0]) == {"title", "url", "age", "description"}


async def test_news_without_switch_is_byte_identical(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("BRAVE_EXTRA_SNIPPETS", "false")
    client = AsyncMock(spec=httpx.AsyncClient)
    client.get = AsyncMock(return_value=_resp({"results": [{"title": "T", "url": "https://m/1", "description": "d"}]}))
    out = await brave_news.recent_news("Acme Off", client=client)
    assert "extra_snippets" not in client.get.call_args.kwargs["params"]
    assert out[0]["description"] == "d"


async def test_persona_search_requests_and_merges_extra_snippets() -> None:
    client = AsyncMock(spec=httpx.AsyncClient)
    client.get = AsyncMock(
        return_value=_resp({"web": {"results": [{"title": "T", "url": "https://l/in/x", "description": "d", "extra_snippets": ["x1"]}]}})
    )
    out = await phase2_contacts._persona_query(client, "ACME", "DSI")
    assert client.get.call_args.kwargs["params"]["extra_snippets"] == "true"
    assert out == [{"title": "T", "description": "d x1", "url": "https://l/in/x"}]
