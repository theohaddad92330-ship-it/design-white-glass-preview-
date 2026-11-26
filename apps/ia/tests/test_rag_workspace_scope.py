"""RAG grounding is WORKSPACE-scoped, not per-user.

The defect this pins (PR #637 §1.2): the ESN uploads its references and case
studies into « Connaissances », the whole team sees them listed — and no
colleague's analysis ever grounds on them, because retrieval filtered on
``user_id``. A shared knowledge base that is only shared at display time.

Both directions matter, and they are opposite bugs:

  * a COLLEAGUE's document (same workspace, different owner) MUST be retrieved;
  * ANOTHER workspace's document MUST NEVER be retrieved.

Both retrieval backends are pinned, because a scoping fix applied to only one of
them is a leak: ``TextSearchFallback`` (no EMBEDDING_API_KEY — FTS, degrading to
ILIKE) and ``PgVectorSearch`` (key set — cosine via the ``match_rag_documents``
RPC). The RPC's own SQL predicate is pinned DB-side in
``apps/api/src/migrations/__tests__/1786970000000-RagWorkspaceScope.spec.ts``.

Legacy rows (``workspace_id IS NULL`` — written by the IA before it knew about
workspaces) stay reachable BY THEIR OWNER ONLY. That mirrors the RLS policy
``rag_documents_workspace_access`` exactly, so the service filter can never be
wider than the database backstop.
"""

from __future__ import annotations

import ast
import inspect
from pathlib import Path

from app.services import rag_knowledge, rag_service
from app.services.rag_service import PgVectorSearch, TextSearchFallback
from tests.rag_visibility_fake import is_visibility_filter, visibility_predicate

# --- the fixture store: one workspace, two members, plus a foreign workspace ---

WS_A = "11111111-1111-1111-1111-111111111111"
WS_B = "22222222-2222-2222-2222-222222222222"
ALICE = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"  # workspace A
BOB = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"  # workspace A, Alice's colleague
CAROL = "cccccccc-cccc-cccc-cccc-cccccccccccc"  # workspace B, another ESN


# #1954.7 — chaque ligne porte `scope: "workspace"` : cette fixture pin
# l'ESPACE (l'axe d'AVANT), et `_scope_workspace` (utilisée depuis ce lot par
# TextSearchFallback/upsert) filtre désormais aussi sur `scope`. Sans cette
# clé, `r.get("scope") == "workspace"` serait faux pour CHAQUE ligne — voir
# `test_rag_conversation_scope.py` pour l'axe orthogonal (`conversation`).
ROWS = [
    # Alice's own upload.
    {
        "id": "a-own",
        "user_id": ALICE,
        "workspace_id": WS_A,
        "scope": "workspace",
        "title": "Référence bancaire",
        "content": "migration cloud banque",
        "category": "ref",
    },
    # Her colleague's upload — the whole point of the fix.
    {
        "id": "a-colleague",
        "user_id": BOB,
        "workspace_id": WS_A,
        "scope": "workspace",
        "title": "Cas client SAP",
        "content": "migration cloud SAP",
        "category": "ref",
    },
    # Another ESN's confidential reference — must never surface.
    {
        "id": "b-foreign",
        "user_id": CAROL,
        "workspace_id": WS_B,
        "scope": "workspace",
        "title": "Cas client concurrent",
        "content": "migration cloud concurrent",
        "category": "ref",
    },
    # Legacy row written before the IA stamped workspace_id: owner-private.
    {
        "id": "a-legacy",
        "user_id": ALICE,
        "workspace_id": None,
        "scope": "workspace",
        "title": "Vieux pitch",
        "content": "migration cloud legacy",
        "category": "ref",
    },
    {
        "id": "b-legacy",
        "user_id": CAROL,
        "workspace_id": None,
        "scope": "workspace",
        "title": "Vieux pitch concurrent",
        "content": "migration cloud etranger",
        "category": "ref",
    },
]


class _Res:
    def __init__(self, data, error=None):
        self.data = data
        self.error = error


