"""RAG-knowledge v2 — the knowledge flywheel (populate + reranked retrieval).

Covers: distillation (deterministic, no-fake), populate upserts (mock repo),
retrieve+rerank ordering, the deterministic (key-free) rerank fallback, the
always-on LLM-lite rerank, the FT path with no embedding key, the ``rag_service``
upsert, and the graph-node populate wiring. Every path must no-op cleanly on its
own inputs (no user_id / empty store / ``is_enabled`` seam patched off).
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock

import pytest

from app.services import rag_knowledge, rag_service

# ── Sample analysis output ────────────────────────────────────────────────────


def _research() -> dict:
    return {
        "sector": "Banque",
        "businessDescription": "Banque de détail et de financement",
        "employees": "140 000",
        "revenue": "25 Md€",
        "headquarters": "Paris",
        "pains": [{"pain": "SI legacy fragmenté"}, {"pain": "Migration cloud lente"}],
        "itChallenges": ["Dette technique COBOL", "Conformité DORA"],
        "angles": [
            {"title": "Industrialisation DevOps", "rationale": "Usine logicielle hétérogène"},
            {"title": "Modernisation core banking"},
            {"title": ""},  # skipped — no title (no-fake)
        ],
    }


def _plan() -> dict:
    return {"actionPlan": {"strategy": "Entrer par la DSI groupe, sponsor C-level, POC 60 jours."}}


# ── is_enabled (always-on seam) ───────────────────────────────────────────────


def test_is_enabled_always_on() -> None:
    # The flywheel is always-on; the real off-switch is missing inputs (asserted
    # by the no-op tests below, which patch this seam to False).
    assert rag_knowledge.is_enabled() is True


# ── Distillation (deterministic, no-fake) ─────────────────────────────────────


def test_distill_builds_account_sector_and_angle_docs() -> None:
    docs = rag_knowledge._distill_docs("Société Générale", _research(), _plan())
    cats = [d["category"] for d in docs]
    assert cats.count(rag_knowledge.CATEGORY_ACCOUNT) == 1
    assert cats.count(rag_knowledge.CATEGORY_SECTOR) == 1
    # 2 real angles (the empty-title one is dropped) + the plan strategy headline.
    assert cats.count(rag_knowledge.CATEGORY_ANGLE) == 3

    account = next(d for d in docs if d["category"] == rag_knowledge.CATEGORY_ACCOUNT)
    assert "Société Générale" in account["title"]
    assert "Banque" in account["content"] and "25 Md€" in account["content"]

    sector = next(d for d in docs if d["category"] == rag_knowledge.CATEGORY_SECTOR)
    assert "SI legacy fragmenté" in sector["content"]
    assert "Dette technique COBOL" in sector["content"]


class TestAccessFactDistillation:
    """M4 — `access_fact`, la première des six catégories à avoir un ÉCRIVAIN.

    Les neuf catégories sont déclarées des deux côtés du fil depuis le 23/08 et
    six d'entre elles n'étaient produites par personne : un catalogue qu'aucun
    chemin ne remplit ne change rien à ce qu'une recherche remonte.

    `commentOuvrirCompte` est exactement l'objet que le §38 décrit sous
    `access_fact` (« ce qu'on sait de l'accès à un compte »), il est déjà dans
    la charge utile que le distillateur reçoit, et il était jeté.
    """

    def test_the_narrative_form_becomes_an_access_fact(self) -> None:
        research = {**_research(), "commentOuvrirCompte": "Entrer par un audit flash avant le référencement."}
        docs = rag_knowledge._distill_docs("Société Générale", research, _plan())
        access = [d for d in docs if d["category"] == rag_knowledge.CATEGORY_ACCESS]
        assert len(access) == 1
        assert "audit flash" in access[0]["content"]
        assert "Société Générale" in access[0]["title"]

    def test_the_structured_form_is_read_too(self) -> None:
        """Le champ arrive en DEUX formes dans la nature (union du contrat) :
        une narration, ou un objet `strategy` + `entry_points`. N'en lire qu'une
        rendrait la catégorie vide chez la moitié des comptes."""
        research = {
            **_research(),
            "comment_ouvrir_compte": {
                "strategy": "Passer par la filiale, pas par le siège.",
                "entry_points": [{"title": "Direction technique filiale"}, {"title": "Achats IT"}],
            },
        }
        docs = rag_knowledge._distill_docs("Société Générale", research, _plan())
        access = next(d for d in docs if d["category"] == rag_knowledge.CATEGORY_ACCESS)
        assert "filiale" in access["content"]
        assert "Direction technique filiale" in access["content"]

    def test_nothing_to_say_writes_nothing(self) -> None:
        """Pas de champ, un champ vide, une forme illisible → aucun document.
        On n'écrit pas une fiche d'accès qui dirait « Compte. »."""
        for value in (None, "", "   ", {}, {"strategy": ""}, 42, []):
            research = {**_research(), "commentOuvrirCompte": value}
            docs = rag_knowledge._distill_docs("Société Générale", research, _plan())
            assert [d for d in docs if d["category"] == rag_knowledge.CATEGORY_ACCESS] == [], value

    def test_the_three_historic_categories_are_unchanged(self) -> None:
        """La catégorie s'AJOUTE : aucun document n'a changé de nature."""
        research = {**_research(), "commentOuvrirCompte": "Entrer par un audit flash."}
        docs = rag_knowledge._distill_docs("Société Générale", research, _plan())
        cats = [d["category"] for d in docs]
        assert cats.count(rag_knowledge.CATEGORY_ACCOUNT) == 1
        assert cats.count(rag_knowledge.CATEGORY_SECTOR) == 1
        assert cats.count(rag_knowledge.CATEGORY_ANGLE) == 3


def test_distill_skips_missing_fields_no_fake() -> None:
    # Nothing usable in either payload → zero docs (never invents content).
    assert rag_knowledge._distill_docs("ACME", {}, {}) == []
    # Sector insight requires BOTH a sector and pains/challenges.
    assert rag_knowledge._distill_docs("ACME", {"pains": [{"pain": "x long enough"}]}, {}) == []


# ── populate_from_analysis ────────────────────────────────────────────────────


async def test_populate_noop_when_disabled(monkeypatch: pytest.MonkeyPatch) -> None:
    # is_enabled patched off (the monkeypatchable seam) → clean no-op, no upsert.
    monkeypatch.setattr(rag_knowledge, "is_enabled", lambda: False)
    upsert = AsyncMock()
    monkeypatch.setattr(rag_service, "upsert", upsert)
    written = await rag_knowledge.populate_from_analysis("SG", research=_research(), plan=_plan(), user_id="u1")
    assert written == 0
    upsert.assert_not_awaited()


async def test_populate_noop_without_user(monkeypatch: pytest.MonkeyPatch) -> None:
    upsert = AsyncMock()
    monkeypatch.setattr(rag_service, "upsert", upsert)
    assert await rag_knowledge.populate_from_analysis("SG", research=_research(), plan=_plan(), user_id="") == 0
    upsert.assert_not_awaited()


async def test_populate_upserts_each_distilled_doc(monkeypatch: pytest.MonkeyPatch) -> None:
    upsert = AsyncMock(return_value={"id": "x", "updated": False})
    monkeypatch.setattr(rag_service, "upsert", upsert)

    expected = rag_knowledge._distill_docs("SG", _research(), _plan())
    written = await rag_knowledge.populate_from_analysis("SG", research=_research(), plan=_plan(), user_id="u1")

    assert written == len(expected)
    # Each call carries (title, content, category, user_id) of a distilled doc.
    for call, doc in zip(upsert.await_args_list, expected, strict=True):
        title, content, category, user_id = call.args
        assert (title, content, category, user_id) == (doc["title"], doc["content"], doc["category"], "u1")


async def test_populate_is_best_effort_on_upsert_error(monkeypatch: pytest.MonkeyPatch) -> None:
    calls = {"n": 0}

    async def flaky_upsert(*_a, **_k):
        calls["n"] += 1
        if calls["n"] == 1:
            raise RuntimeError("supabase down")
        return {"id": "x"}

    monkeypatch.setattr(rag_service, "upsert", flaky_upsert)
    # Must NOT raise; counts only the docs that landed.
    written = await rag_knowledge.populate_from_analysis("SG", research=_research(), plan=_plan(), user_id="u1")
    total = len(rag_knowledge._distill_docs("SG", _research(), _plan()))
    assert written == total - 1


# ── retrieve_reranked_context ─────────────────────────────────────────────────


async def test_retrieve_noop_when_disabled(monkeypatch: pytest.MonkeyPatch) -> None:
    # is_enabled patched off → the store is never touched (clean no-op seam).
    monkeypatch.setattr(rag_knowledge, "is_enabled", lambda: False)
    query = AsyncMock()
    monkeypatch.setattr(rag_service, "query", query)
    assert await rag_knowledge.retrieve_reranked_context("SG banque", "u1") == ""
    query.assert_not_awaited()  # never even touches the store when disabled


async def test_retrieve_reranks_and_formats_top_docs(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("RAG_KNOWLEDGE_TOP_K", "2")
    # Force the key-free deterministic rerank (no unexpected Haiku call in a unit test).
    monkeypatch.setattr(rag_knowledge, "_llm_rerank_enabled", lambda: False)
    docs = [
        {"id": "1", "title": "Autre", "content": "recrutement marketing"},
        {"id": "2", "title": "Migration", "content": "migration cloud SAP pour la banque"},
        {"id": "3", "title": "Bruit", "content": "logistique entrepôt"},
    ]
    monkeypatch.setattr(rag_service, "query", AsyncMock(return_value=docs))
    ctx = await rag_knowledge.retrieve_reranked_context("migration cloud banque", "u1")
    assert "migration cloud SAP" in ctx  # the most-relevant doc surfaced
    assert "logistique" not in ctx  # capped at TOP_K=2, the irrelevant tail dropped


async def test_retrieve_degrades_to_empty_on_backend_error(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(rag_service, "query", AsyncMock(side_effect=RuntimeError("boom")))
    assert await rag_knowledge.retrieve_reranked_context("SG", "u1") == ""


# ── FT path with NO embedding key (end-to-end through rag_service.query) ───────


class _Res:
    def __init__(self, data, error=None):
        self.data = data
        self.error = error


class _FakeFtsQuery:
    def __init__(self, rows_by_op: dict):
        self._rows_by_op = rows_by_op
        self._op = None

    def select(self, *a, **k):
        return self

    def eq(self, *a, **k):
        return self

    def or_(self, *a, **k):  # #2779 — la visibilité par portée (hors sujet ici)
        return self

    def is_(self, *a, **k):  # #2431.5 — l'exclusion des documents archivés (hors sujet ici)
        return self

    def limit(self, *a, **k):
        return self

    def text_search(self, column, query, **k):
        self._op = f"fts:{column}"
        return self

    async def aexecute(self):
        return _Res(self._rows_by_op.get(self._op, []))


class _FakeFtsClient:
    def __init__(self, rows_by_op):
        self._rows_by_op = rows_by_op

    def table(self, name):
        return _FakeFtsQuery(self._rows_by_op)


async def test_retrieve_uses_ft_path_without_embedding_key(monkeypatch: pytest.MonkeyPatch) -> None:
    # No EMBEDDING_API_KEY → TextSearchFallback (FTS) is the backend (the key is
    # the only switch) and the whole retrieve→rerank→format chain still returns a block.
    monkeypatch.delenv("EMBEDDING_API_KEY", raising=False)
    rows = {"fts:content": [{"id": "1", "title": "SAP", "content": "migration cloud SAP"}]}
    monkeypatch.setattr(rag_service, "get_supabase", lambda: _FakeFtsClient(rows))
    ctx = await rag_knowledge.retrieve_reranked_context("migration cloud", "user-1")
    assert "migration cloud SAP" in ctx


# ── rerank cascade ────────────────────────────────────────────────────────────


async def test_rerank_deterministic_orders_by_overlap(monkeypatch: pytest.MonkeyPatch) -> None:
    # No cross-encoder model + LLM seam patched off → deterministic recency+overlap.
    monkeypatch.delenv("RAG_RERANK_CROSS_ENCODER", raising=False)
    monkeypatch.setattr(rag_knowledge, "_llm_rerank_enabled", lambda: False)
    docs = [
        {"id": "low", "title": "x", "content": "recrutement data marketing"},
        {"id": "high", "title": "x", "content": "migration cloud SAP banque"},
    ]
    ranked = await rag_knowledge.rerank("migration cloud banque", docs)
    assert [d["id"] for d in ranked] == ["high", "low"]


async def test_rerank_single_doc_returned_asis() -> None:
    assert await rag_knowledge.rerank("q", [{"id": "1"}]) == [{"id": "1"}]
    assert await rag_knowledge.rerank("q", []) == []


async def test_rerank_llm_path_when_available(monkeypatch: pytest.MonkeyPatch) -> None:
    # LLM rerank is always-on (no cross-encoder configured) → the Haiku pass runs.
    monkeypatch.delenv("RAG_RERANK_CROSS_ENCODER", raising=False)
    docs = [{"id": "0", "content": "a"}, {"id": "1", "content": "b"}, {"id": "2", "content": "c"}]
    # Model returns indices 2,0 (drops 1) → 1 is appended in original order (no loss).
    fake = AsyncMock(return_value=({"order": [2, 0]}, None))
    monkeypatch.setattr("app.services.claude_service.call_claude", fake)
    ranked = await rag_knowledge.rerank("q", docs)
    assert [d["id"] for d in ranked] == ["2", "0", "1"]
    fake.assert_awaited_once()


async def test_rerank_llm_falls_back_to_deterministic_on_error(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("RAG_RERANK_CROSS_ENCODER", raising=False)
    monkeypatch.setattr(
        "app.services.claude_service.call_claude", AsyncMock(side_effect=RuntimeError("api down"))
    )
    docs = [
        {"id": "low", "content": "logistique"},
        {"id": "high", "content": "migration cloud"},
    ]
    ranked = await rag_knowledge.rerank("migration cloud", docs)  # must not raise
    assert [d["id"] for d in ranked] == ["high", "low"]  # deterministic order


def test_recency_score_newer_beats_older() -> None:

    now = datetime.now(UTC)
    fresh = rag_knowledge._recency_score((now - timedelta(days=1)).isoformat())
    stale = rag_knowledge._recency_score((now - timedelta(days=365)).isoformat())
    assert fresh > stale
    assert rag_knowledge._recency_score(None) == 0.5  # unknown → neutral
    assert rag_knowledge._recency_score("not-a-date") == 0.5  # malformed → neutral


# ── rag_service.upsert (idempotent write) ─────────────────────────────────────


class _UpsertClient:
    def __init__(self, existing_rows):
        self._existing = existing_rows
        self.inserted = None
        self.updated = None

    def table(self, name):
        return self

    def select(self, *a, **k):
        return self

    def eq(self, *a, **k):
        return self

    def or_(self, *a, **k):  # #2779 — la visibilité par portée (hors sujet ici)
        return self

    def limit(self, *a, **k):
        return self

    def insert(self, data):
        self.inserted = data
        return _UpsertExec(_Res([{"id": "new-id"}]))

    def update(self, data):
        self.updated = data
        return _UpsertExec(_Res([{"id": "existing-id"}]))

    async def aexecute(self):
        return _Res(self._existing)


class _UpsertExec:
    def __init__(self, res):
        self._res = res

    def eq(self, *a, **k):
        return self

    def or_(self, *a, **k):  # #2779 — la visibilité par portée (hors sujet ici)
        return self

    async def aexecute(self):
        return self._res


async def test_upsert_inserts_when_absent(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("EMBEDDING_API_KEY", raising=False)
    client = _UpsertClient(existing_rows=[])
    monkeypatch.setattr(rag_service, "get_supabase", lambda: client)
    out = await rag_service.upsert("T", "C", "cat", "u1")
    assert out["updated"] is False and out["id"] == "new-id"
    assert client.inserted == {"user_id": "u1", "title": "T", "content": "C", "category": "cat"}
    assert client.updated is None


async def test_upsert_updates_when_present(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("EMBEDDING_API_KEY", raising=False)
    client = _UpsertClient(existing_rows=[{"id": "existing-id"}])
    monkeypatch.setattr(rag_service, "get_supabase", lambda: client)
    out = await rag_service.upsert("T", "C2", "cat", "u1")
    assert out["updated"] is True and out["id"] == "existing-id"
    # Update payload refreshes content but never rewrites user_id.
    assert client.updated == {"title": "T", "content": "C2", "category": "cat"}
    assert client.inserted is None


# ── Graph-node populate wiring ────────────────────────────────────────────────


async def test_plan_node_populates_the_flywheel(monkeypatch: pytest.MonkeyPatch) -> None:
    import app.graph.nodes as nodes
    from app.models.plan import PlanResponse

    plan_data = {"actionPlan": {"strategy": "S", "phases": []}}
    monkeypatch.setattr(nodes, "_plan", AsyncMock(return_value=PlanResponse(data=plan_data)))
    populate = AsyncMock(return_value=2)
    monkeypatch.setattr(nodes.rag_knowledge, "populate_from_analysis", populate)

    state = {
        "company_name": "SG",
        "user_id": "u1",
        "research": {"sector": "Banque"},
        "classified_contacts": [],
        "profile_data": {},
    }
    out = await nodes.plan_node(state)

    assert out["plan"] == plan_data
    populate.assert_awaited_once()
    kwargs = populate.await_args.kwargs
    assert populate.await_args.args[0] == "SG"
    assert kwargs["user_id"] == "u1"
    assert kwargs["research"] == {"sector": "Banque"}
    assert kwargs["plan"] == plan_data


# ── Le decay de fraîcheur (tome 7 §21.3, manque n°1) ────────────────────────


def _doc(title: str, created_at: str | None) -> dict:
    return {"title": title, "content": title, "created_at": created_at}


def _days_ago(days: int) -> str:
    """Une date RELATIVE à maintenant.

    ⚠️ Corrigé le 27/08/2026. Ces tests posaient « 2026-08-20 » en dur comme
    date fraîche, et la fraîcheur décroît sur une échelle de 90 jours : six
    jours plus tard, le départage basculait à **0,0001 près** et la suite
    devenait rouge sur `main` sans que personne n'ait touché au RAG.

    Un test qui dépend de l'horloge ne dit pas que le code est juste : il dit
    quel jour on l'a écrit. Le comportement mesuré ici — « à pertinence
    voisine, le plus frais passe devant » — n'a pas d'âge, et sa fixture ne doit
    pas en avoir non plus.
    """
    return (datetime.now(UTC) - timedelta(days=days)).isoformat().replace("+00:00", "Z")


def test_recency_breaks_a_tie_between_two_equally_ranked_documents() -> None:
    """« Un angle gagnant de 2024 remonte à égalité avec celui d'hier. »"""
    from app.services.rag_knowledge import apply_recency_decay

    ordered = apply_recency_decay([_doc("vieux", _days_ago(900)), _doc("frais", _days_ago(1))])
    assert [d["title"] for d in ordered] == ["frais", "vieux"]


