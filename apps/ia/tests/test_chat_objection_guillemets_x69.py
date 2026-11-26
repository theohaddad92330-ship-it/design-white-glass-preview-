"""#3444 (recette prod 02/10, Y18) — la phrase 2 finissait par « » » doublé : le texte approuvé de
« mauvaise expérience » se termine par « ? » et le modèle écrit « ? » (espace insécable) avant le guillemet
fermant ; l'assemblage ne reconnaissait que « » » collé au texte, donc en ajoutait un second.
Question exacte à poser en recette (/chat) : « On a déjà eu une mauvaise expérience avec une ESN »."""

from __future__ import annotations

import pytest

from app.knowledge.content_library import CONTENT_LIBRARY_ENTRIES
from app.services.objection_first import ensure_approved_objection

PHRASES = [
    ("Je ne suis pas décideur sur ces sujets", "objection-pas-decideur"),
    ("On a déjà eu une mauvaise expérience avec une ESN", "objection-mauvaises-experiences"),
    ("Nous gérons tout en interne", "objection-gestion-interne"),
]
WRAPS = [("« ", " »"), ("« ", " »"), ("« ", " »"), ("«", "»"), ("« ", "»")]


@pytest.mark.parametrize(("phrase", "entry_id"), PHRASES)
@pytest.mark.parametrize(("opening", "closing"), WRAPS)
def test_a_quoted_verbatim_gets_exactly_one_closing_guillemet(phrase, entry_id, opening, closing) -> None:
    body = next(e for e in CONTENT_LIBRARY_ENTRIES if e["id"] == entry_id)["body"]
    out = ensure_approved_objection(f"{opening}{body}{closing}\nVoilà.", phrase)
    assert out.count("»") == 1 and out.count("«") == 1
    assert f"Réponse approuvée : « {body} »" in out
    assert "»  »" not in out and "» »" not in out