class _FakeQuery:
    """In-memory PostgREST: applies the filters the service actually sets, so the
    assertions below are behavioural (which rows come back) rather than a string
    match on query params."""

    def __init__(self, rows: list[dict], calls: list[str]):
        self._rows = rows
        self._calls = calls
        self._preds: list = []
        self._limit = 100

    def select(self, *a, **k):
        return self

    def limit(self, n, *a, **k):
        self._limit = n
        return self

    def eq(self, column, value):
        self._preds.append(lambda r: r.get(column) == value)
        return self

    def or_(self, expression: str):
        """Only the one shape the service emits:
        ``workspace_id.eq.<ws>,and(workspace_id.is.null,user_id.eq.<uid>)``."""
        if is_visibility_filter(expression):  # #2779 — la visibilité par portée
            self._preds.append(visibility_predicate(expression))
            return self
        self._calls.append(f"or:{expression}")
        ws = expression.split("workspace_id.eq.", 1)[1].split(",", 1)[0]
        uid = expression.split("user_id.eq.", 1)[1].rstrip(")")
        self._preds.append(
            lambda r: r.get("workspace_id") == ws or (r.get("workspace_id") is None and r.get("user_id") == uid)
        )
        return self

    def text_search(self, column, query, **k):
        self._calls.append(f"fts:{column}")
        tokens = query.lower().split()
        self._preds.append(lambda r: any(t in str(r.get(column) or "").lower() for t in tokens))
        return self

    def ilike(self, column, value, **k):
        self._calls.append(f"ilike:{column}")
        needle = value.strip("%").lower()
        self._preds.append(lambda r: needle in str(r.get(column) or "").lower())
        return self

    def is_(self, column, value):
        # #2431.5 — `_scope_retrieval` exclut désormais l'archivé (`archived_at
        # IS NULL`) ; les lignes de cette fixture n'en portent pas, donc ce
        # prédicat les laisse toutes passer (comportement inchangé pour elles).
        self._calls.append(f"is:{column}:{value}")
        if value == "null":
            self._preds.append(lambda r: r.get(column) is None)
        else:
            self._preds.append(lambda r: r.get(column) == value)
        return self

    async def aexecute(self):
        out = [r for r in self._rows if all(p(r) for p in self._preds)]
        return _Res(out[: self._limit])


class _FakeClient:
    def __init__(self, rows, calls):
        self._rows = rows
        self._calls = calls

    def table(self, name):
        return _FakeQuery(self._rows, self._calls)

    def rpc(self, function_name, params):
        """``match_rag_documents`` — mirrors the SQL predicate the migration
        installs, so the service is pinned on passing the right params."""
        self._calls.append(f"rpc:{function_name}:{sorted(params)}")
        ws = params.get("filter_workspace_id")
        uid = params.get("filter_user_id")
        if ws:
            rows = [
                r for r in self._rows if r["workspace_id"] == ws or (r["workspace_id"] is None and r["user_id"] == uid)
            ]
        else:
            rows = [r for r in self._rows if uid is None or r["user_id"] == uid]
        return _FakeQuery(rows, self._calls)


def _install(monkeypatch, calls):
    monkeypatch.setattr(rag_service, "get_supabase", lambda: _FakeClient(ROWS, calls))


# --------------------------------------------------------------------------
# Path 1 — full-text fallback (no EMBEDDING_API_KEY)
# --------------------------------------------------------------------------


async def test_fts_retrieves_a_colleagues_document(monkeypatch):
    """THE reported bug: Alice's analysis must ground on Bob's uploaded case study."""
    monkeypatch.delenv("EMBEDDING_API_KEY", raising=False)
    _install(monkeypatch, [])
    docs = await TextSearchFallback().query("migration cloud", ALICE, top_k=10, workspace_id=WS_A)
    assert "a-colleague" in {d["id"] for d in docs}


async def test_fts_never_leaks_another_workspace(monkeypatch):
    """The opposite bug, which would be far worse: another ESN's confidential
    reference must not surface in this workspace's retrieval."""
    monkeypatch.delenv("EMBEDDING_API_KEY", raising=False)
    _install(monkeypatch, [])
    docs = await TextSearchFallback().query("migration cloud", ALICE, top_k=10, workspace_id=WS_A)
    ids = {d["id"] for d in docs}
    assert "b-foreign" not in ids
    assert "b-legacy" not in ids


async def test_fts_legacy_null_workspace_row_stays_reachable_by_its_owner(monkeypatch):
    """Nothing may become unreachable: a row the IA wrote before it stamped
    workspace_id is still retrieved for its owner (and nobody else)."""
    monkeypatch.delenv("EMBEDDING_API_KEY", raising=False)
    _install(monkeypatch, [])
    mine = await TextSearchFallback().query("migration cloud", ALICE, top_k=10, workspace_id=WS_A)
    assert "a-legacy" in {d["id"] for d in mine}
    # …but that same NULL row is invisible to a colleague in the same workspace.
    theirs = await TextSearchFallback().query("migration cloud", BOB, top_k=10, workspace_id=WS_A)
    assert "a-legacy" not in {d["id"] for d in theirs}


