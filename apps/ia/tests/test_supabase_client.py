"""Pooled Supabase REST client (app/services/supabase_client.py)."""

from __future__ import annotations

import httpx

from app.services import langfuse_client as lf
from app.services import supabase_client as sc


def test_reuses_a_single_pooled_http_client():
    client = sc.SupabaseREST("https://x.supabase.co", "key")
    # Every query shares the one pooled client — no fresh httpx.Client per call.
    assert isinstance(client._http, httpx.Client)
    q1 = client.table("accounts").select("*")
    q2 = client.table("contacts").select("*")
    assert q1._client._http is client._http
    assert q2._client._http is client._http


async def test_aexecute_offloads_execute_and_returns_its_result(monkeypatch):
    client = sc.SupabaseREST("https://x.supabase.co", "key")
    q = client.table("accounts").select("*")
    monkeypatch.setattr(q, "execute", lambda: sc.QueryResult(data=[{"id": "a"}], error=None))

    res = await q.aexecute()

    assert res.data == [{"id": "a"}]
    assert res.error is None


def test_execute_emits_a_db_span_distinct_from_the_tool_span(monkeypatch):
    """#2442.4 (épopée #2879) — le span manquant « connecteur/DB distinct de
    l'outil » : TOUTE requête Supabase passe par `TableQuery.execute()`, seul
    point de sortie mécanique commun à tous les outils. `db` doit apparaître
    dans le récapitulatif du tour, à côté de (jamais confondu avec) `tool:*`."""
    monkeypatch.setenv("LANGFUSE_PUBLIC_KEY", "pk-lf-test")
    monkeypatch.setenv("LANGFUSE_SECRET_KEY", "sk-lf-test")
    lf._reset_for_tests()
    try:
        client = sc.SupabaseREST("https://x.supabase.co", "key")
        q = client.table("accounts").select("*")

        class _FakeResponse:
            is_success = True
            text = "[]"

            def json(self):
                return []

        monkeypatch.setattr(client._http, "get", lambda *a, **kw: _FakeResponse())

        with lf.bind_trace("chat_turn", user_id="u-pseudo", session_id="cid-db", summarize=True):
            with lf.span("tool:search_contacts"):
                q.execute()
            lf.note_turn_status("ok")

        traces = [e["body"] for e in lf._pending_events() if e["type"] == "trace-create"]
        summary = traces[-1]["metadata"]["turn"]
        assert "db" in summary["stageMs"]
        assert [t["name"] for t in summary["tools"]] == ["search_contacts"]
    finally:
        lf._reset_for_tests()


def test_is_filter_matches_postgrest_is_operator():
    """Bug prod 27/09 : `rag_service.py` (recherche FTS/vector) et
    `dataforge_rag_chunks.py` (embedding) appellent `.is_(col, 'null')` sur
    chaque message — TableQuery ne l'implémentait pas (AttributeError, RAG
    replié en boucle sur ILIKE). `is_` est distinct de `eq` : PostgREST refuse
    `col=eq.null` pour NULL/booléens, il exige `col=is.null`/`is.true`."""
    client = sc.SupabaseREST("https://x.supabase.co", "key")
    q = client.table("rag_documents").select("*").is_("archived_at", "null")
    assert q._params["archived_at"] == "is.null"


def test_neq_filter_matches_postgrest_neq_operator():
    """Bug prod 27/09 : la purge RAG (`rag_service.py:882`) chaîne `.neq(...)`
    sur la même requête — absente elle aussi de TableQuery."""
    client = sc.SupabaseREST("https://x.supabase.co", "key")
    q = client.table("rag_documents").select("*").neq("scope", "knowledge_base")
    assert q._params["scope"] == "neq.knowledge_base"


def test_lt_filter_matches_postgrest_lt_operator():
    """Bug prod 27/09 : la même purge RAG chaîne `.lt("created_at", ...)` —
    absente elle aussi (seul `gte`/`lte` existaient)."""
    client = sc.SupabaseREST("https://x.supabase.co", "key")
    q = client.table("rag_documents").select("*").lt("created_at", "2026-01-01")
    assert q._params["created_at"] == "lt.2026-01-01"


def test_execute_hors_trace_ne_pose_aucun_span(monkeypatch):
    """Sans trace liée (appel hors tour de chat, ex. job async) : `span` est un
    no-op — `execute()` ne doit rien enfiler ni planter."""
    client = sc.SupabaseREST("https://x.supabase.co", "key")
    q = client.table("accounts").select("*")

    class _FakeResponse:
        is_success = True
        text = "[]"

        def json(self):
            return []

    monkeypatch.setattr(client._http, "get", lambda *a, **kw: _FakeResponse())

    result = q.execute()

    assert result.data == []


def test_contains_filter_matches_postgrest_cs_operator():
    # #4281.1 — les besoins historiques se filtrent par technologie (colonne text[]).
    q = sc.SupabaseREST("https://x.supabase.co", "key").table("dataforge_needs").select("*").contains(
        "technologies", ["SAP", "SALESFORCE"]
    )
    assert q._params["technologies"] == "cs.{SAP,SALESFORCE}"


def test_order_nulls_last_matches_postgrest_syntax():
    q = sc.SupabaseREST("https://x.supabase.co", "key").table("dataforge_needs").select("*")
    assert q.order("need_date", ascending=False, nulls_last=True)._params["order"] == "need_date.desc.nullslast"
    assert q.order("need_date", ascending=False)._params["order"] == "need_date.desc"
