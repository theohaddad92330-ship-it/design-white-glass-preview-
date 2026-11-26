"""#3977 (recette 11/10 : « rangement réel non démontré ») — dépôt → recherche, de bout en bout.

Les suites existantes prouvent l'écriture (`test_rag_account_scope.py`, un espion d'insertion)
et la lecture (`test_3889_document_projects.py`, des lignes écrites à la main) SÉPARÉMENT.
Ici, la ligne que `rag_service.ingest` ÉCRIT est celle que `search_document_projects` LIT,
dans un même magasin en mémoire : la preuve que le document déposé sur un compte est
rangé dans ce compte et retrouvé par lui seul, jamais par un autre compte ni un autre espace.
"""

from __future__ import annotations

import asyncio

from app.services import document_projects, rag_service
from tests.test_3889_document_projects import ALICE, BOB, OTHER, SANOFI, WS_A, WS_B, _FakeClient, _install, _run


class _Store(_FakeClient):
    """Le faux PostgREST de la lecture, que l'écriture alimente aussi."""

    def __init__(self):
        super().__init__([])

    def table(self, name):
        if name != "rag_documents":
            return _Sink()
        query = super().table(name)
        store = self

        def _insert(data):
            row = {"id": f"doc-{len(store._rows) + 1}", "archived_at": None, "created_at": "2026-10-01T00:00:00+00:00"}
            row.update(data)
            row.setdefault("scope", "workspace")
            row.setdefault("account_id", None)
            store._rows.append(row)

            class _E:
                async def aexecute(self_e):
                    return type("R", (), {"data": [row], "error": None})()

            return _E()

        query.insert = _insert
        return query


class _Sink:
    def __getattr__(self, _name):
        return lambda *a, **k: self

    async def aexecute(self):
        return type("R", (), {"data": [], "error": None})()


def _wire(monkeypatch):
    store = _Store()
    _install(monkeypatch)  # propriété du compte, espace, date — la lecture
    monkeypatch.setattr(document_projects, "get_supabase", lambda: store)
    monkeypatch.setattr(rag_service, "get_supabase", lambda: store)

    async def _ws(user_id, workspace_id):
        return workspace_id

    async def _no_embedding(title, content):
        return None

    monkeypatch.setattr(rag_service, "_effective_workspace", _ws)
    monkeypatch.setattr(rag_service, "_maybe_generate_embedding", _no_embedding)
    return store


def _ingest(**kw):
    base = {"category": "Référence", "user_id": ALICE, "workspace_id": WS_A, "origin": "uploaded"}
    return asyncio.run(rag_service.ingest(**{**base, **kw}))


def test_un_document_depose_sur_le_compte_est_range_dans_ce_compte_et_retrouve(monkeypatch):
    store = _wire(monkeypatch)
    _ingest(
        title="Cahier des charges Sanofi",
        content="Besoin ouvert : architecte données, démarrage T1 2027.",
        scope="account",
        account_id=SANOFI,
    )
    row = store._rows[0]
    assert (row["scope"], row["account_id"], row["workspace_id"]) == ("account", SANOFI, WS_A)

    result = _run({"account_id": SANOFI})
    assert [i["source"] for i in result["open_needs"]] == ["Cahier des charges Sanofi"]


def test_NON_le_document_d_un_compte_n_est_jamais_lu_par_un_autre_compte(monkeypatch):
    store = _wire(monkeypatch)
    _ingest(
        title="Dossier autre compte",
        content="Besoin ouvert : chef de projet, démarrage T1 2027.",
        scope="account",
        account_id=OTHER,
    )
    assert store._rows[0]["account_id"] == OTHER
    result = _run({"account_id": SANOFI})
    assert result["open_needs"] == [] and result["documents_read"] == 0


def test_NON_le_document_d_un_autre_espace_n_est_jamais_lu(monkeypatch):
    store = _wire(monkeypatch)
    _ingest(
        title="Références concurrent",
        content="Mission terminée chez Sanofi en 2024 : qualification de données.",
        user_id=BOB,
        workspace_id=WS_B,
    )
    assert store._rows[0]["workspace_id"] == WS_B
    result = _run({"account_id": SANOFI})
    assert result["missions"] == []


def test_un_document_d_equipe_ne_rattache_au_compte_que_ce_qui_le_nomme(monkeypatch):
    store = _wire(monkeypatch)
    _ingest(
        title="Références ESN",
        content="Mission terminée chez Sanofi en 2024 : qualification de données.\n\nMission terminée chez Orange en 2023.",
    )
    assert store._rows[0]["scope"] == "workspace"
    result = _run({"account_id": SANOFI})
    assert [i["source"] for i in result["missions"]] == ["Références ESN"]
    assert "Orange" not in " ".join(i["excerpt"] for i in result["missions"])