async def test_fts_without_workspace_keeps_legacy_per_user_scope(monkeypatch):
    """No workspace resolved ⇒ byte-identical legacy behaviour (owner-only), never
    a widening to "everything"."""
    monkeypatch.delenv("EMBEDDING_API_KEY", raising=False)
    calls: list[str] = []
    _install(monkeypatch, calls)
    docs = await TextSearchFallback().query("migration cloud", ALICE, top_k=10)
    assert {d["id"] for d in docs} == {"a-own", "a-legacy"}
    assert not any(c.startswith("or:") for c in calls)


async def test_ilike_degradation_is_scoped_too(monkeypatch):
    """The ILIKE degradation path carries the same scope — a fix on FTS only
    would leak the moment the FTS config is missing."""
    monkeypatch.delenv("EMBEDDING_API_KEY", raising=False)
    _install(monkeypatch, [])
    docs = await TextSearchFallback()._ilike("migration cloud", ALICE, top_k=10, workspace_id=WS_A)
    ids = {d["id"] for d in docs}
    assert "a-colleague" in ids
    assert "b-foreign" not in ids and "b-legacy" not in ids


# --------------------------------------------------------------------------
# Path 2 — pgvector similarity (EMBEDDING_API_KEY set)
# --------------------------------------------------------------------------


async def test_pgvector_passes_workspace_filter_to_the_rpc(monkeypatch):
    monkeypatch.setenv("EMBEDDING_API_KEY", "test-key")
    calls: list[str] = []
    _install(monkeypatch, calls)
    monkeypatch.setattr(PgVectorSearch, "_get_embedding", lambda self, text: _coro([0.0] * 1536))
    docs = await PgVectorSearch().query("migration cloud", ALICE, top_k=10, workspace_id=WS_A)
    ids = {d["id"] for d in docs}
    assert "a-colleague" in ids  # colleague reachable
    assert "b-foreign" not in ids and "b-legacy" not in ids  # foreign workspace not
    assert any("filter_workspace_id" in c for c in calls)


async def test_pgvector_without_workspace_keeps_legacy_per_user_scope(monkeypatch):
    monkeypatch.setenv("EMBEDDING_API_KEY", "test-key")
    calls: list[str] = []
    _install(monkeypatch, calls)
    monkeypatch.setattr(PgVectorSearch, "_get_embedding", lambda self, text: _coro([0.0] * 1536))
    docs = await PgVectorSearch().query("migration cloud", ALICE, top_k=10)
    assert {d["id"] for d in docs} == {"a-own", "a-legacy"}


async def _coro(value):
    return value


# --------------------------------------------------------------------------
# The public entry points used by analysis / chat grounding
# --------------------------------------------------------------------------


async def test_retrieve_knowledge_docs_is_workspace_scoped(monkeypatch):
    monkeypatch.delenv("EMBEDDING_API_KEY", raising=False)
    _install(monkeypatch, [])
    docs = await rag_service.retrieve_knowledge_docs("migration cloud", ALICE, top_k=10, workspace_id=WS_A)
    ids = {d["id"] for d in docs}
    assert "a-colleague" in ids
    assert "b-foreign" not in ids


async def test_retrieve_knowledge_context_grounds_on_a_colleagues_upload(monkeypatch):
    """End of the chain: the prompt block an analysis actually receives."""
    monkeypatch.delenv("EMBEDDING_API_KEY", raising=False)
    _install(monkeypatch, [])
    block = await rag_service.retrieve_knowledge_context("migration cloud", ALICE, top_k=10, workspace_id=WS_A)
    assert "Cas client SAP" in block  # Bob's document grounds Alice's analysis
    assert "concurrent" not in block  # workspace B never appears


# --------------------------------------------------------------------------
# Write path — the read scope is worthless if ingestion doesn't stamp
# --------------------------------------------------------------------------


class _CapturingQuery(_FakeQuery):
    def __init__(self, rows, calls, sink):
        super().__init__(rows, calls)
        self._sink = sink

    def insert(self, data):
        self._sink.append(("insert", data))
        self._rows = [data]
        return self

    def update(self, data):
        self._sink.append(("update", data))
        self._rows = [data]
        return self


class _CapturingClient(_FakeClient):
    def __init__(self, rows, calls, sink):
        super().__init__(rows, calls)
        self._sink = sink

    def table(self, name):
        return _CapturingQuery(self._rows, self._calls, self._sink)


