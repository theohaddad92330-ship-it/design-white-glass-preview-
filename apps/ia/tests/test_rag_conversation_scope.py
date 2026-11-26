"""#1954.7 — un document joint au chat sert au FIL, pas à l'espace entier.

Le défaut (éclaireur, re-vérifié) : chaque pièce jointe du chat était ingérée
EN SILENCE dans la base de connaissance DURABLE de tout l'espace
(`rag.controller.ts` → `useIngestRagDocument`, le même hook que `/knowledge`),
et « retirer avant envoi » ne supprimait pas le document. Décision de Louis
(12/09/2026) : un document joint sert au FIL par défaut (`scope = "conversation"`) ;
il n'entre dans la base de l'ESN (`scope = "workspace"`) que sur un choix EXPLICITE.

Ce fichier pin la moitié service de la garantie de cloisonnement — trois
lectures, chacune prouvée dans les deux sens :

  * `fetch_documents_by_ids` (le tour de chat COURANT) lit un document
    `workspace` toujours, un document `conversation` SEULEMENT dans SON fil ;
  * la récupération générale (`TextSearchFallback`, donc `rag_service.query`,
    `retrieve_knowledge_context` — chat ordinaire ET analyse de compte)
    n'atteint JAMAIS un document `conversation`, même dans son propre espace ;
  * l'écriture (`ingest`) écrit la portée d'un document de fil (le chemin par
    défaut n'écrit rien : la colonne vaut `workspace`), et refuse PRÉALABLEMENT
    un `scope="conversation"` sans fil.

`test_rag_workspace_scope.py` pin déjà la portée d'ESPACE ; celui-ci pin l'axe
ORTHOGONAL ouvert par cette décision — les deux cohabitent (aucune ligne de
fixture n'y est changée).
"""

from __future__ import annotations

import ast
from pathlib import Path

from app.services import rag_service
from app.services.rag_service import TextSearchFallback
from tests.rag_visibility_fake import is_visibility_filter, visibility_predicate

WS_A = "11111111-1111-1111-1111-111111111111"
ALICE = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"
THREAD_A = "thread-A"
THREAD_B = "thread-B"

ROWS = [
    {
        "id": "w-doc",
        "user_id": ALICE,
        "workspace_id": WS_A,
        "scope": "workspace",
        "conversation_id": None,
        "title": "Playbook négociation",
        "content": "migration cloud playbook",
        "category": "ref",
    },
    {
        "id": "conv-doc-a",
        "user_id": ALICE,
        "workspace_id": WS_A,
        "scope": "conversation",
        "conversation_id": THREAD_A,
        "title": "CV joint au fil A",
        "content": "migration cloud cv candidat",
        "category": "",
    },
    {
        "id": "conv-doc-b",
        "user_id": ALICE,
        "workspace_id": WS_A,
        "scope": "conversation",
        "conversation_id": THREAD_B,
        "title": "CV joint au fil B",
        "content": "migration cloud cv autre",
        "category": "",
    },
]


class _Res:
    def __init__(self, data, error=None):
        self.data = data
        self.error = error


class _FakeQuery:
    """In-memory PostgREST — comportemental, pas un match de chaîne : applique
    les prédicats réels posés par le service, comme `test_rag_workspace_scope.py`."""

    def __init__(self, rows: list[dict]):
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

    def order(self, column, ascending=True, **k):
        """La forme du client de ce dépôt : `.order("created_at", ascending=False)`."""
        self._order = (column, not ascending)
        return self

    def or_(self, expression: str):
        """Seule la forme émise par `_scope` : `workspace_id.eq.<ws>,and(workspace_id.is.null,user_id.eq.<uid>)`."""
        if is_visibility_filter(expression):  # #2779 — la visibilité par portée
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
        out = [r for r in self._rows if all(p(r) for p in self._preds)]
        order = getattr(self, "_order", None)
        if order:
            column, desc = order
            out = sorted(out, key=lambda r: str(r.get(column) or ""), reverse=desc)
        return _Res(out[: self._limit])


class _FakeClient:
    def __init__(self, rows):
        self._rows = rows

    def table(self, name):
        return _FakeQuery(self._rows)


def _install(monkeypatch, rows=ROWS):
    monkeypatch.setattr(rag_service, "get_supabase", lambda: _FakeClient(rows))


