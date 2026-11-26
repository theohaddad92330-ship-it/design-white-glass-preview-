"""Recherche et rattrapage d'embeddings sur le corpus ORION V12 partagé
(`dataforge_rag_chunks`) — distinct de `rag_documents`.

Trois propriétés verrouillées, dans l'ordre de l'avertissement 1 de la tâche :
zéro appel réseau sans clé, un compte demandé ne fait jamais tomber les
chunks globaux hors de la requête envoyée à la base (c'est
`match_dataforge_rag_chunks` qui les protège côté SQL — vérifié par la garde
TypeScript ; ici on vérifie que le PARAMÈTRE part bien tel quel), et le
rattrapage d'embeddings suit le même contrat reprenable que `rag_service`.
"""

from __future__ import annotations

import pytest

from app.services import dataforge_rag_chunks
from app.services.dataforge_rag_chunks import (
    backfill_dataforge_rag_chunk_embeddings,
    search_dataforge_rag_chunks,
)


class _FakeRpc:
    def __init__(self, recorder: dict, rows: list[dict]):
        self._recorder = recorder
        self._rows = rows

    async def aexecute(self):
        return type("R", (), {"data": self._rows, "error": None})()


class _FakeSupabase:
    def __init__(self, rows: list[dict] | None = None):
        self.rpc_calls: list[tuple[str, dict]] = []
        self._rows = rows or []

    def rpc(self, name: str, params: dict):
        self.rpc_calls.append((name, params))
        return _FakeRpc(self.__dict__, self._rows)


@pytest.mark.asyncio
async def test_sans_cle_zero_appel_reseau(monkeypatch):
    monkeypatch.delenv("EMBEDDING_API_KEY", raising=False)
    fake = _FakeSupabase()
    monkeypatch.setattr(dataforge_rag_chunks, "get_supabase", lambda: fake)

    results = await search_dataforge_rag_chunks("pénétrabilité Jules")

    assert results == []
    assert fake.rpc_calls == []


@pytest.mark.asyncio
async def test_une_requete_vide_ne_part_jamais(monkeypatch):
    monkeypatch.setenv("EMBEDDING_API_KEY", "sk-test")
    fake = _FakeSupabase()
    monkeypatch.setattr(dataforge_rag_chunks, "get_supabase", lambda: fake)

    results = await search_dataforge_rag_chunks("   ")

    assert results == []
    assert fake.rpc_calls == []


@pytest.mark.asyncio
async def test_le_filtre_compte_part_tel_quel_vers_le_rpc_qui_protege_les_garde_fous(monkeypatch):
    monkeypatch.setenv("EMBEDDING_API_KEY", "sk-test")
    fake = _FakeSupabase(rows=[{"chunk_id": "CK-1", "type_chunk": "IDENTITE_COMPTE"}])
    monkeypatch.setattr(dataforge_rag_chunks, "get_supabase", lambda: fake)

    async def _embed(_text):
        return [0.1, 0.2]

    monkeypatch.setattr(dataforge_rag_chunks, "_get_embedding", _embed)

    results = await search_dataforge_rag_chunks("Enedis achats", account_id="DF-0042", top_k=3)

    assert results == [{"chunk_id": "CK-1", "type_chunk": "IDENTITE_COMPTE"}]
    assert len(fake.rpc_calls) == 1
    name, params = fake.rpc_calls[0]
    assert name == "match_dataforge_rag_chunks"
    assert params["filter_account_id"] == "DF-0042"
    assert params["match_count"] == 3
    assert params["query_embedding"] == [0.1, 0.2]


@pytest.mark.asyncio
async def test_une_recherche_generale_sans_compte_passe_filter_account_id_none(monkeypatch):
    monkeypatch.setenv("EMBEDDING_API_KEY", "sk-test")
    fake = _FakeSupabase(rows=[])
    monkeypatch.setattr(dataforge_rag_chunks, "get_supabase", lambda: fake)
    async def _embed(_text):
        return [0.0]

    monkeypatch.setattr(dataforge_rag_chunks, "_get_embedding", _embed)

    await search_dataforge_rag_chunks("corrections non propagées")

    _, params = fake.rpc_calls[0]
    assert params["filter_account_id"] is None