def test_the_tiebreak_only_reaches_immediate_neighbours() -> None:
    """Ce que le départage peut RÉELLEMENT faire, mesuré plutôt que supposé.

    Le poids (0,25) et la décroissance de rang (0,3) impliquent qu'il faut un
    écart de fraîcheur d'environ **0,92 sur 1** pour qu'un document double son
    voisin immédiat — c'est-à-dire presque le maximum. Autant dire : entre deux
    documents datés de la même année, la fraîcheur ne départage rien.

    Ce test l'écrit noir sur blanc plutôt que de le laisser se découvrir un
    matin, à 0,0001 près, sur une suite devenue rouge toute seule. Le réglage
    n'est PAS changé ici : le tome 7 a mesuré qu'un ajustement RAG fait sans
    évaluation coûte 9,3 % de MRR.
    """
    from app.services.rag_knowledge import apply_recency_decay

    # Deux mois d'écart : trop peu pour renverser le rang.
    close = apply_recency_decay([_doc("premier", _days_ago(60)), _doc("second", _days_ago(1))])
    assert [d["title"] for d in close] == ["premier", "second"]


def test_recency_never_overturns_a_distant_relevance_gap() -> None:
    """La fraîcheur départage des VOISINS ; elle ne remonte pas le sixième."""
    from app.services.rag_knowledge import apply_recency_decay

    docs = [
        _doc("tres pertinent", _days_ago(900)),
        _doc("assez pertinent", _days_ago(900)),
        _doc("moyen", _days_ago(900)),
        _doc("faible", _days_ago(900)),
        _doc("tres faible mais frais", _days_ago(1)),
    ]
    ordered = apply_recency_decay(docs)
    assert ordered[0]["title"] == "tres pertinent"
    assert ordered[-1]["title"] != "tres faible mais frais"


