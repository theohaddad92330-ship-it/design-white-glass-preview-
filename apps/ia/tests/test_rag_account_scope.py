"""#2779 — les trois portées manquantes d'un document RAG.

« Mon espace personnel » (`personal`), « Un compte précis » (`account`),
« Base de connaissance durable » (`knowledge_base`) — #1954. Chaque garantie
est prouvée dans les DEUX sens (le test sait dire NON) :

  * un document `account` du compte X ne remonte JAMAIS dans une requête sur le
    compte Y, ni dans une recherche sans compte — et remonte sur X ;
  * un document `personal` n'est lu que par son auteur, jamais par un collègue ;
  * un document `knowledge_base` est lu par toute l'équipe, comme `workspace` ;
  * les pièces jointes par identifiant obéissent à la même règle ;
  * le vecteur reçoit le compte (la RPC porte le même prédicat, migration
    1796001516284) ;
  * l'écriture refuse `account` sans compte VALIDE, avant toute requête.
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest

from app.services import rag_knowledge, rag_service
from app.services.rag_service import PgVectorSearch, TextSearchFallback
from tests.rag_visibility_fake import is_visibility_filter, visibility_predicate

WS_A = "11111111-1111-1111-1111-111111111111"
WS_B = "22222222-2222-2222-2222-222222222222"
ALICE = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"
BOB = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"
ACCOUNT_X = "0000000a-0000-4000-8000-00000000000a"
ACCOUNT_Y = "0000000b-0000-4000-8000-00000000000b"


def _row(doc_id, scope, *, user=ALICE, ws=WS_A, account=None):
    return {
        "id": doc_id,
        "user_id": user,
        "workspace_id": ws,
        "scope": scope,
        "account_id": account,
        "conversation_id": "thread-A" if scope == "conversation" else None,
        "title": f"Titre {doc_id}",
        "content": f"migration cloud {doc_id}",
        "category": "ref",
    }


ROWS = [
    _row("team-doc", "workspace"),
    _row("kb-doc", "knowledge_base"),
    _row("alice-perso", "personal"),
    _row("bob-perso", "personal", user=BOB),
    _row("acct-x", "account", account=ACCOUNT_X),
    _row("acct-y", "account", account=ACCOUNT_Y),
    _row("conv-doc", "conversation"),
    # Autre espace : jamais, quelle que soit la portée.
    _row("ws-b-kb", "knowledge_base", ws=WS_B, user=BOB),
    _row("ws-b-acct-x", "account", ws=WS_B, user=BOB, account=ACCOUNT_X),
]


class _Res:
    def __init__(self, data, error=None):
        self.data = data
        self.error = error


class _FakeQuery:
    """PostgREST en mémoire : applique les prédicats réels du service."""

    def __init__(self, rows):
        self._rows = rows
        self._preds: list = []
        self._limit = 1000

    def select(self, *a, **k):
        return self

    def limit(self, n, *a, **k):
        self._limit = n
        return self

    def eq(self, column, value):
        self._preds.append(lambda r: r.get(column) == value)
        return self

    def in_(self, column, values):
        wanted = set(values)
        self._preds.append(lambda r: r.get(column) in wanted)
        return self

    def is_(self, column, value):
        if value in (None, "null"):
            self._preds.append(lambda r: r.get(column) is None)
        else:
            self._preds.append(lambda r: r.get(column) == value)
        return self

    def order(self, *a, **k):
        return self

    def or_(self, expression: str):
        if is_visibility_filter(expression):
            self._preds.append(visibility_predicate(expression))
            return self
        ws = expression.split("workspace_id.eq.", 1)[1].split(",", 1)[0]
        uid = expression.split("user_id.eq.", 1)[1].rstrip(")")
        self._preds.append(
            lambda r: r.get("workspace_id") == ws or (r.get("workspace_id") is None and r.get("user_id") == uid)
        )
        return self

    def text_search(self, column, query, **k):
        tokens = query.lower().split()
        self._preds.append(lambda r: any(t in str(r.get(column) or "").lower() for t in tokens))
        return self

    def ilike(self, column, value, **k):
        needle = value.strip("%").lower()
        self._preds.append(lambda r: needle in str(r.get(column) or "").lower())
        return self

    async def aexecute(self):
        return _Res([r for r in self._rows if all(p(r) for p in self._preds)][: self._limit])


class _FakeClient:
    def __init__(self, rows):
        self._rows = rows

    def table(self, name):
        return _FakeQuery(self._rows)


def _install(monkeypatch, rows=ROWS):
    monkeypatch.setattr(rag_service, "get_supabase", lambda: _FakeClient(rows))


async def _search(user, account=None, ws=WS_A):
    docs = await TextSearchFallback().query("migration", user, 50, ws, account_id=account)
    return {d["id"] for d in docs}


# ─── Un compte précis ──────────────────────────────────────────────────────


async def test_NON_a_document_of_account_X_never_surfaces_in_a_request_on_account_Y(monkeypatch):
    _install(monkeypatch)
    ids = await _search(ALICE, ACCOUNT_Y)
    assert "acct-x" not in ids
    assert "acct-y" in ids


async def test_a_document_of_account_X_surfaces_on_account_X_only_in_its_own_workspace(monkeypatch):
    _install(monkeypatch)
    ids = await _search(ALICE, ACCOUNT_X)
    assert "acct-x" in ids
    assert "acct-y" not in ids
    # Même compte, AUTRE espace : jamais.
    assert "ws-b-acct-x" not in ids


async def test_NON_an_account_document_never_surfaces_in_a_search_without_an_account(monkeypatch):
    _install(monkeypatch)
    ids = await _search(ALICE)
    assert not {"acct-x", "acct-y"} & ids
    assert {"team-doc", "kb-doc"} <= ids


async def test_a_malformed_account_id_is_ignored_never_interpolated(monkeypatch):
    """Le compte voyage jusque dans un filtre PostgREST : une valeur qui n'est
    pas un UUID ne l'atteint jamais (sinon `,` ou `)` réécriraient le filtre)."""
    _install(monkeypatch)
    ids = await _search(ALICE, f"{ACCOUNT_X}),scope.eq.account")
    assert not {"acct-x", "acct-y"} & ids
    assert "account_id" not in rag_service._visibility_filter(ALICE, "x),or(scope.eq.account")


