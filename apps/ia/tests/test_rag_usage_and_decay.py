"""Les manques M1, M2, M3 et M6 du magasin (tome 7 §38)."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest

from app.prompts.context_transparency import _sources_from_docs
from app.services import rag_knowledge
from app.services.rag_knowledge import _deterministic_rerank
from app.services.rag_service import (
    RAG_DECAY_HORIZON_DAYS,
    apply_score_decay,
    decayed_score,
    format_knowledge_context_with_sources,
)


def _iso(days_ago: int) -> str:
    return (datetime.now(timezone.utc) - timedelta(days=days_ago)).isoformat()


class TestDecay:
    """M1 — la fraîcheur DANS le score de récupération."""

    def test_a_fresh_document_beats_an_old_one_at_equal_relevance(self):
        # Le test exact que demande le §41.
        assert decayed_score(0.8, 30) > decayed_score(0.8, 700)

    def test_two_years_costs_half_the_score_and_never_more(self):
        assert decayed_score(1.0, RAG_DECAY_HORIZON_DAYS) == pytest.approx(0.5)
        # Un document de dix ans ne DISPARAÎT pas : il plafonne à la moitié.
        assert decayed_score(1.0, 3650) == pytest.approx(0.5)

    def test_a_missing_date_is_not_a_penalty(self):
        # L'absence de date n'est pas une preuve d'ancienneté.
        assert decayed_score(0.9, None) == pytest.approx(0.9)

    def test_the_decay_is_applied_to_the_retrieved_list(self):
        docs = [
            {"id": "vieux", "similarity": 0.9, "created_at": _iso(700)},
            {"id": "recent", "similarity": 0.85, "created_at": _iso(10)},
        ]
        apply_score_decay(docs)
        assert docs[1]["similarity"] > docs[0]["similarity"]

    def test_a_document_without_similarity_is_left_alone(self):
        # Le plein texte n'en produit pas. Lui en inventer une le ferait passer
        # devant des documents que le vecteur a réellement notés.
        docs = [{"id": "a", "created_at": _iso(700)}]
        apply_score_decay(docs)
        assert "similarity" not in docs[0]


class TestDecayOnTheKeyFreePath:
    """M1 — la fraîcheur sur le chemin SANS CLÉ, celui qui tourne par défaut.

    ``apply_score_decay`` ne pondère que les documents qui portent une
    ``similarity``, et seul le vecteur en produit. Sans ``EMBEDDING_API_KEY``
    — la configuration par défaut, et l'un des six choix que le tome déclare
    JUSTES (« le RAG fonctionne sans pgvector configuré ») — la récupération
    est plein texte, le reclassement est déterministe, et la fraîcheur n'était
    alors comptée NULLE PART : c'est le symptôme du §38 mot pour mot, « un
    angle gagnant de 2024 remonte à égalité avec celui d'hier ».
    """

    def _pair(self):
        """Deux documents de pertinence lexicale STRICTEMENT égale — c'est le
        cas du §41 : « deux documents de similarité égale, l'un de 30 j,
        l'autre de 700 j → le récent remonte »."""
        return [
            {"id": "vieux", "title": "migration cloud", "content": "migration cloud", "created_at": _iso(700)},
            {"id": "recent", "title": "migration cloud", "content": "migration cloud", "created_at": _iso(30)},
        ]

    def test_the_deterministic_rerank_puts_the_recent_document_first(self):
        ranked = _deterministic_rerank("migration cloud", self._pair(), None)
        assert [d["id"] for d in ranked] == ["recent", "vieux"]

    async def test_the_whole_key_free_path_puts_the_recent_document_first(self, monkeypatch):
        """Par la porte que les appelants empruntent, pas par la fonction seule."""
        monkeypatch.setattr(rag_knowledge, "_llm_rerank_enabled", lambda: False)
        monkeypatch.delenv("RAG_RERANK_CROSS_ENCODER", raising=False)
        ranked = await rag_knowledge.rerank("migration cloud", self._pair())
        assert [d["id"] for d in ranked] == ["recent", "vieux"]

    def test_relevance_still_beats_freshness(self):
        """Le decay PONDÈRE, il ne filtre pas et il ne renverse pas tout.

        Un document nettement plus pertinent mais vieux reste devant un
        document frais hors sujet — sinon le magasin classerait par date.
        """
        docs = [
            {"id": "pertinent", "title": "migration cloud AWS", "content": "migration cloud AWS", "created_at": _iso(700)},
            {"id": "frais", "title": "recrutement", "content": "recrutement", "created_at": _iso(1)},
        ]
        ranked = _deterministic_rerank("migration cloud AWS", docs, None)
        assert ranked[0]["id"] == "pertinent"

    def test_a_document_without_a_readable_date_is_not_penalised(self):
        """« Non mesuré » n'est pas « mesuré à zéro » : un document sans date
        n'a pas un âge de zéro jour, il n'a pas d'âge — et il ne doit pas être
        relégué pour un défaut d'écriture qui n'est pas le sien."""
        docs = [
            {"id": "sans_date", "title": "migration cloud", "content": "migration cloud"},
            {"id": "vieux", "title": "migration cloud", "content": "migration cloud", "created_at": _iso(700)},
        ]
        ranked = _deterministic_rerank("migration cloud", docs, None)
        assert [d["id"] for d in ranked] == ["sans_date", "vieux"]