# ─────────────────────────────────────────────────────────────────────────
# fetch_documents_by_ids — les pièces jointes du tour de chat COURANT
# ─────────────────────────────────────────────────────────────────────────


async def test_fetch_by_ids_always_reads_a_workspace_document(monkeypatch):
    _install(monkeypatch)
    docs = await rag_service.fetch_documents_by_ids(["w-doc"], ALICE, workspace_id=WS_A)
    assert {d["id"] for d in docs} == {"w-doc"}


async def test_fetch_by_ids_reads_a_conversation_document_of_its_OWN_thread(monkeypatch):
    _install(monkeypatch)
    docs = await rag_service.fetch_documents_by_ids(["conv-doc-a"], ALICE, workspace_id=WS_A, conversation_id=THREAD_A)
    assert {d["id"] for d in docs} == {"conv-doc-a"}


async def test_fetch_by_ids_NEVER_reads_a_conversation_document_of_ANOTHER_thread(monkeypatch):
    """Le cœur de la garantie de cloisonnement : le fil A ne lit jamais la
    pièce jointe du fil B, même en connaissant son identifiant. (Il relit en
    revanche SES propres documents — #1954, la question suivante.)"""
    _install(monkeypatch)
    docs = await rag_service.fetch_documents_by_ids(["conv-doc-b"], ALICE, workspace_id=WS_A, conversation_id=THREAD_A)
    ids = [d["id"] for d in docs]
    assert "conv-doc-b" not in ids
    assert ids == ["conv-doc-a"]


async def test_fetch_by_ids_NEVER_reads_a_colleagues_attachment_on_a_thread_with_the_same_id(monkeypatch):
    """Les identifiants de fil sont DÉTERMINISTES (`general`, `account-<uuid>` —
    `chatSchema.conversationId`) : deux collègues du même espace ouvrent le
    « même » fil sur le même compte. Un document joint au fil d'Alice ne sert
    qu'à SON fil — Bob ne le lit pas, même en envoyant son identifiant
    (`document_ids` vient du client). Le document `workspace`, lui, reste lu
    par toute l'équipe, comme avant."""
    _install(monkeypatch)
    bob = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"
    docs = await rag_service.fetch_documents_by_ids(["conv-doc-a"], bob, workspace_id=WS_A, conversation_id=THREAD_A)
    assert docs == []
    shared = await rag_service.fetch_documents_by_ids(["w-doc"], bob, workspace_id=WS_A, conversation_id=THREAD_A)
    assert {d["id"] for d in shared} == {"w-doc"}


async def test_fetch_by_ids_fails_closed_without_a_conversation_id(monkeypatch):
    """Sans `conversation_id` — la route MCP, un client ancien, ou un fil RANGÉ
    (NestJS ne le transmet pas, `ChatThreadDocumentsService.readableThread`) —
    un document `conversation`, même le SIEN, reste invisible : jamais un
    « widening » silencieux à toute la portée."""
    _install(monkeypatch)
    docs = await rag_service.fetch_documents_by_ids(["conv-doc-a"], ALICE, workspace_id=WS_A)
    assert docs == []
    # ...et un document `workspace` reste, lui, lisible sans changement.
    docs2 = await rag_service.fetch_documents_by_ids(["w-doc"], ALICE, workspace_id=WS_A)
    assert {d["id"] for d in docs2} == {"w-doc"}


async def test_fetch_by_ids_mixes_workspace_and_own_conversation_documents(monkeypatch):
    """Un tour de chat joint souvent les deux à la fois — l'ordre demandé par
    l'utilisateur est préservé."""
    _install(monkeypatch)
    docs = await rag_service.fetch_documents_by_ids(
        ["conv-doc-a", "w-doc"], ALICE, workspace_id=WS_A, conversation_id=THREAD_A
    )
    assert [d["id"] for d in docs] == ["conv-doc-a", "w-doc"]


# ─────────────────────────────────────────────────────────────────────────
# #1954 — « un document sert à LA CONVERSATION » : les questions SUIVANTES
# du fil le relisent, sans que le navigateur renvoie ses identifiants.
# ─────────────────────────────────────────────────────────────────────────

WS_B = "22222222-2222-2222-2222-222222222222"
BOB = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"