def test_a_document_without_a_date_keeps_its_place() -> None:
    """L'absence de date n'est pas une preuve d'ancienneté."""
    from app.services.rag_knowledge import apply_recency_decay

    ordered = apply_recency_decay([_doc("sans date", None), _doc("date connue", _days_ago(1))])
    assert ordered[0]["title"] == "sans date"


def test_a_single_document_is_returned_untouched() -> None:
    from app.services.rag_knowledge import apply_recency_decay

    docs = [_doc("seul", None)]
    assert apply_recency_decay(docs) is docs


# ── retrieve_reranked_citations — l'étage de reclassement a enfin un appelant ──
#
# Item 86 du Recovery Pack : la fonction était écrite, testée nulle part, et son
# seul consommateur possible — le copilote — refaisait les trois gestes à la main
# en SAUTANT le reclassement. Les documents arrivaient donc au prompt dans
# l'ordre brut de la similarité, sans pondération de fraîcheur ni de secteur.


@pytest.mark.asyncio
async def test_citations_return_block_sources_and_docs(monkeypatch):
    """Trois éléments, et le troisième porte le contenu.

    Les sources ne portent ni contenu ni similarité ; l'objet de transparence du
    copilote a besoin des deux. Le lui reconstruire depuis les sources lui ferait
    annoncer « aucun document » alors que le RAG en a trouvé — le mensonge exact
    que cet objet existe pour empêcher."""
    marked: list[list[str]] = []

    async def _query(*a, **k):
        return [
            {"id": "d1", "title": "Playbook banque", "content": "chaîne de décision DSI"},
            {"id": "d2", "title": "REX cloud", "content": "migration réussie"},
        ]

    async def _mark(ids, feature):
        marked.append(list(ids))

    monkeypatch.setattr(rag_service, "query", _query)
    monkeypatch.setattr(rag_service, "mark_documents_used", _mark)

    block, sources, docs = await rag_knowledge.retrieve_reranked_citations("migration banque", "u1")

    assert "chaîne de décision DSI" in block
    assert [s["docId"] for s in sources] == ["d1", "d2"]
    # Les DOCUMENTS, avec leur contenu — ce que les sources ne portent pas.
    assert [d["content"] for d in docs] == ["chaîne de décision DSI", "migration réussie"]
    # La trace est posée UNE fois, sur ce qui a atteint le prompt.
    assert marked == [["d1", "d2"]]