async def test_ingest_stamps_the_workspace(monkeypatch):
    monkeypatch.delenv("EMBEDDING_API_KEY", raising=False)
    sink: list = []
    monkeypatch.setattr(rag_service, "get_supabase", lambda: _CapturingClient([], [], sink))
    await rag_service.ingest("Titre", "corps", "ref", ALICE, workspace_id=WS_A)
    written = next(d for op, d in sink if op == "insert")
    assert written["workspace_id"] == WS_A
    assert written["user_id"] == ALICE  # created-by attribution is kept


async def test_ingest_without_workspace_writes_no_invented_value(monkeypatch):
    """Never invent data: an unresolvable workspace leaves the column absent, and
    the row stays owner-private — it is not assigned to a plausible workspace."""
    monkeypatch.delenv("EMBEDDING_API_KEY", raising=False)
    sink: list = []
    monkeypatch.setattr(rag_service, "get_supabase", lambda: _CapturingClient([], [], sink))
    monkeypatch.setattr(rag_service, "resolve_workspace_id", lambda uid: _coro(None))
    await rag_service.ingest("Titre", "corps", "ref", ALICE)
    written = next(d for op, d in sink if op == "insert")
    assert "workspace_id" not in written


async def test_ingest_resolves_the_workspace_when_the_caller_omits_it(monkeypatch):
    """Defence in depth: a caller that predates the contract change still produces
    a workspace-stamped row, so the store cannot silently re-accumulate orphans."""
    monkeypatch.delenv("EMBEDDING_API_KEY", raising=False)
    sink: list = []
    monkeypatch.setattr(rag_service, "get_supabase", lambda: _CapturingClient([], [], sink))
    monkeypatch.setattr(rag_service, "resolve_workspace_id", lambda uid: _coro(WS_A))
    await rag_service.ingest("Titre", "corps", "ref", ALICE)
    written = next(d for op, d in sink if op == "insert")
    assert written["workspace_id"] == WS_A


async def test_switching_workspace_changes_which_documents_ground_an_analysis(monkeypatch):
    """Composition with the workspace switcher (#642).

    A consultant belongs to their personal workspace AND to the ESN's. Which
    knowledge base grounds their analysis must follow the workspace they are
    CURRENTLY working in — the same run, launched from either side, must not read
    the same documents. Retrieval takes the workspace as an argument precisely so
    that switching is the only thing that has to change.
    """
    monkeypatch.delenv("EMBEDDING_API_KEY", raising=False)
    _install(monkeypatch, [])

    in_workspace_a = {
        d["id"]
        for d in await rag_service.retrieve_knowledge_docs("migration cloud", ALICE, top_k=10, workspace_id=WS_A)
    }
    # Same user, same query — now working in the other workspace.
    in_workspace_b = {
        d["id"]
        for d in await rag_service.retrieve_knowledge_docs("migration cloud", ALICE, top_k=10, workspace_id=WS_B)
    }

    assert "a-colleague" in in_workspace_a and "a-colleague" not in in_workspace_b
    assert "b-foreign" in in_workspace_b and "b-foreign" not in in_workspace_a
    # Her own legacy (NULL-workspace) row follows her, not the workspace — it is
    # owner-private, so it is the one document present on both sides.
    assert "a-legacy" in in_workspace_a and "a-legacy" in in_workspace_b


async def test_ingest_files_the_document_in_the_workspace_being_worked_in(monkeypatch):
    """The write half of the same crossing: a document uploaded while working in
    the ESN is stamped with the ESN, even though the uploader OWNS another
    workspace. Getting this wrong files the ESN's reference into someone's
    personal space, where the team would never see it."""
    monkeypatch.delenv("EMBEDDING_API_KEY", raising=False)
    sink: list = []
    monkeypatch.setattr(rag_service, "get_supabase", lambda: _CapturingClient([], [], sink))
    # The resolver returns the SWITCHED workspace (B), not the owned one (A).
    monkeypatch.setattr(rag_service, "resolve_workspace_id", lambda uid: _coro(WS_B))
    await rag_service.ingest("Référence ESN", "corps", "ref", ALICE)
    written = next(d for op, d in sink if op == "insert")
    assert written["workspace_id"] == WS_B


