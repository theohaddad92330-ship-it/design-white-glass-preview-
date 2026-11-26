"""#3921.10 — les marchés publics GAGNÉS par une ESN (rôle TITULAIRE), lus sur le millésime vivant de la
commande publique. Requête vérifiée en direct le 16/10/2026 (titulaire_id_1..3, codecpv, datenotification).

Ce que ces tests tiennent :
- seul le TITULAIRE compte (le filtre porte sur titulaire_id_*, jamais sur acheteur_id) ;
- chaque marché est daté par la source, d'identité stable (``id`` DECP), IT seulement ;
- l'acheteur n'entre PAS dans la colonne (il reste un signal côté fiche compte) ;
- une panne LÈVE (jamais un vide) ; la route la nomme ``failed``.
"""

from __future__ import annotations

from unittest.mock import AsyncMock

import httpx
import pytest

from app.routers import public_registry
from app.services.data_sources import decp

SIREN = "326820065"


def _resp(body: object, status: int = 200) -> httpx.Response:
    return httpx.Response(status, json=body, request=httpx.Request("GET", "https://x"))


def _record(**over: object) -> dict:
    base = {
        "id": "2026S24887",
        "objet": "Maintenance logiciel ACTIVE 3D",
        "codecpv": "72267000-4",
        "titulaire_id_1": SIREN + "00083",
        "titulaire_id_2": "CDL",
        "titulaire_id_3": "CDL",
        "acheteur_id": "26440013600471",
        "dureemois": 84,
        "datenotification": "2026-10-01",
    }
    base.update(over)
    return base


def _client(payload: object, status: int = 200) -> AsyncMock:
    c = AsyncMock(spec=httpx.AsyncClient)
    c.get = AsyncMock(return_value=_resp(payload, status))
    return c


@pytest.mark.asyncio
async def test_filters_on_titulaire_never_on_acheteur_and_returns_dated_stable_rows() -> None:
    c = _client({"results": [_record(), _record(id="X2", datenotification="2026-03-02", dureemois=None)]})
    out = await decp.awards_won_by_siren(SIREN, client=c)
    where = c.get.await_args.kwargs["params"]["where"]
    assert "titulaire_id_1" in where and "titulaire_id_3" in where and SIREN in where
    assert "acheteur_id" not in where
    assert [(a["ref"], a["date"]) for a in out] == [("decp:2026S24887", "2026-10-01"), ("decp:X2", "2026-03-02")]
    assert out[0]["endsOn"] == "2033-10-01" and out[1]["endsOn"] is None
    assert "buyer" not in out[0] and "acheteur_id" not in repr(out[0])


@pytest.mark.asyncio
async def test_rows_without_readable_date_or_id_are_dropped_not_guessed() -> None:
    c = _client({"results": [_record(datenotification="None"), _record(id=None, objet=None), _record(id="OK")]})
    out = await decp.awards_won_by_siren(SIREN, client=c)
    assert [a["ref"] for a in out] == ["decp:OK"]


@pytest.mark.asyncio
async def test_a_row_whose_titulaire_is_not_this_siren_is_dropped() -> None:
    c = _client({"results": [_record(titulaire_id_1="999999999" + "00011")]})
    assert await decp.awards_won_by_siren(SIREN, client=c) == []


@pytest.mark.asyncio
async def test_outage_raises_instead_of_returning_an_empty_reading() -> None:
    c = _client({}, status=500)
    with pytest.raises(httpx.HTTPStatusError):
        await decp.awards_won_by_siren(SIREN, client=c)


@pytest.mark.asyncio
async def test_route_names_the_failure(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(public_registry, "awards_won_by_siren", AsyncMock(side_effect=RuntimeError("boom")))
    out = await public_registry.awards_won(public_registry.AwardsWonRequest(siren=SIREN))
    assert out == {"failed": True, "awards": []}


@pytest.mark.asyncio
async def test_route_returns_the_awards(monkeypatch: pytest.MonkeyPatch) -> None:
    rows = [{"ref": "decp:A", "date": "2026-10-01", "title": "T", "durationMonths": 12, "endsOn": "2027-10-01"}]
    monkeypatch.setattr(public_registry, "awards_won_by_siren", AsyncMock(return_value=rows))
    out = await public_registry.awards_won(public_registry.AwardsWonRequest(siren=SIREN))
    assert out == {"failed": False, "awards": rows}