@pytest.mark.asyncio
async def test_citations_degrade_to_three_empties(monkeypatch):
    """Une récupération en échec ne casse jamais l'appelant — et rend TROIS
    valeurs, pas deux : un appelant qui déballerait deux éléments lèverait."""

    async def _boom(*a, **k):
        raise RuntimeError("supabase down")

    monkeypatch.setattr(rag_service, "query", _boom)
    assert await rag_knowledge.retrieve_reranked_citations("q", "u1") == ("", [], [])
    # Sans utilisateur ni question, on ne cherche même pas.
    assert await rag_knowledge.retrieve_reranked_citations("q", "") == ("", [], [])
    assert await rag_knowledge.retrieve_reranked_citations("  ", "u1") == ("", [], [])


# ── #3881 (lot V13, recette prod 08/10) — le filtre de SORTIE ───────────────
#
# X07 a fermé l'INGESTION (`ingestion_guard._internal_codename_refusal`) :
# aucun NOUVEAU dépôt nommé d'après un codename interne n'entre plus dans
# `rag_documents`. La recette prod du 08/10 a montré le trou qui restait : un
# document déjà en base AVANT ce correctif (« mémoire interne data forge » →
# 3 sources nommées STELYA…zip, ORION_DATAPACK_V12…zip, CRM BASE DE DONNÉES
# BELLUMAI) traverse toujours la récupération et devient une citation visible
# au client. Le filtre doit donc tenir à la SORTIE aussi, pas seulement à
# l'entrée — défense en profondeur, jamais remplacée par une purge manuelle.


