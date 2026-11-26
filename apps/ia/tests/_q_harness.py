"""Harnais du lot Q : `_rank_and_angle` sans réseau (liste de registre figée → réponse du chemin registry)."""

from __future__ import annotations

import time
from typing import Any
from unittest.mock import AsyncMock

import pytest

from app.routers import discover as router


def company(siren: str, name: str, naf: str | None = "47.64Z", **kw: Any) -> dict[str, Any]:
    return {
        "siren": siren,
        "name": name,
        "nafCode": naf,
        "city": "LILLE",
        "department": "59",
        "headcountRange": "100 à 199 salariés",
        "headcountTranche": "21",
        **kw,
    }


async def rank(monkeypatch: pytest.MonkeyPatch, companies: list[dict[str, Any]], *, limit: int = 50, **req_kw: Any):
    monkeypatch.setattr(router, "_attach_group_links", AsyncMock(return_value=None))
    monkeypatch.setattr(router, "_start_signal_tasks", lambda *_a, **_k: {})
    monkeypatch.setattr(router, "_finish_signal_tasks", AsyncMock(return_value=None))
    monkeypatch.setattr(router, "_angles_by_siren", AsyncMock(return_value={}))
    req = router.DiscoverRegistryRequest(filters=router.DiscoverFilters(keywords=["Java"]), limit=limit, **req_kw)
    return await router._rank_and_angle(
        req, req.filters, limit, {}, {}, {}, [], [dict(c) for c in companies], time.monotonic() + 30
    )


async def rank_named(
    monkeypatch: pytest.MonkeyPatch, companies: list[dict[str, Any]], name: str, *, limit: int = 50, profile=None
):
    monkeypatch.setattr(router, "_attach_group_links", AsyncMock(return_value=None))
    monkeypatch.setattr(router, "_start_signal_tasks", lambda *_a, **_k: {})
    monkeypatch.setattr(router, "_finish_signal_tasks", AsyncMock(return_value=None))
    monkeypatch.setattr(router, "_angles_by_siren", AsyncMock(return_value={}))
    filters = router.DiscoverFilters(freetext=name)
    req = router.DiscoverRegistryRequest(filters=filters, limit=limit, profile_data=profile or {})
    return await router._rank_and_angle(
        req, filters, limit, {}, {}, {}, [], [dict(c) for c in companies], time.monotonic() + 30
    )
