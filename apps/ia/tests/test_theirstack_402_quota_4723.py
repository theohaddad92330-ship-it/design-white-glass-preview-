"""#4723.3 — un 402 TheirStack (crédits épuisés) se journalise en ``quota_exceeded``, jamais confondu avec un 422
(requête refusée : ``upstream_error``). L'écran ne nomme jamais le fournisseur (famille ``job_aggregators``)."""

import asyncio
from unittest.mock import MagicMock

import pytest

from app.services import source_health
from app.services.data_sources import job_aggregators as agg


def _resp(status: int) -> MagicMock:
    resp = MagicMock()
    resp.is_success = False
    resp.status_code = status
    resp.text = '{"error":{"code":"E-013"}}' if status == 422 else '{"error":"insufficient credits"}'
    resp.headers = {}
    return resp


def _degradations(monkeypatch, status: int) -> list[dict[str, str]]:
    monkeypatch.setenv("THEIRSTACK_API_KEY", "k")
    cid = f"test-4723-3-{status}"
    monkeypatch.setattr(agg, "get_correlation_id", lambda: cid)

    class _Http:
        async def post(self, *a, **k):
            return _resp(status)

        async def aclose(self) -> None:
            return None

    monkeypatch.setattr(agg.httpx, "AsyncClient", lambda **k: _Http())
    assert asyncio.run(agg.theirstack_skill_offers("java")) is None
    return source_health.get_public_degradations(cid)


@pytest.mark.parametrize(("status", "code"), [(402, "quota_exceeded"), (422, "upstream_error")])
def test_402_et_422_ont_des_motifs_distincts(monkeypatch, status, code):
    entries = _degradations(monkeypatch, status)
    assert [e.get("code") for e in entries] == [code]


def test_le_402_ne_nomme_pas_le_fournisseur(monkeypatch):
    entries = _degradations(monkeypatch, 402)
    assert all("theirstack" not in str(e).lower() for e in entries)
