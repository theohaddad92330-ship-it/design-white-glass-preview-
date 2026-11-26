"""LUD.1 — les marchés publics des vues territoire/registre suivent le pack de l'espace."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock

import httpx
import pytest

from app.services.data_sources.decp import awards_for_siren, build_award_where, list_award_buyers
from app.services.data_sources.public_tenders import list_tender_buyers
from app.services.domain_market_filters import market_pack_for_profile

IND = {"offerDomain": "industrial_engineering"}


def _iso(days: int) -> str:
    return (datetime.now(UTC) - timedelta(days=days)).strftime("%Y-%m-%d")


def _client(payload: dict) -> AsyncMock:
    resp = httpx.Response(200, json=payload, request=httpx.Request("GET", "https://x"))
    c = AsyncMock(spec=httpx.AsyncClient)
    c.get = AsyncMock(return_value=resp)
    return c


def _award(cpv: str, objet: str) -> dict:
    return {
        "acheteur_nom": "VILLE DE LYON",
        "acheteur_id": "21690123400015",
        "objet": objet,
        "codecpv": cpv,
        "titulaire_id_1": "55208131766522",
        "lieuexecution_code": "69123",
        "datenotification": _iso(20),
    }


def test_market_pack_for_profile() -> None:
    # LUD.1 — le pack du profil qui porte un filtre ; rien sinon.
    assert market_pack_for_profile(IND) == "industrial_engineering"
    assert market_pack_for_profile({"offerDomains": ["esn_it", "industrial_engineering"]}) == "industrial_engineering"
    assert market_pack_for_profile({"offerDomain": "esn_it"}) is None
    assert market_pack_for_profile(None) is None
    assert market_pack_for_profile({}) is None


def test_award_where_it_is_byte_identical_and_pack_swaps_cpv() -> None:
    assert build_award_where("69", 90) == build_award_where("69", 90, pack=None)
    where = build_award_where("69", 90, pack="industrial_engineering")
    assert "startswith(codecpv,'71')" in where
    assert "startswith(codecpv,'72')" not in where
    assert "startswith(codecpv,'45')" not in where  # CPV 45 reste EXCLU


@pytest.mark.asyncio
async def test_award_buyers_cpv71_visible_for_industrial_not_for_it() -> None:
    payload = {"results": [_award("71300000", "Maîtrise d'œuvre ligne de production")]}
    ind = await list_award_buyers("69", 365, 10, client=_client(payload), pack="industrial_engineering")
    assert [r["siren"] for r in ind] == ["216901234"]
    it = await list_award_buyers("69", 365, 10, client=_client(payload))
    assert it == []


@pytest.mark.asyncio
async def test_tender_buyers_cpv71_visible_for_industrial_not_for_it() -> None:
    payload = {
        "results": [
            {
                "nomacheteur": "MAIRIE X",
                "objet": "Maîtrise d'œuvre",
                "code_cpv": "71300000",
                "dateparution": _iso(5),
            }
        ]
    }
    ind = await list_tender_buyers(None, 90, 10, client=_client(payload), pack="industrial_engineering")
    assert [r["name"] for r in ind] == ["MAIRIE X"]
    assert await list_tender_buyers(None, 90, 10, client=_client(payload)) == []


@pytest.mark.asyncio
async def test_awards_for_siren_follows_the_pack() -> None:
    payload = {"results": [_award("71300000", "Études techniques")]}
    c = _client(payload)
    ind = await awards_for_siren("216901234", client=c, pack="industrial_engineering")
    assert len(ind) == 1
    assert "startswith(codecpv,'71')" in c.get.call_args.kwargs["params"]["where"]
    c2 = _client(payload)
    assert await awards_for_siren("216901234", client=c2) == []
    assert "startswith(codecpv,'72')" in c2.get.call_args.kwargs["params"]["where"]


def test_discover_signals_route_passes_the_space_pack(client, monkeypatch) -> None:
    # LUD.1 — /discover/signals transmet le pack aux deux sources de marchés ; l'espace IT : None.
    from app.routers import discover_signals as mod

    seen: dict[str, object] = {}

    def _spy(key):
        async def _fn(*_a, **kw):
            seen[key] = kw.get("pack")
            return []

        return _fn

    monkeypatch.setattr(mod, "list_tender_buyers", _spy("tender"))
    monkeypatch.setattr(mod, "list_award_buyers", _spy("award"))
    for name in ("list_hiring_companies", "list_capital_increase_companies"):
        monkeypatch.setattr(mod, name, _spy(name))
    for profile, expected in ((IND, "industrial_engineering"), ({"offerDomain": "esn_it"}, None)):
        seen.clear()
        res = client.post(
            "/discover/signals",
            json={"department": "69", "sinceDays": 90, "limit": 5, "sources": ["tender", "award"], "profile_data": profile},
        )
        assert res.status_code == 200, res.text
        assert seen["tender"] == expected and seen["award"] == expected