def _thread_row(doc_id, created_at, *, scope="conversation", thread=THREAD_A, ws=WS_A, user=ALICE):
    return {
        "id": doc_id,
        "user_id": user,
        "workspace_id": ws,
        "scope": scope,
        "conversation_id": thread,
        "title": f"Titre {doc_id}",
        "content": f"contenu {doc_id}",
        "category": "chat",
        "created_at": created_at,
    }


THREAD_ROWS = [
    _thread_row("a-1", "2026-09-12T09:00:00Z"),
    _thread_row("a-2", "2026-09-12T10:00:00Z"),
    _thread_row("b-1", "2026-09-12T11:00:00Z", thread=THREAD_B),
    # Même clé de fil, AUTRE espace : jamais lu.
    _thread_row("ws-b-meme-cle", "2026-09-12T12:00:00Z", ws=WS_B, user=BOB),
    # Un document de l'ESN qui porterait la même clé : il n'est pas un document de fil.
    _thread_row("base-meme-cle", "2026-09-12T13:00:00Z", scope="workspace"),
]


async def test_a_later_question_rereads_its_thread_documents_without_any_id(monkeypatch):
    """Le tour suivant n'envoie aucun identifiant : le filtre par fil suffit."""
    _install(monkeypatch, THREAD_ROWS)
    docs = await rag_service.fetch_documents_by_ids([], ALICE, workspace_id=WS_A, conversation_id=THREAD_A)
    assert [d["id"] for d in docs] == ["a-2", "a-1"]


async def test_NON_a_later_question_never_reads_another_thread_another_workspace_or_a_base_document(monkeypatch):
    """Preuve que le test sait dire NON : retirer `.eq("conversation_id", …)`
    fait entrer « b-1 » ; retirer `_scope` fait entrer « ws-b-meme-cle » ;
    retirer `.eq("scope", "conversation")` fait entrer « base-meme-cle »."""
    _install(monkeypatch, THREAD_ROWS)
    ids = {
        d["id"]
        for d in await rag_service.fetch_documents_by_ids([], ALICE, workspace_id=WS_A, conversation_id=THREAD_A)
    }
    assert ids == {"a-1", "a-2"}
    assert not ids & {"b-1", "ws-b-meme-cle", "base-meme-cle"}


async def test_NON_a_later_question_never_rereads_a_COLLEAGUES_attachment_on_the_same_thread_key(monkeypatch):
    """La relecture par fil (#1954) ne rouvre pas ce que le filtre auteur de
    #1954.7 ferme : les clés de fil sont DÉTERMINISTES (`general`,
    `account-<uuid>`), donc Bob pose ses questions dans le « même » fil
    qu'Alice. Sans identifiant, le filtre par fil seul lui rendait « a-1 » et
    « a-2 » — les pièces jointes d'Alice, en entier, dans le prompt de Bob.
    Preuve que le test sait dire NON : retirer `.eq("user_id", user_id)` de la
    requête par fil fait entrer « a-1 » et « a-2 » ci-dessous."""
    rows = THREAD_ROWS + [_thread_row("bob-1", "2026-09-12T16:00:00Z", user=BOB)]
    _install(monkeypatch, rows)
    ids = [d["id"] for d in await rag_service.fetch_documents_by_ids([], BOB, workspace_id=WS_A, conversation_id=THREAD_A)]
    assert ids == ["bob-1"]
    assert not set(ids) & {"a-1", "a-2"}


async def test_NON_an_archived_thread_reads_nothing_and_sends_no_request(monkeypatch):
    """Un fil RANGÉ ne transmet pas sa clé (NestJS) : sans identifiant ni fil,
    aucune requête ne part."""
    calls: list = []

    def _boom():
        calls.append("get_supabase")
        raise AssertionError("aucune requête ne doit partir")

    monkeypatch.setattr(rag_service, "get_supabase", _boom)
    assert await rag_service.fetch_documents_by_ids([], ALICE, workspace_id=WS_A, conversation_id=None) == []
    assert calls == []


async def test_the_documents_of_this_message_come_first_then_the_most_recent_of_the_thread_within_budget(monkeypatch):
    """Le budget reste `ATTACHED_DOC_MAX` : ce que la personne joint MAINTENANT
    passe devant, puis les plus récents du fil."""
    rows = THREAD_ROWS + [
        _thread_row("a-3", "2026-09-12T14:00:00Z"),
        _thread_row("a-4", "2026-09-12T15:00:00Z"),
        {**ROWS[0]},
    ]
    _install(monkeypatch, rows)
    docs = await rag_service.fetch_documents_by_ids(["w-doc"], ALICE, workspace_id=WS_A, conversation_id=THREAD_A)
    assert [d["id"] for d in docs] == ["w-doc", "a-4", "a-3"]
    assert len(docs) == rag_service.ATTACHED_DOC_MAX