@pytest.mark.asyncio
async def test_une_panne_du_store_rend_une_liste_vide_jamais_une_exception(monkeypatch):
    monkeypatch.setenv("EMBEDDING_API_KEY", "sk-test")

    class _BrokenRpc:
        async def aexecute(self):
            raise RuntimeError("store indisponible")

    class _BrokenSupabase:
        def rpc(self, _name, _params):
            return _BrokenRpc()

    monkeypatch.setattr(dataforge_rag_chunks, "get_supabase", lambda: _BrokenSupabase())
    async def _embed(_text):
        return [0.0]

    monkeypatch.setattr(dataforge_rag_chunks, "_get_embedding", _embed)

    results = await search_dataforge_rag_chunks("test")

    assert results == []


@pytest.mark.asyncio
async def test_un_delai_depasse_du_rpc_57014_rend_un_bloc_vide_dit_comme_degrade(monkeypatch):
    """R10C-FIX — `57014 statement timeout` (500 PostgREST) : bloc vide, dégradation NOMMÉE, jamais d'exception."""
    monkeypatch.setenv("EMBEDDING_API_KEY", "sk-test")

    class _TimeoutRpc:
        async def aexecute(self):
            raise RuntimeError(
                'Supabase POST rpc/match_dataforge_rag_chunks failed: 500 '
                '{"code":"57014","message":"canceling statement due to statement timeout"}'
            )

    class _TimeoutSupabase:
        def rpc(self, _name, _params):
            return _TimeoutRpc()

    async def _embed(_text):
        return [0.0]

    recorded: list[dict] = []
    monkeypatch.setattr(dataforge_rag_chunks, "get_supabase", lambda: _TimeoutSupabase())
    monkeypatch.setattr(dataforge_rag_chunks, "_get_embedding", _embed)
    monkeypatch.setattr(
        dataforge_rag_chunks,
        "record_degradation",
        lambda cid, **kw: recorded.append(kw),
    )

    assert await search_dataforge_rag_chunks("test") == []
    assert len(recorded) == 1
    assert recorded[0]["source"] == "dataforge_rag"
    assert "57014" in recorded[0]["reason"]
    assert recorded[0]["code"] == "upstream_error"


class _FakeChunkTable:
    """Table Supabase en double pour `dataforge_rag_chunks`, même forme que
    `_FakeTable` de `test_rag_backfill.py`."""

    def __init__(self, store: dict):
        self._store = store
        self._limit = None
        self._update: dict | None = None
        self._eq_id: str | None = None
        self._null_columns: list[str] = []
        self._count = None

    def select(self, _cols, count=None):
        self._count = count
        return self

    def is_(self, column, value):
        assert column in ("embedding", "archived_at") and value == "null"
        self._null_columns.append(column)
        return self

    def limit(self, n):
        self._limit = n
        return self

    def update(self, patch):
        self._update = patch
        return self

    def eq(self, _column, value):
        self._eq_id = value
        return self

    async def aexecute(self):
        if self._update is not None:
            self._store[self._eq_id]["embedding"] = self._update["embedding"]
            return type("R", (), {"data": [], "error": None})()
        rows = [
            dict(r)
            for key, r in self._store.items()
            if key != "__batch_calls" and all(r.get(column) is None for column in self._null_columns)
        ]
        return type("R", (), {"data": rows[: self._limit], "error": None, "count": len(rows)})()


def _supabase_for_backfill(store: dict):
    return type("SB", (), {"table": lambda self, _name: _FakeChunkTable(store)})()


@pytest.fixture
def chunk_store(monkeypatch):
    data = {
        "1": {"id": "1", "texte": "Alerte qualité TEST_1", "embedding": None},
        "2": {"id": "2", "texte": "Alerte qualité TEST_2", "embedding": None},
        "3": {"id": "3", "texte": "Déjà vectorisé", "embedding": [0.1]},
        # #3586 — un chunk du Drive interne ARCHIVÉ n'est plus servi : inutile de payer son embedding.
        "4": {"id": "4", "texte": "Ancienne version Drive", "embedding": None, "archived_at": "2026-10-04T08:00:00Z"},
    }
    monkeypatch.setattr(dataforge_rag_chunks, "get_supabase", lambda: _supabase_for_backfill(data))
    monkeypatch.setenv("EMBEDDING_API_KEY", "sk-test")
    calls: list[list[str]] = []

    async def _batch(texts):
        calls.append(list(texts))
        return [await dataforge_rag_chunks._get_embedding(t) for t in texts]

    monkeypatch.setattr(dataforge_rag_chunks, "_get_embeddings", _batch)
    data["__batch_calls"] = calls  # lu par les tests de lot, ignoré par le faux store
    return data


