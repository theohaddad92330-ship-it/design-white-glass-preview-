"""Unit tests for the native-Citations grounding helper.

The Anthropic call is mocked — these assert the bounding/guard logic (no docs,
no facts, doc/char caps, best-effort error swallowing), the cost passthrough, the
evidence-doc assembly, and — crucially — the positive path: when the cite docs
textually contain a fact, that fact gets an inhallucinable ``sourceRef`` (the
regression that caused ~0 citations on real runs).
"""

from __future__ import annotations

import pytest

from app.services import grounding_citations
from app.services.claude_service import TokenUsage

_FACTS = {"sector": "Édition de logiciels", "employees": "2800", "revenue": "300M€"}
_DOCS = [{"title": "doctolib.fr", "text": "Doctolib emploie 2800 salariés."}]


def _usage() -> TokenUsage:
    return TokenUsage(input_tokens=700, output_tokens=100, model="claude-sonnet-4-6", cost_usd=0.0036)


@pytest.mark.asyncio
async def test_no_documents_skips_call(monkeypatch):
    called = False

    async def _boom(*_a, **_k):
        nonlocal called
        called = True
        raise AssertionError("should not call Claude without documents")

    monkeypatch.setattr(grounding_citations, "call_claude_with_citations", _boom)
    citations, usage = await grounding_citations.cite_key_facts("Doctolib", _FACTS, [])
    assert citations == []
    assert usage is None
    assert called is False


@pytest.mark.asyncio
async def test_no_facts_skips_call(monkeypatch):
    async def _boom(*_a, **_k):
        raise AssertionError("should not call Claude without facts")

    monkeypatch.setattr(grounding_citations, "call_claude_with_citations", _boom)
    citations, usage = await grounding_citations.cite_key_facts("Doctolib", {}, _DOCS)
    assert citations == []
    assert usage is None


@pytest.mark.asyncio
async def test_returns_citations_and_usage(monkeypatch):
    seen: dict = {}

    async def _fake(system, question, docs, **kwargs):
        seen["docs"] = docs
        seen["question"] = question
        return "answer", [{"cited_text": "2800 salariés", "document_title": "doctolib.fr"}], _usage()

    monkeypatch.setattr(grounding_citations, "call_claude_with_citations", _fake)
    citations, usage = await grounding_citations.cite_key_facts("Doctolib", _FACTS, _DOCS)
    assert citations and citations[0]["cited_text"] == "2800 salariés"
    assert usage is not None and usage.cost_usd == pytest.approx(0.0036)
    # only the key facts present in the dict are sent
    assert "Édition de logiciels" in seen["question"]


@pytest.mark.asyncio
async def test_caps_docs_and_chars(monkeypatch):
    seen: dict = {}

    async def _fake(system, question, docs, **kwargs):
        seen["docs"] = docs
        return "answer", [], _usage()

    monkeypatch.setattr(grounding_citations, "call_claude_with_citations", _fake)
    big = [{"title": f"p{i}", "text": "x" * 9000} for i in range(10)]
    await grounding_citations.cite_key_facts("ACME", _FACTS, big)
    assert len(seen["docs"]) == grounding_citations._MAX_DOCS
    assert all(len(d["text"]) <= grounding_citations._MAX_DOC_CHARS for d in seen["docs"])


@pytest.mark.asyncio
async def test_error_is_swallowed(monkeypatch):
    async def _raise(*_a, **_k):
        raise RuntimeError("Anthropic 500")

    monkeypatch.setattr(grounding_citations, "call_claude_with_citations", _raise)
    citations, usage = await grounding_citations.cite_key_facts("Doctolib", _FACTS, _DOCS)
    assert citations == []
    assert usage is None


# ── Evidence assembly: registry doc + scrapes + news ──────────────────────────
#
# The registry-backed firmographics (revenue/employees/sector/headquarters) live
# in Pappers, NOT in the web scrapes — feeding the registry back as a citable doc
# is what lets the Citations pass source them (root cause of the 0-citation bug).

_REGISTRY_FACTS = {
    "siren": "552032534",
    "revenue": "300000000",
    "employees": "250 à 499 salariés",
    "headquarters": "12 rue de Rivoli, 75001 Paris",
    "sector": "Conseil en systèmes et logiciels informatiques",
    "legal_form": "SAS",
    "nafCode": "62.02A",
    "legalName": "ACME SAS",
    "businessDescription": "un long paragraphe de synthèse rédigé par le modèle",
}


def test_registry_evidence_doc_contains_the_facts():
    doc = grounding_citations.registry_evidence_doc(_REGISTRY_FACTS)
    assert doc is not None
    text = doc["text"]
    # Each registry-backed fact value appears verbatim → citable.
    assert "552032534" in text
    assert "300000000" in text
    assert "250 à 499 salariés" in text
    assert "12 rue de Rivoli, 75001 Paris" in text
    assert "Conseil en systèmes et logiciels informatiques" in text


