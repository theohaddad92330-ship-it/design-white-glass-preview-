"""M3 — la purge, et les trois choses qu'elle n'a pas le droit d'effacer."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest

from app.services import rag_service


def _iso(days_ago: int) -> str:
    return (datetime.now(timezone.utc) - timedelta(days=days_ago)).isoformat()


class _Table:
    def __init__(self, rows):
        self._rows = rows
        self.deleted: list[str] = []
        self._deleting = False

    def select(self, _cols):
        return self

    def eq(self, _col, _val):
        return self

    def neq(self, _col, _val):
        return self

    def lt(self, _col, _val):
        return self

    def limit(self, _n):
        return self

    def delete(self):
        self._deleting = True
        return self

    def in_(self, _col, ids):
        self.deleted.extend(ids)
        return self

    async def aexecute(self):
        if self._deleting:
            return type("R", (), {"data": []})()
        return type("R", (), {"data": self._rows})()


class _Supabase:
    def __init__(self, rows):
        self.tbl = _Table(rows)

    def table(self, _name):
        return self.tbl


@pytest.fixture
def store(monkeypatch):
    def _build(rows):
        sb = _Supabase(rows)
        monkeypatch.setattr(rag_service, "get_supabase", lambda: sb)
        return sb

    return _build


@pytest.mark.asyncio
async def test_it_erases_a_distilled_document_never_used_and_old(store):
    sb = store([{"id": "a", "used_count": 0, "origin": "distilled", "created_at": _iso(500)}])
    report = await rag_service.purge_unused_documents()
    assert report["purged"] == 1
    assert sb.tbl.deleted == ["a"]


@pytest.mark.asyncio
async def test_it_NEVER_erases_a_document_that_has_served_once(store):
    # La garde du §41. Il a prouvé sa valeur ; l'effacer parce qu'il n'a pas
    # reservi depuis un an détruirait la connaissance la plus rare.
    sb = store([{"id": "a", "used_count": 1, "origin": "distilled", "created_at": _iso(2000)}])
    report = await rag_service.purge_unused_documents()
    assert report["purged"] == 0
    assert sb.tbl.deleted == []


@pytest.mark.asyncio
async def test_it_NEVER_erases_a_document_deposited_by_a_human(store):
    # Personne ne peut le régénérer — il n'est sorti d'aucune analyse.
    sb = store([{"id": "a", "used_count": 0, "origin": "uploaded", "created_at": _iso(2000)}])
    report = await rag_service.purge_unused_documents()
    assert report["purged"] == 0
    assert sb.tbl.deleted == []


@pytest.mark.asyncio
async def test_it_NEVER_erases_a_document_in_the_durable_knowledge_base(store):
    # #2779 — `knowledge_base` a SA règle : jamais purgée, quels que soient
    # usage, origine ou âge — c'est le sens même de « durable ».
    sb = store(
        [{"id": "a", "used_count": 0, "origin": "distilled", "created_at": _iso(2000), "scope": "knowledge_base"}]
    )
    report = await rag_service.purge_unused_documents()
    assert report["purged"] == 0
    assert sb.tbl.deleted == []


@pytest.mark.asyncio
async def test_it_does_not_erase_on_an_unreadable_date(store):
    sb = store([{"id": "a", "used_count": 0, "origin": "distilled", "created_at": "pas une date"}])
    report = await rag_service.purge_unused_documents()
    assert report["purged"] == 0
    assert sb.tbl.deleted == []


@pytest.mark.asyncio
async def test_a_dry_run_erases_nothing_but_says_what_it_would(store):
    sb = store([{"id": "a", "used_count": 0, "origin": "distilled", "created_at": _iso(500)}])
    report = await rag_service.purge_unused_documents(dry_run=True)
    assert report["purged"] == 0
    assert report["ids"] == ["a"]
    assert sb.tbl.deleted == []


@pytest.mark.asyncio
async def test_it_reports_even_when_there_is_nothing_to_do(store):
    # Un silence ne doit pas se lire comme une panne du balayage.
    store([])
    report = await rag_service.purge_unused_documents()
    assert report == {"examined": 0, "purged": 0, "dry_run": False, "ids": []}
