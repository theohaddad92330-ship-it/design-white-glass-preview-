"""#2431.7 (reste) — dédoublonnage CONTRE la base existante.

Le dédoublonnage déjà livré (`rag-zip-ingest.service.ts:93`) est INTRA-archive :
deux entrées aux octets identiques dans le MÊME dépôt. Celui-ci est un système
différent — un document déjà ingéré la semaine dernière, puis re-déposé seul ou
dans une nouvelle archive, ne doit pas dupliquer la ligne existante.

`rag_service.ingest` est le SEUL point d'écriture des deux chemins d'ingestion
(`RagController.ingest` et `RagZipIngestService.ingestZip` passent tous deux par
`IaClient.ragIngest` → `POST /rag/ingest` → cette fonction) : le fixer ici
couvre les deux, sans dupliquer la logique côté NestJS.

Portée du dédoublonnage : le WORKSPACE, jamais entre espaces (doctrine GA-43 —
deux ESN sont des concurrentes, rien ne s'agrège entre elles), même discipline
que `upsert`'s `_scope_workspace`.
"""

from __future__ import annotations

import hashlib

import pytest

from app.services import rag_service

WS_A = "11111111-1111-1111-1111-111111111111"
WS_B = "22222222-2222-2222-2222-222222222222"
ALICE = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"


def _hash(content: str) -> str:
    return hashlib.sha256(content.encode("utf-8")).hexdigest()


class _Res:
    def __init__(self, data):
        self.data = data
        self.error = None


class _Exec:
    def __init__(self, res: _Res):
        self._res = res

    async def aexecute(self):
        return self._res


class _FakeQuery:
    """PostgREST en mémoire — assez pour `ingest` : select/eq pour la
    recherche par empreinte (scopée espace), insert pour l'écriture."""

    def __init__(self, rows: list[dict], inserted: list[dict]):
        self._rows = rows
        self._inserted = inserted
        self._preds: list = []
        self._limit = 1000

    def select(self, *a, **k):
        return self

    def eq(self, column, value):
        self._preds.append(lambda r: r.get(column) == value)
        return self

    def or_(self, expression: str):
        # `_scope_workspace` : `workspace_id.eq.<ws>,and(workspace_id.is.null,user_id.eq.<uid>)`
        ws = expression.split("workspace_id.eq.", 1)[1].split(",", 1)[0]
        uid = expression.split("user_id.eq.", 1)[1].rstrip(")")
        self._preds.append(
            lambda r: r.get("workspace_id") == ws or (r.get("workspace_id") is None and r.get("user_id") == uid)
        )
        return self

    def limit(self, n, *a, **k):
        self._limit = n
        return self

    def insert(self, data):
        self._inserted.append(data)
        row = {**data, "id": f"new-{len(self._inserted)}"}
        return _Exec(_Res([row]))

    async def aexecute(self):
        out = [r for r in self._rows if all(p(r) for p in self._preds)]
        return _Res(out[: self._limit])


class _FakeClient:
    def __init__(self, rows: list[dict]):
        self._rows = rows
        self.inserted: list[dict] = []
        # #3750 — `ingest` écrit aussi ses morceaux dans `rag_document_chunks` :
        # ce test ne compte que les lignes de documents.
        self.chunks_inserted: list = []

    def table(self, name):
        if name == "rag_document_chunks":
            return _FakeQuery([], self.chunks_inserted)
        return _FakeQuery(self._rows, self.inserted)


def _install(monkeypatch, rows):
    client = _FakeClient(rows)
    monkeypatch.setattr(rag_service, "get_supabase", lambda: client)
    monkeypatch.setattr(rag_service, "_maybe_generate_embedding", _no_embedding)
    return client


async def _no_embedding(title, content):
    return None


async def test_ingest_calcule_et_ecrit_lempreinte(monkeypatch: pytest.MonkeyPatch) -> None:
    client = _install(monkeypatch, rows=[])
    content = "Playbook migration cloud — édition 2026."
    out = await rag_service.ingest("Playbook.pdf", content, "ref", ALICE, WS_A)
    assert out["duplicate"] is False
    assert client.inserted[0]["content_hash"] == _hash(content)


async def test_ingest_ne_duplique_pas_un_contenu_deja_present_dans_lespace(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    content = "Playbook migration cloud — édition 2026."
    existing = {
        "id": "existing-doc",
        "user_id": ALICE,
        "workspace_id": WS_A,
        "content_hash": _hash(content),
        "title": "Playbook (déjà déposé)",
        "category": "ref",
    }
    client = _install(monkeypatch, rows=[existing])
    out = await rag_service.ingest("Playbook (copie).pdf", content, "ref", ALICE, WS_A)
    assert out["duplicate"] is True
    assert out["id"] == "existing-doc"
    # Rien n'est écrit une seconde fois — c'est tout l'objet du dédoublonnage.
    assert client.inserted == []


async def test_le_dedoublonnage_ne_traverse_jamais_les_espaces(monkeypatch: pytest.MonkeyPatch) -> None:
    """GA-43 — deux ESN sont des concurrentes ; un contenu identique dans DEUX
    espaces différents n'est pas un doublon, c'est une coïncidence."""
    content = "Playbook migration cloud — édition 2026."
    existing_in_other_workspace = {
        "id": "other-workspace-doc",
        "user_id": "someone-else",
        "workspace_id": WS_B,
        "content_hash": _hash(content),
        "title": "Playbook d'une autre ESN",
        "category": "ref",
    }
    client = _install(monkeypatch, rows=[existing_in_other_workspace])
    out = await rag_service.ingest("Playbook.pdf", content, "ref", ALICE, WS_A)
    assert out["duplicate"] is False
    assert len(client.inserted) == 1
