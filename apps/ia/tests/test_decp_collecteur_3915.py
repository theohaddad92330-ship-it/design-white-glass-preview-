"""#3915.decp — le collecteur DECP en continu (décision Louis 16/10/2026).

Ce que ces tests tiennent :
- un marché se rattache à un compte par SIREN, comme ACHETEUR ou comme TITULAIRE,
  jamais par le nom ni par un identifiant qui n'est pas un SIRET ;
- un marché exécuté hors de France n'est jamais rendu ;
- une panne de la source se dit avec une raison NON vide (un timeout httpx a un
  ``str()`` vide) ; l'attente de NOTRE limiteur n'est pas une panne (``deferred``) ;
- l'identité d'un marché ne dépend pas de la résolution des noms (sinon un nom
  résolu un jour et pas le lendemain écrirait deux fois le même marché).
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock

import httpx
import pytest

from app.routers import public_registry
from app.services.data_sources import decp
from app.services.data_sources.signal_errors import SignalSourceUnavailable
from app.services.distributed_rate_limiter import RateLimitTimeout

SIREN = "428677124"
RECENT = (datetime.now(UTC) - timedelta(days=40)).strftime("%Y-%m-%d")


def _row(**over: object) -> dict:
    base = {
        "id": "1300216026",
        "objet": "Prestations intellectuelles informatique - Innovation et expertise DATA-IA",
        "codecpv": "72000000-5",
        "acheteur_id": "12000601000074",
        "titulaire_id_1": f"{SIREN}00433",
        "titulaire_typeidentifiant_1": "SIRET",
        "datenotification": RECENT,
        "dureemois": 48,
        "montant": 22500000.0,
        "lieuexecution_code": "44",
        "lieuexecution_typecode": "Code département",
    }
    base.update(over)
    return base


class _Client:
    def __init__(self, response: httpx.Response | Exception) -> None:
        self.response = response
        self.params: dict | None = None

    async def get(self, _url: str, params: dict | None = None) -> httpx.Response:
        self.params = params
        if isinstance(self.response, Exception):
            raise self.response
        return self.response


def _ok(rows: list[dict]) -> _Client:
    return _Client(httpx.Response(200, json={"results": rows}, request=httpx.Request("GET", "https://x")))


@pytest.fixture(autouse=True)
def _no_name_lookup(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(decp, "names_by_siren", AsyncMock(return_value={"120006010": "MINISTERE DE L'EUROPE"}))


@pytest.mark.asyncio
async def test_titulaire_by_siret_is_attributed_with_the_buyer_named() -> None:
    client = _ok([_row()])
    rows = await decp.awards_for_siren(SIREN, client=client)  # type: ignore[arg-type]
    assert len(rows) == 1
    assert rows[0]["role"] == "titulaire"
    assert rows[0]["buyer"] == "MINISTERE DE L'EUROPE"
    assert rows[0]["notifiedDate"] == RECENT
    # La requête porte le SIREN sur l'acheteur ET sur chaque titulaire.
    where = (client.params or {}).get("where", "")
    assert f"startswith(acheteur_id,'{SIREN}')" in where
    assert f"startswith(titulaire_id_1,'{SIREN}')" in where


@pytest.mark.asyncio
async def test_buyer_by_siret_is_attributed() -> None:
    rows = await decp.awards_for_siren(
        "120006010",
        client=_ok([_row()]),  # type: ignore[arg-type]
    )
    assert [r["role"] for r in rows] == ["buyer"]


@pytest.mark.asyncio
async def test_homonym_siren_never_attributed() -> None:
    # NON : un titulaire identifié par TVA dont les chiffres commencent par le SIREN, un
    # identifiant HORS-UE qui le prolonge, un SIRET voisin — aucun n'est ce compte.
    rows = [
        _row(titulaire_id_1=f"FR40{SIREN}", titulaire_typeidentifiant_1="TVA", acheteur_id="21440101000019"),
        _row(titulaire_id_1=f"{SIREN}99999", titulaire_typeidentifiant_1="HORS-UE", acheteur_id="21440101000019"),
        _row(titulaire_id_1="42867712500433", acheteur_id="21440101000019"),
    ]
    assert await decp.awards_for_siren(SIREN, client=_ok(rows)) == []  # type: ignore[arg-type]


@pytest.mark.asyncio
async def test_award_executed_outside_france_never_returned() -> None:
    rows = [
        _row(lieuexecution_code="BE", lieuexecution_typecode="Code pays"),
        _row(id="2", objet="TMA logiciel", lieuexecution_code="FR", lieuexecution_typecode="Code pays"),
    ]
    got = await decp.awards_for_siren(SIREN, client=_ok(rows))  # type: ignore[arg-type]
    assert [r["title"] for r in got] == ["TMA logiciel"]


@pytest.mark.asyncio
async def test_old_or_undated_award_dropped() -> None:
    old = (datetime.now(UTC) - timedelta(days=900)).strftime("%Y-%m-%d")
    rows = [_row(datenotification=old), _row(datenotification=None)]
    assert await decp.awards_for_siren(SIREN, client=_ok(rows)) == []  # type: ignore[arg-type]


@pytest.mark.asyncio
async def test_timeout_raises_with_a_non_empty_reason() -> None:
    with pytest.raises(SignalSourceUnavailable) as caught:
        await decp.awards_for_siren(SIREN, client=_Client(httpx.ReadTimeout("")))  # type: ignore[arg-type]
    assert caught.value.reason.strip() != ""


def test_describe_never_returns_an_empty_message() -> None:
    assert decp.describe_failure(httpx.ReadTimeout("")).strip() != ""
    assert "ReadTimeout" in decp.describe_failure(httpx.ReadTimeout(""))
    assert decp.describe_failure(RuntimeError("boom")) == "boom"


@pytest.mark.asyncio
async def test_awards_route_reads_by_siren_and_never_by_name(monkeypatch: pytest.MonkeyPatch) -> None:
    by_siren = AsyncMock(
        return_value=[
            {"title": "TMA", "notifiedDate": RECENT, "role": "titulaire", "buyer": "Mairie X", "winner": None},
            {"title": "Sans date", "notifiedDate": None, "role": "buyer", "buyer": None, "winner": "Acme"},
        ]
    )
    by_name = AsyncMock(return_value=[])
    monkeypatch.setattr(public_registry, "awards_for_siren", by_siren)
    monkeypatch.setattr(public_registry, "awarded_it_contracts", by_name, raising=False)
    first = await public_registry.awards_snapshot(public_registry.AwardsRequest(siren=SIREN, name="Thales"))
    second = await public_registry.awards_snapshot(public_registry.AwardsRequest(siren=SIREN))
    by_name.assert_not_called()
    assert first["failed"] is False and first.get("deferred") is not True
    assert [(a["date"], a["role"], a["buyer"]) for a in first["awards"]] == [(RECENT, "titulaire", "Mairie X")]
    assert first["awards"][0]["ref"] == second["awards"][0]["ref"]


@pytest.mark.asyncio
async def test_award_ref_does_not_depend_on_resolved_names(monkeypatch: pytest.MonkeyPatch) -> None:
    item = {"title": "TMA", "notifiedDate": RECENT, "role": "buyer", "winner": "Acme SA"}
    monkeypatch.setattr(public_registry, "awards_for_siren", AsyncMock(return_value=[item]))
    named = await public_registry.awards_snapshot(public_registry.AwardsRequest(siren=SIREN))
    monkeypatch.setattr(public_registry, "awards_for_siren", AsyncMock(return_value=[{**item, "winner": None}]))
    unnamed = await public_registry.awards_snapshot(public_registry.AwardsRequest(siren=SIREN))
    assert named["awards"][0]["ref"] == unnamed["awards"][0]["ref"]


@pytest.mark.asyncio
async def test_awards_route_says_failed_with_its_reason(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(
        public_registry, "awards_for_siren", AsyncMock(side_effect=SignalSourceUnavailable("DECP", "network_error"))
    )
    out = await public_registry.awards_snapshot(public_registry.AwardsRequest(siren=SIREN))
    assert out == {"failed": True, "deferred": False, "reason": "network_error", "awards": []}


@pytest.mark.asyncio
async def test_limiter_wait_is_deferred_not_failed(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(public_registry, "awards_for_siren", AsyncMock(side_effect=RateLimitTimeout("decp", 30.0)))
    out = await public_registry.awards_snapshot(public_registry.AwardsRequest(siren=SIREN))
    assert out["failed"] is False and out["deferred"] is True and out["awards"] == []