async def test_the_guard_can_say_no(monkeypatch):
    """Preuve que le test sait dire NON : retirer le filtre de fil (repasser à
    `_scope`, sans le `.eq("scope", "conversation").eq("conversation_id", …)`)
    ferait fuir `conv-doc-b` dans le fil A. On le vérifie en appelant
    directement l'ancien comportement (avant #1954.7) sur les mêmes données —
    `_scope` seul ne connaît pas la notion de fil."""
    _install(monkeypatch)
    sb = rag_service.get_supabase()
    # Ce que ferait un filtre qui ne connaîtrait QUE le tenant (l'ancien code) :
    leaked = (
        await rag_service._scope(sb.table("rag_documents").select("id"), ALICE, WS_A)
        .in_("id", ["conv-doc-b"])
        .aexecute()
    )
    assert {r["id"] for r in leaked.data} == {"conv-doc-b"}, "témoin : sans le filtre de fil, le document fuit"


# ─────────────────────────────────────────────────────────────────────────
# Récupération générale — jamais un document `conversation`, même le sien
# ─────────────────────────────────────────────────────────────────────────


async def test_general_fts_search_never_returns_a_conversation_document(monkeypatch):
    """Ni le RAG d'une analyse de compte, ni `/rag-documents/query`, ni la
    récupération ordinaire du chat (`retrieve_reranked_citations`) ne doivent
    grounder sur un fichier joint — même dans le MÊME espace."""
    monkeypatch.delenv("EMBEDDING_API_KEY", raising=False)
    _install(monkeypatch)
    docs = await TextSearchFallback().query("migration cloud", ALICE, top_k=10, workspace_id=WS_A)
    ids = {d["id"] for d in docs}
    assert "w-doc" in ids
    assert "conv-doc-a" not in ids
    assert "conv-doc-b" not in ids


async def test_general_ilike_degradation_also_excludes_conversation_documents(monkeypatch):
    monkeypatch.delenv("EMBEDDING_API_KEY", raising=False)
    _install(monkeypatch)
    docs = await TextSearchFallback()._ilike("migration cloud", ALICE, top_k=10, workspace_id=WS_A)
    ids = {d["id"] for d in docs}
    assert "w-doc" in ids
    assert "conv-doc-a" not in ids and "conv-doc-b" not in ids


async def test_retrieve_knowledge_context_never_grounds_on_an_attached_file(monkeypatch):
    """Bout en bout : le bloc de prompt qu'une analyse de compte reçoit
    vraiment."""
    monkeypatch.delenv("EMBEDDING_API_KEY", raising=False)
    _install(monkeypatch)
    block = await rag_service.retrieve_knowledge_context("migration cloud", ALICE, top_k=10, workspace_id=WS_A)
    assert "Playbook négociation" in block
    assert "CV joint" not in block


# ─────────────────────────────────────────────────────────────────────────
# Écriture — ingest() stampe la portée, refuse PRÉALABLEMENT ce qui manque
# ─────────────────────────────────────────────────────────────────────────


class _CapturingQuery(_FakeQuery):
    def __init__(self, rows, sink):
        super().__init__(rows)
        self._sink = sink

    def insert(self, data):
        self._sink.append(("insert", data))
        self._rows = [data]
        return self


class _CapturingClient(_FakeClient):
    def __init__(self, rows, sink):
        super().__init__(rows)
        self._sink = sink

    def table(self, name):
        return _CapturingQuery(self._rows, self._sink)


async def test_ingest_defaults_to_workspace_scope_byte_identical_to_before(monkeypatch):
    monkeypatch.delenv("EMBEDDING_API_KEY", raising=False)
    sink: list = []
    monkeypatch.setattr(rag_service, "get_supabase", lambda: _CapturingClient([], sink))
    await rag_service.ingest("Titre", "corps", "ref", ALICE, workspace_id=WS_A)
    written = next(d for op, d in sink if op == "insert")
    # La clé est OMISE : la colonne vaut `workspace` par défaut en base
    # (migration 1792800004817). L'écrire explicitement ferait échouer TOUT
    # dépôt dans la fenêtre où le service IA est déployé avant que la
    # migration de l'API (preDeployCommand) ait tourné — « column scope does
    # not exist » sur `/knowledge`, pour un chemin qui n'a rien demandé.
    assert "scope" not in written
    assert "conversation_id" not in written