async def test_upsert_refreshes_the_teams_shared_doc_not_a_per_member_copy(monkeypatch):
    """The RAG-knowledge flywheel keys on the WORKSPACE: re-analysing an account
    refreshes the team's distilled doc instead of piling up one copy per member."""
    monkeypatch.delenv("EMBEDDING_API_KEY", raising=False)
    sink: list = []
    existing = [
        {"id": "shared-doc", "user_id": BOB, "workspace_id": WS_A, "scope": "workspace", "title": "T", "category": "c"}
    ]
    monkeypatch.setattr(rag_service, "get_supabase", lambda: _CapturingClient(existing, [], sink))
    out = await rag_service.upsert("T", "nouveau corps", "c", ALICE, workspace_id=WS_A)
    assert out["updated"] is True  # Bob's row refreshed, no duplicate for Alice
    assert any(op == "update" for op, _ in sink)


# ── La portée voyage-t-elle jusqu'aux APPELANTS ? ────────────────────────────
#
# Tout ce qui précède prouve que les deux moteurs SAVENT filtrer sur l'espace.
# Rien n'en prouve autant des appelants : un point d'appel qui OMET l'argument
# retombe silencieusement sur le filtre par utilisateur, et la base de
# connaissance de l'ESN redevient invisible pour le collègue — le défaut exact
# que ce fichier a été écrit pour clore, revenu par une autre porte.
#
# C'est le motif « paramètre déclaré, jamais passé ». Il ne se voit pas en
# lisant la fonction : il faut lire les APPELANTS.

_RAG_ENTRYPOINTS = {
    "retrieve_reranked_context": rag_knowledge.retrieve_reranked_context,
    "retrieve_reranked_citations": rag_knowledge.retrieve_reranked_citations,
    "retrieve_knowledge_context": rag_service.retrieve_knowledge_context,
    "retrieve_knowledge_docs": rag_service.retrieve_knowledge_docs,
}


def _workspace_position(fn: object) -> int | None:
    """Le rang POSITIONNEL de `workspace_id`, ou `None` s'il est en mot-clé seul.

    Lu dans la vraie signature plutôt qu'écrit à la main : `retrieve_knowledge_context`
    le passe en QUATRIÈME position (`rag_service.py`), et une garde qui n'accepterait
    que la forme nommée accuserait un appel parfaitement correct. Une garde qui crie
    faux se fait désarmer — c'est la façon la plus sûre de perdre celle-ci.
    """
    params = list(inspect.signature(fn).parameters.values())
    for index, param in enumerate(params):
        if param.name == "workspace_id":
            return index if param.kind is param.POSITIONAL_OR_KEYWORD else None
    return None


def _scoped_retrieval_calls() -> list[tuple[str, int, str, bool]]:
    """Chaque appel de récupération RAG dans le service, et s'il porte l'espace.

    Lu à l'AST et non à l'expression régulière : un appel s'écrit sur cinq
    lignes, avec des commentaires au milieu, et un extracteur textuel se coupe
    à la première parenthèse fermante venue — le dépôt a déjà payé cette
    erreur-là plusieurs fois.
    """
    app_dir = Path(__file__).resolve().parent.parent / "app"
    positions = {name: _workspace_position(fn) for name, fn in _RAG_ENTRYPOINTS.items()}
    out: list[tuple[str, int, str, bool]] = []
    for path in sorted(app_dir.rglob("*.py")):
        if "__pycache__" in path.parts:
            continue
        tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
        for node in ast.walk(tree):
            if not isinstance(node, ast.Call):
                continue
            func = node.func
            name = func.attr if isinstance(func, ast.Attribute) else getattr(func, "id", "")
            if name not in _RAG_ENTRYPOINTS:
                continue
            position = positions[name]
            scoped = any(kw.arg == "workspace_id" for kw in node.keywords) or (
                position is not None and len(node.args) > position
            )
            out.append((path.name, node.lineno, name, scoped))
    return out


def test_the_caller_guard_sees_real_call_sites():
    """Le témoin : une garde qui ne trouve aucun appel est verte pour toujours."""
    calls = _scoped_retrieval_calls()
    assert len(calls) >= 3, f"corpus suspect : {len(calls)} appels de récupération trouvés"


def test_every_retrieval_call_carries_its_workspace():
    """Omettre l'espace retombe sur le filtre par utilisateur, en silence.

    Aucune exception n'est prévue : une phase qui n'aurait pas d'espace sous la
    main passe `workspace_id=None` explicitement — ce qui se LIT, alors qu'un
    argument absent ne se lit pas.
    """
    unscoped = [(f, ln, n) for f, ln, n, scoped in _scoped_retrieval_calls() if not scoped]
    assert unscoped == [], (
        "récupération RAG sans portée d'espace — la base de connaissance de l'équipe y est "
        "invisible : " + ", ".join(f"{f}:{ln} ({n})" for f, ln, n in unscoped)
    )