class TestUsedSources:
    """M2 et M5 — ce qui a RÉELLEMENT atteint le prompt."""

    def test_only_documents_that_produced_a_line_count_as_used(self):
        docs = [
            {"id": "1", "title": "A", "content": "du contenu", "similarity": 0.9},
            {"id": "2", "title": "B", "content": "   ", "similarity": 0.8},
        ]
        block, used = format_knowledge_context_with_sources(docs)
        assert "du contenu" in block
        assert [u["docId"] for u in used] == ["1"]

    def test_a_document_cut_by_the_budget_is_not_a_source(self):
        # Couper le texte à la fin laisserait dans la liste des sources un
        # document dont pas un mot n'a atteint le prompt.
        docs = [
            {"id": "1", "title": "A", "content": "x" * 300, "similarity": 0.9},
            {"id": "2", "title": "B", "content": "y" * 300, "similarity": 0.8},
        ]
        _block, used = format_knowledge_context_with_sources(docs, max_chars=310)
        assert [u["docId"] for u in used] == ["1"]

    def test_a_near_duplicate_is_not_counted_twice(self):
        docs = [
            {"id": "1", "title": "A", "content": "même texte ici", "similarity": 0.9},
            {"id": "2", "title": "A", "content": "même texte ici", "similarity": 0.8},
        ]
        _block, used = format_knowledge_context_with_sources(docs)
        assert len(used) == 1

    def test_the_origin_travels_with_the_source(self):
        docs = [{"id": "1", "title": "A", "content": "z", "similarity": 1, "origin": "uploaded"}]
        _block, used = format_knowledge_context_with_sources(docs)
        assert used[0]["origin"] == "uploaded"

    def test_a_document_without_origin_reads_as_distilled(self):
        docs = [{"id": "1", "title": "A", "content": "z", "similarity": 1}]
        _block, used = format_knowledge_context_with_sources(docs)
        assert used[0]["origin"] == "distilled"


class TestCitations:
    """M5 — une source doit pouvoir s'ouvrir."""

    def test_the_identifier_travels_with_the_label(self):
        sources = _sources_from_docs([{"id": "doc-7", "title": "Playbook", "content": "…"}])
        assert sources[0]["doc_id"] == "doc-7"

    def test_no_identifier_is_invented_for_a_document_that_has_none(self):
        # On n'affiche pas un lien mort.
        sources = _sources_from_docs([{"title": "Playbook", "content": "…"}])
        assert "doc_id" not in sources[0]
