"""#4448 — IA-R/S/W/Z/V/Q/4 : le registre répond 302 (redirection) ou 429 ; ni l'un ni l'autre
ne sort en exception. Le 302 est SUIVI ; le 429 est une dégradation dite."""

from __future__ import annotations

import httpx
import pytest

from app.services.company_filters import CompanyDiscoveryFilters
from app.services.data_sources import _http_pool, recherche_entreprises


def test_le_client_partage_du_registre_suit_les_redirections() -> None:
    _http_pool._clients.pop("recherche_entreprises", None)
    try:
        client = recherche_entreprises._shared_http()
        assert client.follow_redirects is True
    finally:
        _http_pool._clients.pop("recherche_entreprises", None)


@pytest.mark.asyncio
async def test_302_suivi_rend_les_lignes() -> None:
    def handler(req: httpx.Request) -> httpx.Response:
        if req.url.path.endswith("/moved"):
            return httpx.Response(200, json={"results": []})
        return httpx.Response(302, headers={"location": str(req.url.copy_with(path="/moved"))})

    async with httpx.AsyncClient(transport=httpx.MockTransport(handler), follow_redirects=True) as client:
        resp = await client.get("https://example.test/search")
    assert resp.status_code == 200


@pytest.mark.asyncio
async def test_429_est_une_degradation_pas_une_exception() -> None:
    transport = httpx.MockTransport(lambda _r: httpx.Response(429, headers={"retry-after": "1"}))
    sink: list[dict] = []
    async with httpx.AsyncClient(transport=transport) as client:
        rows = await recherche_entreprises.list_companies(
            CompanyDiscoveryFilters(department="69", naf_code="62.01Z"), 5, degraded=sink, client=client
        )
    assert rows == []
    assert [d["reason"] for d in sink if d["source"] == "recherche-entreprises"] == ["rate_limited"]
