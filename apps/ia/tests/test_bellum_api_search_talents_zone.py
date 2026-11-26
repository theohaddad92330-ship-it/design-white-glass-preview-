"""#3222 — `zone`/`radius_km` (tiroir « Ville et rayon ») dans le payload de
`bellum_api.search_talents`.

Le rayon n'a pas de centre sans ville : plutôt que de laisser le pont NestJS
seul décider de l'ignorer, `search_talents` ne le relaie même pas quand
`zone` est absent — un critère qui ne compte jamais ne doit pas non plus
apparaître comme un critère envoyé.
"""

from __future__ import annotations

from typing import Any

import pytest

from app.services import bellum_api


async def test_zone_and_radius_are_sent_together(monkeypatch: pytest.MonkeyPatch) -> None:
    captured: dict[str, Any] = {}

    async def fake_post(path: str, payload: dict[str, Any], **_kwargs: object):
        captured["path"] = path
        captured["payload"] = payload
        return {"items": [], "total": 0}

    monkeypatch.setattr(bellum_api, "_post", fake_post)

    await bellum_api.search_talents("user-1", query="Java", zone="Lyon", radius_km=30)

    assert captured["path"] == "/internal/copilot/talents/search"
    assert captured["payload"]["zone"] == "Lyon"
    assert captured["payload"]["radiusKm"] == 30


async def test_radius_without_zone_is_never_sent(monkeypatch: pytest.MonkeyPatch) -> None:
    captured: dict[str, Any] = {}

    async def fake_post(path: str, payload: dict[str, Any], **_kwargs: object):
        captured["payload"] = payload
        return {"items": [], "total": 0}

    monkeypatch.setattr(bellum_api, "_post", fake_post)

    await bellum_api.search_talents("user-1", radius_km=30)

    assert "zone" not in captured["payload"]
    assert "radiusKm" not in captured["payload"]


async def test_zone_without_radius_is_sent_alone(monkeypatch: pytest.MonkeyPatch) -> None:
    captured: dict[str, Any] = {}

    async def fake_post(path: str, payload: dict[str, Any], **_kwargs: object):
        captured["payload"] = payload
        return {"items": [], "total": 0}

    monkeypatch.setattr(bellum_api, "_post", fake_post)

    await bellum_api.search_talents("user-1", zone="Lyon")

    assert captured["payload"]["zone"] == "Lyon"
    assert "radiusKm" not in captured["payload"]
