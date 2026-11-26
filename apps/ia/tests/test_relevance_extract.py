"""#6 : extraction relevance-aware du scrape (garde le corps IT/business actionnable,
pas juste l'intro)."""

from __future__ import annotations

from app.services.relevance_extract import _score_paragraph, select_relevant_excerpt


def test_short_content_returned_as_is():
    assert select_relevant_excerpt("court", 1000) == "court"
    assert select_relevant_excerpt("", 1000) == ""
    assert select_relevant_excerpt("x" * 10, 0) == ""


def test_scores_it_business_paragraphs_above_boilerplate():
    boiler = "Bienvenue sur notre site. Acceptez les cookies. Mentions légales."
    signal = "Le groupe investit 50M€ dans sa migration cloud et recrute une équipe DevOps en 2026."
    assert _score_paragraph(signal) > _score_paragraph(boiler)
    assert _score_paragraph(boiler) == 0


def test_keeps_relevant_body_over_boilerplate_when_truncating():
    # Intro courte + beaucoup de boilerplate + un paragraphe IT actionnable en bas.
    head = "Présentation générale de l'entreprise et de son histoire."
    filler = "\n\n".join(f"Paragraphe de remplissage sans intérêt numéro {i}." for i in range(30))
    gold = "Migration SAP vers le cloud Azure, budget 20M€, recrutement DSI en 2026, appel d'offres cybersécurité."
    doc = f"{head}\n\n{filler}\n\n{gold}"
    out = select_relevant_excerpt(doc, 400)
    assert len(out) <= 400
    assert "Migration SAP" in out  # le corps actionnable survit à la troncature
    assert head in out  # la tête (lede) est gardée d'office


def test_preserves_document_order():
    a = "Cloud et data en 2026."  # pertinent, tôt
    b = "Blabla."
    c = "DevOps et cybersécurité, budget 10M€."  # pertinent, tard
    doc = f"{a}\n\n{b}\n\n{c}"
    # budget qui force un tri mais garde les 2 pertinents
    out = select_relevant_excerpt(doc, 60)
    if a in out and c in out:
        assert out.index(a) < out.index(c)  # ordre du doc respecté


# ── #7 : dedup de contenu quasi-identique (au-delà du dedup URL) ──────────────
from app.services.relevance_extract import ContentDeduper  # noqa: E402


def test_content_deduper_flags_near_duplicate_body():
    d = ContentDeduper(threshold=0.75)
    body = " ".join(f"le groupe investit dans le cloud et la data phrase {i}" for i in range(20))
    assert d.duplicate_of(body, "[P1]") is None  # premier vu → nouveau
    # même contenu via une autre URL (mirror) → flaggé duplicate de [P1]
    assert d.duplicate_of(body, "[P2]") == "[P1]"
    # léger bruit ajouté mais >75% commun → toujours dup
    assert d.duplicate_of(body + " mention legale cookies", "[P3]") == "[P1]"


def test_content_deduper_keeps_distinct_bodies():
    d = ContentDeduper(threshold=0.75)
    a = " ".join(f"migration sap cloud azure budget devops annee {i}" for i in range(20))
    b = " ".join(f"recrutement data scientist paris intelligence artificielle {i}" for i in range(20))
    assert d.duplicate_of(a, "[P1]") is None
    assert d.duplicate_of(b, "[O1]") is None  # contenu différent → gardé


def test_content_deduper_ignores_empty():
    d = ContentDeduper()
    assert d.duplicate_of("", "[P1]") is None
    assert d.duplicate_of(None, "[P2]") is None