# ─── Mon espace personnel ──────────────────────────────────────────────────


async def test_NON_a_personal_document_is_never_read_by_a_colleague(monkeypatch):
    _install(monkeypatch)
    alice = await _search(ALICE)
    bob = await _search(BOB)
    assert "alice-perso" in alice and "bob-perso" not in alice
    assert "bob-perso" in bob and "alice-perso" not in bob


# ─── Base de connaissance durable ──────────────────────────────────────────


async def test_the_durable_knowledge_base_is_read_by_the_whole_team_and_nothing_wider(monkeypatch):
    _install(monkeypatch)
    assert "kb-doc" in await _search(ALICE)
    assert "kb-doc" in await _search(BOB)
    assert "ws-b-kb" not in await _search(ALICE)


async def test_a_conversation_document_still_never_surfaces_in_general_retrieval(monkeypatch):
    _install(monkeypatch)
    assert "conv-doc" not in await _search(ALICE, ACCOUNT_X)


async def test_the_ilike_degradation_path_applies_the_same_visibility(monkeypatch):
    _install(monkeypatch)
    docs = await TextSearchFallback()._ilike("migration", ALICE, 50, WS_A, account_id=ACCOUNT_Y)
    ids = {d["id"] for d in docs}
    assert "acct-x" not in ids and "bob-perso" not in ids
    assert {"acct-y", "alice-perso", "kb-doc"} <= ids


# ─── Pièces jointes par identifiant ────────────────────────────────────────


async def test_NON_an_attached_document_of_account_X_is_not_read_in_a_chat_on_account_Y(monkeypatch):
    _install(monkeypatch)
    on_y = await rag_service.fetch_documents_by_ids(
        ["acct-x", "team-doc"], ALICE, workspace_id=WS_A, account_id=ACCOUNT_Y
    )
    assert [d["id"] for d in on_y] == ["team-doc"]
    on_x = await rag_service.fetch_documents_by_ids(["acct-x"], ALICE, workspace_id=WS_A, account_id=ACCOUNT_X)
    assert [d["id"] for d in on_x] == ["acct-x"]


async def test_NON_a_colleagues_personal_document_is_not_read_by_id(monkeypatch):
    _install(monkeypatch)
    assert await rag_service.fetch_documents_by_ids(["bob-perso"], ALICE, workspace_id=WS_A) == []


# ─── Le vecteur porte le même compte ───────────────────────────────────────


class _RpcSpy:
    def __init__(self):
        self.calls: list[tuple[str, dict]] = []

    def rpc(self, name, params):
        self.calls.append((name, params))

        class _Exec:
            async def aexecute(self_inner):
                return _Res([])

        return _Exec()


async def test_the_vector_rpc_receives_the_account_only_when_the_request_carries_one(monkeypatch):
    spy = _RpcSpy()
    monkeypatch.setattr(rag_service, "get_supabase", lambda: spy)

    async def _fake_embedding(self, text):
        return [0.0]

    monkeypatch.setattr(PgVectorSearch, "_get_embedding", _fake_embedding)
    await PgVectorSearch().query("q", ALICE, 5, WS_A, account_id=ACCOUNT_X)
    await PgVectorSearch().query("q", ALICE, 5, WS_A)
    assert spy.calls[0][1]["filter_account_id"] == ACCOUNT_X
    # Sans compte, la clé n'est pas envoyée : l'appel reste celui d'avant la
    # migration (déploiement dans n'importe quel ordre).
    assert "filter_account_id" not in spy.calls[1][1]