@pytest.mark.asyncio
async def test_citations_never_cite_a_document_named_after_an_internal_codename(monkeypatch):
    marked: list[list[str]] = []

    async def _query(*a, **k):
        return [
            {"id": "poisoned", "title": "STELYA_SOMETHING_FINAL (2).zip", "content": "contenu interne Bellum"},
            {"id": "ok", "title": "Playbook banque", "content": "chaîne de décision DSI"},
        ]

    async def _mark(ids, feature):
        marked.append(list(ids))

    monkeypatch.setattr(rag_service, "query", _query)
    monkeypatch.setattr(rag_service, "mark_documents_used", _mark)

    block, sources, docs = await rag_knowledge.retrieve_reranked_citations("mémoire interne data forge", "u1")

    assert "STELYA" not in block
    assert "contenu interne Bellum" not in block
    assert [s["docId"] for s in sources] == ["ok"]
    assert [d.get("id") for d in docs] == ["ok"]
    # La trace d'usage (M2) ne compte jamais le document écarté.
    assert marked == [["ok"]]


@pytest.mark.asyncio
async def test_citations_drop_every_internal_codename_known_from_the_prod_incident(monkeypatch):
    """Les trois noms vus en recette prod (08/10), pas seulement DataForge."""
    for poisoned_title in (
        "STELYA_SOMETHING.zip",
        "ORION_DATAPACK_V12_FINAL.zip",
        "CRM BASE DE DONNÉES BELLUMAI.xlsx",
    ):

        async def _query(*a, title=poisoned_title, **k):
            return [{"id": "poisoned", "title": title, "content": "contenu interne"}]

        async def _mark(*a, **k):
            return None

        monkeypatch.setattr(rag_service, "query", _query)
        monkeypatch.setattr(rag_service, "mark_documents_used", _mark)

        block, sources, docs = await rag_knowledge.retrieve_reranked_citations("q", "u1")
        assert block == "", poisoned_title
        assert sources == [], poisoned_title
        assert docs == [], poisoned_title