def test_registry_evidence_doc_none_without_siren():
    # A web-only / homonym-rejected run has no siren → NO (dishonest) "registre
    # légal" document is fabricated from its web-derived values.
    assert grounding_citations.registry_evidence_doc({"revenue": "5000000"}) is None


def test_build_cite_docs_prepends_registry_then_scrapes_then_news():
    scraped = [{"title": "acme.fr", "text": "Nous sommes ACME."}]
    news = [{"title": "ACME lève 10M€", "description": "levée de fonds", "url": "https://x"}]
    docs = grounding_citations.build_cite_docs(_REGISTRY_FACTS, scraped, news=news)
    # Registry document first (so the _MAX_DOCS cap never drops the highest signal).
    # #4074 revient sur #2291.3 (18/09), délibérément — décision Louis 12/10 : aucune source ne se nomme.
    assert docs[0]["title"] == "Registre légal"
    assert any(d["title"] == "acme.fr" for d in docs)
    assert any("ACME lève 10M€" in d["text"] for d in docs)


def test_build_cite_docs_without_registry_keeps_scrapes():
    # No siren → no registry doc, but web scrapes still flow through.
    docs = grounding_citations.build_cite_docs({"revenue": "5000000"}, [{"title": "x", "text": "hello"}])
    assert docs == [{"title": "x", "text": "hello"}]


# ── Grounding v2 (always-on) ──────────────────────────────────────────────────

_V2_FACTS = {
    "sector": "Édition de logiciels",
    "employees": "2800",
    "revenue": "300M€",
    "headquarters": "Paris",
    "businessDescription": "logiciel de prise de rendez-vous santé",
}
_V2_DOCS = [{"title": "doctolib.fr", "text": "Doctolib emploie 2800 salariés et édite un logiciel de santé."}]


def test_extract_json_object_is_robust():
    # first '{' .. last '}' extracted even with prose / trailing text around it
    assert grounding_citations._extract_json_object('Voici: {"a": 1, "b": [2]} — fin') == {"a": 1, "b": [2]}
    # broken / non-JSON / empty → {} (never raises)
    assert grounding_citations._extract_json_object("no json here") == {}
    assert grounding_citations._extract_json_object("{ oops not json") == {}
    assert grounding_citations._extract_json_object("") == {}
    # a top-level JSON array is not an object → {}
    assert grounding_citations._extract_json_object("[1, 2, 3]") == {}


@pytest.mark.asyncio
async def test_grounding_v2_sources_registry_facts_end_to_end(monkeypatch):
    """POSITIVE PATH (regression guard): when the cite docs textually contain a
    fact, that fact gets a sourceRef and the KPI is met.

    This is exactly the scenario that returned 0 citations before the fix — the
    firmographic facts are registry values, so with only the web scrapes as
    documents there was nothing to cite. ``build_cite_docs`` now prepends the
    registry document, and the (mocked) Citations API lifts verbatim lines from
    it, so every fact is sourced.
    """
    cite_docs = grounding_citations.build_cite_docs(_REGISTRY_FACTS, scraped_docs=[])
    wanted = [_REGISTRY_FACTS[f] for f in ("siren", "revenue", "employees", "headquarters", "sector")]

    async def _fake(system, question, docs, **kwargs):
        # Faithful to the real Citations API: it returns cited_text lifted VERBATIM
        # from the supplied documents. Emit each doc line that carries a fact value.
        cits = []
        for i, d in enumerate(docs):
            for line in d["text"].splitlines():
                if any(w in line for w in wanted):
                    cits.append(
                        {"cited_text": line.strip(), "document_title": d["title"], "document_index": i}
                    )
        return "{}", cits, _usage()

    monkeypatch.setattr(grounding_citations, "call_claude_with_citations", _fake)
    grounding, usage = await grounding_citations.ground_facts_v2("ACME", _REGISTRY_FACTS, cite_docs)

    assert grounding is not None and usage is not None
    kpi = grounding["kpi"]
    assert kpi["factsConsidered"] == 5
    assert kpi["factsSourced"] == 5
    assert kpi["nonSourcedRatio"] == 0.0
    assert kpi["kpiMet"] is True
    for field in ("siren", "revenue", "employees", "headquarters", "sector"):
        assert grounding["sourceRefs"].get(field), f"{field} should be sourced from the registry doc"
    # businessDescription (a multi-sentence synthesis) is intentionally NOT a
    # grounded fact → never sinks the KPI.
    assert "businessDescription" not in grounding["sourceRefs"]