@pytest.mark.asyncio
async def test_sans_cle_le_rattrapage_ne_touche_a_rien(chunk_store, monkeypatch):
    monkeypatch.delenv("EMBEDDING_API_KEY", raising=False)

    result = await backfill_dataforge_rag_chunk_embeddings()

    assert result["embedded"] == 0
    assert "EMBEDDING_API_KEY" in result["skipped"]
    assert chunk_store["1"]["embedding"] is None


@pytest.mark.asyncio
async def test_le_rattrapage_ne_touche_que_les_chunks_sans_vecteur(chunk_store, monkeypatch):
    async def _embed(_text):
        return [0.42]

    monkeypatch.setattr(dataforge_rag_chunks, "_get_embedding", _embed)

    result = await backfill_dataforge_rag_chunk_embeddings()

    assert result == {"embedded": 2, "failed": 0, "scanned": 2, "done": True, "remaining": 0}
    assert chunk_store["1"]["embedding"] == [0.42]
    assert chunk_store["2"]["embedding"] == [0.42]
    assert chunk_store["3"]["embedding"] == [0.1]
    assert chunk_store["4"]["embedding"] is None


@pytest.mark.asyncio
async def test_un_echec_dembedding_ne_fait_pas_tomber_le_lot(chunk_store, monkeypatch):
    async def _embed(text):
        if text == "Alerte qualité TEST_1":
            raise RuntimeError("panne fournisseur")
        return [0.42]

    monkeypatch.setattr(dataforge_rag_chunks, "_get_embedding", _embed)

    result = await backfill_dataforge_rag_chunk_embeddings()

    assert result["embedded"] == 1
    assert result["failed"] == 1
    assert chunk_store["1"]["embedding"] is None


@pytest.mark.asyncio
async def test_type_chunk_part_au_rpc_seulement_s_il_est_fourni(monkeypatch):
    # #3586 — le filtre de type se fait en SQL ; sans lui, les appels existants restent inchangés.
    monkeypatch.setenv("EMBEDDING_API_KEY", "sk-test")
    fake = _FakeSupabase(rows=[])
    monkeypatch.setattr(dataforge_rag_chunks, "get_supabase", lambda: fake)

    async def _embed(_text):
        return [0.0]

    monkeypatch.setattr(dataforge_rag_chunks, "_get_embedding", _embed)

    await search_dataforge_rag_chunks("q")
    await search_dataforge_rag_chunks("q", type_chunk="DRIVE_INTERNE")

    assert "filter_type_chunk" not in fake.rpc_calls[0][1]
    assert fake.rpc_calls[1][1]["filter_type_chunk"] == "DRIVE_INTERNE"


@pytest.mark.asyncio
async def test_les_textes_partent_par_lot_dans_un_seul_appel(chunk_store, monkeypatch):
    # #3586 — plusieurs textes par appel à l'API d'embedding, pas un appel par chunk.
    async def _batch(texts):
        chunk_store["__batch_calls"].append(list(texts))
        return [[0.5] for _ in texts]

    monkeypatch.setattr(dataforge_rag_chunks, "_get_embeddings", _batch)

    result = await backfill_dataforge_rag_chunk_embeddings()

    assert result["embedded"] == 2
    assert chunk_store["__batch_calls"] == [["Alerte qualité TEST_1", "Alerte qualité TEST_2"]]
    assert chunk_store["1"]["embedding"] == [0.5]


@pytest.mark.asyncio
async def test_un_lot_qui_echoue_se_replie_ligne_a_ligne(chunk_store, monkeypatch):
    async def _batch(_texts):
        raise RuntimeError("lot refusé")

    async def _embed(text):
        if text.endswith("TEST_1"):
            raise RuntimeError("ligne empoisonnée")
        return [0.7]

    monkeypatch.setattr(dataforge_rag_chunks, "_get_embeddings", _batch)
    monkeypatch.setattr(dataforge_rag_chunks, "_get_embedding", _embed)

    result = await backfill_dataforge_rag_chunk_embeddings()

    assert result["embedded"] == 1
    assert result["failed"] == 1
    assert chunk_store["2"]["embedding"] == [0.7]


@pytest.mark.asyncio
async def test_max_seconds_borne_le_temps_et_dit_ce_qui_reste(chunk_store, monkeypatch):
    # Échéance déjà dépassée : aucun lot ne démarre, `done` est faux, `remaining` dit ce qui reste.
    result = await backfill_dataforge_rag_chunk_embeddings(max_seconds=-1)

    assert result["embedded"] == 0
    assert result["done"] is False
    assert result["remaining"] == 2