# ── #3887 (lot V13, recette prod 08/10) — nommer un compte en texte libre ───
#
# « qu'est-ce qu'on sait déjà de Sanofi » en chat « espace entier » (aucun
# fil ancré) ne retrouvait jamais les documents du compte : rien ne
# rapprochait le nom cité d'un `account_id`, contrairement à
# `search_market_memory` qui a ce mécanisme depuis #3225.


def test_capitalized_runs_reads_proper_noun_candidates_in_order():
    from app.services.rag_knowledge import _capitalized_runs

    assert _capitalized_runs("qu'est-ce qu'on sait déjà de Sanofi pour préparer mon approche") == [["Sanofi"]]
    assert _capitalized_runs("et La Poste Mobile, en Île-de-France ?") == [
        ["La", "Poste", "Mobile"],
        ["Île-de-France"],
    ]
    assert _capitalized_runs("rien à voir ici") == []


@pytest.mark.asyncio
async def test_resolve_message_account_id_finds_the_single_named_account(monkeypatch):
    from app.services import chat_tools

    async def _named_like(company, user_id):
        assert user_id == "u1"
        return [{"id": "acc-sanofi", "company_name": "Sanofi"}] if "Sanofi" in company else []

    monkeypatch.setattr(chat_tools, "_accounts_named_like", _named_like)

    resolved = await rag_knowledge.resolve_message_account_id(
        "qu'est-ce qu'on sait déjà de Sanofi pour préparer mon approche", "u1"
    )
    assert resolved == "acc-sanofi"