@pytest.mark.asyncio
async def test_grounding_v2_digit_grouping_matches_registry_integer(monkeypatch):
    """A registry integer (``300000000``) is sourced by a grouped-prose citation
    (``300 000 000 €``) — the digit-normalized matcher, not raw substring."""
    facts = {"revenue": "300000000"}
    docs = [{"title": "src", "text": "chiffre d'affaires 2023 : 300 000 000 €"}]

    async def _fake(system, question, docs, **kwargs):
        return "{}", [{"cited_text": "chiffre d'affaires 2023 : 300 000 000 €", "document_index": 0}], _usage()

    monkeypatch.setattr(grounding_citations, "call_claude_with_citations", _fake)
    grounding, _u = await grounding_citations.ground_facts_v2("ACME", facts, docs)
    assert grounding["sourceRefs"]["revenue"], "grouped digits should match the bare integer"
    assert grounding["kpi"]["kpiMet"] is True


@pytest.mark.asyncio
async def test_grounding_v2_attaches_inhallucinable_source_refs(monkeypatch):
    async def _fake(system, question, docs, **kwargs):
        # Non-structured JSON answer (Citations ⊥ Structured Outputs), with prose
        # around it so the robust first-{..last-} parse is exercised.
        answer = (
            'Analyse : {"facts": ['
            '{"field": "employees", "value": "2800", "supported": true, "quote": "Doctolib emploie 2800 salariés"},'
            '{"field": "sector", "value": "Édition de logiciels", "supported": true, "quote": "édite un logiciel"}'
            "]} — terminé"
        )
        # The API returns ONE verified citation (verbatim from the doc).
        citations = [
            {"cited_text": "Doctolib emploie 2800 salariés", "document_title": "doctolib.fr", "document_index": 0}
        ]
        return answer, citations, _usage()

    monkeypatch.setattr(grounding_citations, "call_claude_with_citations", _fake)
    grounding, usage = await grounding_citations.ground_facts_v2("Doctolib", _V2_FACTS, _V2_DOCS)

    assert grounding is not None and usage is not None
    assert grounding["flag"] == "GROUNDING_V2"
    # employees is corroborated by the verified citation → inhallucinable source_ref.
    assert grounding["sourceRefs"]["employees"][0]["citedText"] == "Doctolib emploie 2800 salariés"
    assert grounding["sourceRefs"]["employees"][0]["documentIndex"] == 0
    # sector's model quote ("édite un logiciel") matches NO verified citation → the
    # model's free text can't fabricate a source; sector stays non-sourced.
    assert "sector" not in grounding["sourceRefs"]
    # KPI is derived from the objective count over the concrete firmographics
    # (siren/revenue/employees/headquarters/sector). businessDescription is NOT a
    # grounded fact; siren is absent here → 4 considered.
    kpi = grounding["kpi"]
    assert kpi["factsConsidered"] == 4
    assert kpi["factsSourced"] == 1
    assert kpi["factsNonSourced"] == 3
    assert kpi["nonSourcedRatio"] == pytest.approx(0.75)
    assert kpi["targetMaxNonSourcedRatio"] == 0.05
    assert kpi["kpiMet"] is False


@pytest.mark.asyncio
async def test_grounding_v2_kpi_met_and_value_match_without_model_json(monkeypatch):
    facts = {"sector": "banque", "employees": "1000"}
    docs = [{"title": "src", "text": "activité banque, effectif 1000"}]

    async def _fake(system, question, docs, **kwargs):
        # Even with an EMPTY JSON body (no per-field quotes), value-matching against
        # the verified citations still sources both facts → grounding is driven by
        # the API's inhallucinable extracts, not the model's structured claims.
        citations = [
            {"cited_text": "activité : banque de détail", "document_title": "src", "document_index": 0},
            {"cited_text": "effectif de 1000 salariés", "document_title": "src", "document_index": 1},
        ]
        return "{}", citations, _usage()

    monkeypatch.setattr(grounding_citations, "call_claude_with_citations", _fake)
    grounding, _usage_out = await grounding_citations.ground_facts_v2("ACME", facts, docs)
    assert grounding["kpi"]["factsSourced"] == 2
    assert grounding["kpi"]["nonSourcedRatio"] == 0.0
    assert grounding["kpi"]["kpiMet"] is True
    assert grounding["sourceRefs"]["sector"][0]["citedText"] == "activité : banque de détail"
    assert grounding["sourceRefs"]["employees"][0]["citedText"] == "effectif de 1000 salariés"


@pytest.mark.asyncio
async def test_grounding_v2_no_docs_or_facts_skips_call(monkeypatch):
    async def _boom(*_a, **_k):
        raise AssertionError("should not call Claude with nothing to ground")

    monkeypatch.setattr(grounding_citations, "call_claude_with_citations", _boom)
    assert await grounding_citations.ground_facts_v2("X", _V2_FACTS, []) == (None, None)
    assert await grounding_citations.ground_facts_v2("X", {}, _V2_DOCS) == (None, None)


@pytest.mark.asyncio
async def test_grounding_v2_error_is_swallowed(monkeypatch):
    async def _raise(*_a, **_k):
        raise RuntimeError("Anthropic 500")

    monkeypatch.setattr(grounding_citations, "call_claude_with_citations", _raise)
    assert await grounding_citations.ground_facts_v2("Doctolib", _V2_FACTS, _V2_DOCS) == (None, None)
