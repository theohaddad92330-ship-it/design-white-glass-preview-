"""Vocabulaire du groupe — grille de lecture par compte, tag déterministe (slice 1)."""

from __future__ import annotations

from app.models.outputs.vocabulary import VOCAB_KINDS, VocabularyTerm
from app.services.account_vocabulary import build_vocabulary, enrich_vocabulary


def _by_term(vocab: dict) -> dict:
    return {t["term"]: t for t in vocab["terms"]}


# ── kind is coerced to the allowed set (DB CHECK safety, QONTO incident) ──────
def test_vocabulary_term_coerces_out_of_set_kind():
    # An LLM-emitted nature outside VOCAB_KINDS must DEGRADE to "acronym", never
    # flow through raw (the API would then violate account_vocabulary_kind_check).
    assert VocabularyTerm(term="RGPD", kind="regulation").kind == "acronym"
    assert VocabularyTerm(term="Marché", kind="MARKET").kind == "acronym"
    assert VocabularyTerm(term="X", kind="").kind == "acronym"
    assert VocabularyTerm(term="Y", kind="  product ").kind == "acronym"
    # Every valid nature is preserved (canonical lower-case).
    for kind in VOCAB_KINDS:
        assert VocabularyTerm(term="t", kind=kind).kind == kind
    # Valid but padded / upper-case normalises onto the canonical nature.
    assert VocabularyTerm(term="Codex", kind=" TOOL_ERP ").kind == "tool_erp"
    assert VocabularyTerm(term="Axians", kind="Entity").kind == "entity"


async def test_enrich_coerces_hallucinated_kind_from_llm():
    # The enrichment pass builds VocabularyTerm from raw LLM output — the model
    # validator must catch a bad kind on that path too, not just deterministic build.
    base = build_vocabulary({"programNames": ["Leonard"]})

    async def _call(system, user, **k):
        return (
            {
                "terms": [
                    {"term": "RGPD", "kind": "regulation", "meaning": "loi"},
                    {"term": "ERP Codex", "kind": "tool_erp", "meaning": "ERP maison"},
                ]
            },
            None,
        )

    out = await enrich_vocabulary(base, "s", "VINCI", call=_call)
    by = {t["term"]: t for t in out["terms"]}
    assert by["RGPD"]["kind"] == "acronym"  # hallucinated nature coerced
    assert by["ERP Codex"]["kind"] == "tool_erp"  # valid nature preserved
    assert all(t["kind"] in VOCAB_KINDS for t in out["terms"])  # nothing off-enum survives


def test_entities_become_typed_terms():
    research = {
        "entitiesExhaustive": [
            {"name": "VINCI Energies", "relevance": "operating", "relevanceReason": ""},
            {"name": "SCI Haussmann", "relevance": "noise", "relevanceReason": "SCI"},
            {"name": "SGTM", "relevance": "out_of_sector", "relevanceReason": "BTP / travaux"},
        ],
    }
    by = _by_term(build_vocabulary(research))
    assert by["VINCI Energies"]["kind"] == "entity"
    assert by["VINCI Energies"]["truthStatus"] == "registre"  # entité = donnée registre
    assert by["SCI Haussmann"]["kind"] == "trap_noise"  # véhicule légal = piège
    assert by["SGTM"]["kind"] == "entity"  # hors-secteur reste une entité, labellée
    assert by["SGTM"]["meaning"] == "BTP / travaux"


def test_competitors_programs_and_tools():
    research = {"competitors": [{"name": "Sopra"}], "programNames": ["Leonard"], "detectedTechStack": ["SAP"]}
    by = _by_term(build_vocabulary(research))
    assert by["Sopra"]["kind"] == "internal_competitor"
    assert by["Sopra"]["truthStatus"] == "risque"
    assert by["Leonard"]["kind"] == "program"
    assert by["SAP"]["kind"] == "tool_erp"


def test_dedupe_by_normalised_term_and_skip_empty():
    research = {"programNames": ["Leonard", "leonard", "  ", ""]}
    terms = build_vocabulary(research)["terms"]
    assert sum(1 for t in terms if t["term"].lower() == "leonard") == 1
    assert all(t["term"].strip() for t in terms)


def test_version_and_empty_research():
    vocab = build_vocabulary({})
    assert vocab["terms"] == []
    assert vocab["version"] == "v1"


def test_terms_carry_the_full_typed_shape():
    term = build_vocabulary({"programNames": ["POSIT'V"]})["terms"][0]
    assert {"term", "kind", "meaning", "commercialWhy", "aliases", "relatedEntity", "truthStatus", "sourceRefs"} <= set(
        term.keys()
    )


# ── AccountVocabularyBuilder (enrichissement LLM opt-in, Théo) ────────────────
async def test_enrich_fills_existing_and_appends_new():
    base = build_vocabulary({"entitiesExhaustive": [{"name": "Axians", "relevance": "operating"}]})

    async def _call(system, user, **k):
        return (
            {
                "terms": [
                    {"term": "Axians", "commercialWhy": "BU IT du groupe = porte d'entrée"},
                    {"term": "ERP Codex", "kind": "tool_erp", "meaning": "ERP maison", "commercialWhy": "migration en cours"},
                ]
            },
            None,
        )

    out = await enrich_vocabulary(base, "extraits sources", "VINCI", call=_call)
    by = {t["term"]: t for t in out["terms"]}
    assert by["Axians"]["commercialWhy"] == "BU IT du groupe = porte d'entrée"  # enrichi
    assert by["ERP Codex"]["kind"] == "tool_erp"  # ajouté


async def test_enrich_degrades_on_llm_error():
    base = build_vocabulary({"programNames": ["Leonard"]})

    async def _boom(*a, **k):
        raise RuntimeError("claude down")

    assert await enrich_vocabulary(base, "s", "VINCI", call=_boom) == base  # inchangé


async def test_enrich_ignores_malformed_llm_output():
    base = build_vocabulary({"programNames": ["Leonard"]})

    async def _bad(*a, **k):
        return ("pas un dict", None)

    assert await enrich_vocabulary(base, "s", "VINCI", call=_bad) == base