@pytest.mark.asyncio
async def test_resolve_message_account_id_never_guesses_on_an_ambiguous_name(monkeypatch):
    from app.services import chat_tools

    async def _named_like(company, user_id):
        return [
            {"id": "acc-1", "company_name": "Sanofi"},
            {"id": "acc-2", "company_name": "Sanofi"},
        ]

    monkeypatch.setattr(chat_tools, "_accounts_named_like", _named_like)

    assert await rag_knowledge.resolve_message_account_id("des nouvelles de Sanofi ?", "u1") is None


@pytest.mark.asyncio
async def test_resolve_message_account_id_falls_back_to_a_shorter_prefix(monkeypatch):
    """« La Poste Mobile » (nom trop long) retombe sur « La Poste », le nom réel."""
    from app.services import chat_tools

    async def _named_like(company, user_id):
        if company == "La Poste":
            return [{"id": "acc-poste", "company_name": "La Poste"}]
        return []

    monkeypatch.setattr(chat_tools, "_accounts_named_like", _named_like)

    resolved = await rag_knowledge.resolve_message_account_id("un point sur La Poste Mobile cette semaine", "u1")
    assert resolved == "acc-poste"


@pytest.mark.asyncio
async def test_resolve_message_account_id_degrades_cleanly(monkeypatch):
    from app.services import chat_tools

    assert await rag_knowledge.resolve_message_account_id("", "u1") is None
    assert await rag_knowledge.resolve_message_account_id("Sanofi", "") is None
    assert await rag_knowledge.resolve_message_account_id("rien de capitalisé ici", "u1") is None

    async def _boom(company, user_id):
        raise RuntimeError("db down")

    monkeypatch.setattr(chat_tools, "_accounts_named_like", _boom)
    assert await rag_knowledge.resolve_message_account_id("Sanofi", "u1") is None