async def test_ingest_stamps_conversation_scope_and_thread(monkeypatch):
    monkeypatch.delenv("EMBEDDING_API_KEY", raising=False)
    sink: list = []
    monkeypatch.setattr(rag_service, "get_supabase", lambda: _CapturingClient([], sink))
    await rag_service.ingest(
        "CV", "corps", "", ALICE, workspace_id=WS_A, scope="conversation", conversation_id=THREAD_A
    )
    written = next(d for op, d in sink if op == "insert")
    assert written["scope"] == "conversation"
    assert written["conversation_id"] == THREAD_A


async def test_ingest_refuses_conversation_scope_without_a_thread_BEFORE_any_request(monkeypatch):
    """Le refus est PRÉALABLE — même arbitrage que `_refuse_unless_knowledge` :
    rien ne part si `conversation_id` manque."""
    monkeypatch.delenv("EMBEDDING_API_KEY", raising=False)
    calls: list = []

    def _boom():
        calls.append("get_supabase")
        raise AssertionError("aucune requête ne doit partir")

    monkeypatch.setattr(rag_service, "get_supabase", _boom)
    try:
        await rag_service.ingest("CV", "corps", "", ALICE, workspace_id=WS_A, scope="conversation")
        raised = False
    except ValueError:
        raised = True
    assert raised
    assert calls == []


# ─────────────────────────────────────────────────────────────────────────
# Le point EXACT où le chat récupère le contexte RAG — l'appelant, pas
# seulement la fonction (« du code juste, calculé, testé, que personne
# n'appelle » — le motif n°1 de ce dépôt). Lu à l'AST, pas à l'expression
# régulière : le même motif que `test_rag_workspace_scope.py`.
# ─────────────────────────────────────────────────────────────────────────


def test_chat_py_passes_conversation_id_to_fetch_documents_by_ids():
    """Sans ce mot-clé, `req.conversation_id` (`ChatRequest`, #1954.7) ne sert
    à rien : `fetch_documents_by_ids` retomberait en silence sur son défaut
    (`conversation_id=None`), et AUCUN document `conversation` ne serait plus
    jamais lisible — même dans son propre fil — le jour où NestJS commence à
    l'envoyer. C'est le paramètre déclaré, jamais passé."""
    path = Path(__file__).resolve().parent.parent / "app" / "routers" / "chat.py"
    tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
    calls = [
        node
        for node in ast.walk(tree)
        if isinstance(node, ast.Call)
        and (
            (isinstance(node.func, ast.Attribute) and node.func.attr == "fetch_documents_by_ids")
            or (isinstance(node.func, ast.Name) and node.func.id == "fetch_documents_by_ids")
        )
    ]
    assert len(calls) == 1, f"corpus suspect : {len(calls)} appel(s) trouvé(s)"
    call = calls[0]
    assert any(kw.arg == "conversation_id" for kw in call.keywords), (
        "chat.py appelle fetch_documents_by_ids sans conversation_id — "
        "un document `conversation` ne serait plus jamais lisible, même dans son propre fil"
    )


async def test_ingest_rejects_an_unknown_scope_value_by_falling_back_to_workspace(monkeypatch):
    """Jamais une valeur hors énumération écrite en base — la contrainte SQL le
    refuserait de toute façon, mais le service ne doit pas compter dessus
    seule (défense en profondeur, même logique que `origin`)."""
    monkeypatch.delenv("EMBEDDING_API_KEY", raising=False)
    sink: list = []
    monkeypatch.setattr(rag_service, "get_supabase", lambda: _CapturingClient([], sink))
    await rag_service.ingest("Titre", "corps", "ref", ALICE, workspace_id=WS_A, scope="espace-inconnu")
    written = next(d for op, d in sink if op == "insert")
    # Retombe sur `workspace`, c'est-à-dire sur le DÉFAUT de la colonne : la
    # clé n'est pas écrite (voir le test du chemin par défaut plus haut).
    assert "scope" not in written
    assert "conversation_id" not in written
