"""Vocabulaire du groupe — sens + pourquoi commercial remplis DÉTERMINISTE
(retour Thales 2026-07-07).

Théo : les colonnes « sens » et « pourquoi commercial » sont vides et certains
types sont mal classés. Le remplissage LLM (enrich_vocabulary) est opt-in derrière
VOCAB_ENRICH → sur Thales il était OFF → colonnes vides. Le déterministe doit
GARANTIR un sens + un pourquoi commercial non vides pour CHAQUE terme, sans token,
l'enrichissement LLM ne faisant qu'améliorer.
"""

from __future__ import annotations

from app.services.account_vocabulary import build_vocabulary


def _research() -> dict:
    return {
        "entitiesExhaustive": [
            {"name": "Thales Digital Factory", "relevance": "operating", "relevanceReason": ""},
            {"name": "SCI Les Tilleuls", "relevance": "noise", "relevanceReason": "SCI (société civile immobilière)"},
            {"name": "Thales Agro", "relevance": "out_of_sector", "relevanceReason": "hors secteur (agri)"},
        ],
        "competitors": [{"name": "Capgemini"}, {"name": "Sopra Steria"}],
        "esnPresence": [
            {
                "name": "Capgemini",
                "competeAngle": "Se différencier sur l'expertise cyber de niche.",
                "partnershipAngle": "Se positionner en sous-traitance rang 2 sur le cloud.",
            }
        ],
        "programNames": ["cortAIx", "TDSI"],
        "detectedTechStack": ["SAP", "Kubernetes"],
    }


def test_every_term_has_non_empty_meaning_and_commercial_why() -> None:
    vocab = build_vocabulary(_research())
    terms = vocab["terms"]
    assert terms, "vocabulaire non vide"
    for t in terms:
        assert t.get("meaning", "").strip(), f"'sens' vide pour {t.get('term')}"
        assert t.get("commercialWhy", "").strip(), f"'pourquoi commercial' vide pour {t.get('term')}"


def _by_term(vocab: dict, term: str) -> dict:
    return next(t for t in vocab["terms"] if t["term"] == term)


def test_noise_vehicle_is_flagged_as_a_trap() -> None:
    vocab = build_vocabulary(_research())
    sci = _by_term(vocab, "SCI Les Tilleuls")
    assert sci["kind"] == "trap_noise"
    assert "piège" in sci["commercialWhy"].lower() or "ne pas" in sci["commercialWhy"].lower()


def test_out_of_sector_entity_says_off_target() -> None:
    vocab = build_vocabulary(_research())
    agro = _by_term(vocab, "Thales Agro")
    assert agro["kind"] == "entity"
    assert "hors" in agro["commercialWhy"].lower()


def test_competitor_why_comes_from_esn_presence_rank2() -> None:
    vocab = build_vocabulary(_research())
    cap = _by_term(vocab, "Capgemini")
    assert cap["kind"] == "internal_competitor"
    why = cap["commercialWhy"].lower()
    assert "rang 2" in why or "sous-traitance" in why or "concurrenc" in why


def test_pure_acronym_program_is_reclassified() -> None:
    vocab = build_vocabulary(_research())
    tdsi = _by_term(vocab, "TDSI")
    assert tdsi["kind"] == "acronym"
    # A real named programme stays a programme.
    assert _by_term(vocab, "cortAIx")["kind"] == "program"


def test_tool_and_operating_entity_have_actionable_why() -> None:
    vocab = build_vocabulary(_research())
    assert _by_term(vocab, "SAP")["kind"] == "tool_erp"
    assert _by_term(vocab, "SAP")["commercialWhy"].strip()
    assert _by_term(vocab, "Thales Digital Factory")["commercialWhy"].strip()