# ─── Le compte traverse jusqu'à la récupération ────────────────────────────


async def test_reranked_citations_forward_the_account_to_the_query(monkeypatch):
    seen: dict = {}

    async def _fake_query(query_text, user_id, top_k=5, workspace_id=None, account_id=None):
        seen["account_id"] = account_id
        return []

    monkeypatch.setattr(rag_service, "query", _fake_query)
    monkeypatch.setattr(rag_knowledge, "is_enabled", lambda: True)
    await rag_knowledge.retrieve_reranked_citations("q", ALICE, workspace_id=WS_A, account_id=ACCOUNT_X)
    assert seen["account_id"] == ACCOUNT_X


APP = Path(__file__).resolve().parents[1] / "app"


@pytest.mark.parametrize(
    "path, callee, pattern",
    [
        # #3887 (lot V13) — ce fil peut se résoudre en texte libre quand `req.account_id`
        # est vide (`resolve_message_account_id`, `rag_knowledge.py`) : la variable
        # locale RESTE dérivée de la requête (`req.account_id or …`), jamais un
        # second calcul indépendant — voir `_run_chat_turn`.
        ("routers/chat.py", "retrieve_reranked_citations", "account_id=resolved_account_id"),
        ("routers/chat.py", "fetch_documents_by_ids", "account_id=req.account_id"),
        ("routers/phase4_plan.py", "retrieve_reranked_context", "account_id=req.account_id"),
        ("routers/phase4_plan.py", "retrieve_knowledge_context", "account_id=req.account_id"),
        ("routers/phase1_research.py", "retrieve_reranked_context", "account_id=req.account_id"),
    ],
)
def test_every_caller_passes_the_account_of_its_request(path, callee, pattern):
    """Un appelant qui oublie le compte rendrait le document `account`
    invisible PARTOUT — fail closed, mais une capacité que personne n'atteint."""
    source = (APP / path).read_text(encoding="utf-8")
    calls = [m.start() for m in re.finditer(rf"\b{callee}\(", source)]
    assert calls, f"{callee} introuvable dans {path}"
    for start in calls:
        window = source[start : start + 600]
        assert pattern in window, f"{path} appelle {callee} sans le compte"


def test_the_resolved_account_never_overrides_an_already_anchored_thread():
    """#3887 — `resolved_account_id` part TOUJOURS du compte du fil s'il existe ;
    la résolution par nom libre n'intervient qu'à défaut (`or`), jamais en
    concurrence avec un fil déjà ancré."""
    source = (APP / "routers/chat.py").read_text(encoding="utf-8")
    assert "resolved_account_id = req.account_id or await rag_knowledge.resolve_message_account_id(" in source


# ─── L'écriture ────────────────────────────────────────────────────────────


class _InsertSpy:
    def __init__(self):
        self.inserted: list[dict] = []

    def table(self, name):
        spy = self

        class _T:
            def insert(self_inner, data):
                spy.inserted.append(data)

                class _E:
                    async def aexecute(self_e):
                        return _Res([{"id": "new"}])

                return _E()

        return _T()


@pytest.fixture
def insert_spy(monkeypatch):
    spy = _InsertSpy()
    monkeypatch.setattr(rag_service, "get_supabase", lambda: spy)

    async def _ws(user_id, workspace_id):
        return workspace_id

    async def _no_embedding(title, content):
        return None

    monkeypatch.setattr(rag_service, "_effective_workspace", _ws)
    monkeypatch.setattr(rag_service, "_maybe_generate_embedding", _no_embedding)
    return spy


async def test_ingest_writes_the_account_scope_and_its_account(insert_spy):
    await rag_service.ingest("t", "une note", "ref", ALICE, WS_A, scope="account", account_id=ACCOUNT_X)
    assert insert_spy.inserted[0]["scope"] == "account"
    assert insert_spy.inserted[0]["account_id"] == ACCOUNT_X


@pytest.mark.parametrize("bad", [None, "", "acme", f"{ACCOUNT_X},x"])
async def test_ingest_refuses_an_account_scope_without_a_valid_account(insert_spy, bad):
    with pytest.raises(ValueError):
        await rag_service.ingest("t", "une note", "ref", ALICE, WS_A, scope="account", account_id=bad)
    assert insert_spy.inserted == []


@pytest.mark.parametrize("scope", ["personal", "knowledge_base"])
async def test_ingest_writes_personal_and_knowledge_base_scopes_explicitly(insert_spy, scope):
    await rag_service.ingest("t", "une note", "ref", ALICE, WS_A, scope=scope)
    assert insert_spy.inserted[0]["scope"] == scope
    assert "account_id" not in insert_spy.inserted[0]


async def test_ingest_default_path_is_unchanged(insert_spy):
    await rag_service.ingest("t", "une note", "ref", ALICE, WS_A)
    assert "scope" not in insert_spy.inserted[0]
    assert "account_id" not in insert_spy.inserted[0]
