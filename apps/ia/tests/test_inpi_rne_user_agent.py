"""#3921 — l'API RNE de l'INPI répond 403 sans User-Agent (vérifié le 16/10/2026
par appel réel) : sans l'en-tête, les bénéficiaires effectifs n'étaient jamais
collectés, en silence."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock

import httpx
import pytest

from app.services.data_sources.inpi_rne import beneficial_owners


def _resp(body: dict, headers_ok: bool, status: int | None = None) -> MagicMock:
    r = MagicMock(spec=httpx.Response)
    r.status_code = status or (200 if headers_ok else 403)
    r.json.return_value = body
    r.headers = {}
    if not headers_ok:
        r.raise_for_status.side_effect = httpx.HTTPStatusError("403", request=MagicMock(), response=r)
    else:
        r.raise_for_status.return_value = None
    return r


@pytest.mark.asyncio
async def test_inpi_login_and_company_send_user_agent_and_accept(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("INPI_USERNAME", "u")
    monkeypatch.setenv("INPI_PASSWORD", "p")
    seen: dict[str, dict] = {}

    def _ok(h: dict | None) -> bool:
        return bool(h and h.get("User-Agent") and h.get("Accept") == "application/json")

    async def _post(url: str, **kw: object) -> MagicMock:
        seen["post"] = dict(kw.get("headers") or {})  # type: ignore[arg-type]
        return _resp({"token": "tok"}, _ok(kw.get("headers")))  # type: ignore[arg-type]

    async def _get(url: str, **kw: object) -> MagicMock:
        seen["get"] = dict(kw.get("headers") or {})  # type: ignore[arg-type]
        return _resp({"siren": "775577018"}, _ok(kw.get("headers")))  # type: ignore[arg-type]

    c = AsyncMock(spec=httpx.AsyncClient)
    c.post = AsyncMock(side_effect=_post)
    c.get = AsyncMock(side_effect=_get)

    await beneficial_owners("775577018", client=c)

    assert seen["post"].get("User-Agent") and seen["post"].get("Accept") == "application/json"
    assert seen["get"].get("User-Agent") and seen["get"].get("Accept") == "application/json"
    assert seen["get"].get("Authorization") == "Bearer tok"
