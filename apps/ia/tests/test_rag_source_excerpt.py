"""#1954.21 / #1954.31 — « voir le passage utilisé », pas seulement le titre.

Le registre trouvait #1954.21 « NON PROUVÉ » (`reply-provenance.ts` cite des
sources datées, aucune preuve d'extrait) et #1954.31 « PARTIEL » (le nom du
fichier est déjà cité, jamais la phrase). `_sources_from_docs`
(`context_transparency.py`) est LA seule fabrique de source de connaissance
(`test_rag_citation_guard.py::test_only_one_place_builds_a_knowledge_source`) —
elle a déjà le `content` intégral du document sous la main (elle le lit déjà
pour décider si le document est vide), elle ne le transportait simplement pas.

⚠️ CE QUE CE CHAMP PROUVE, ET CE QU'IL NE PROUVE PAS. `excerpt` est un extrait
RÉEL du document effectivement injecté dans le prompt — jamais inventé, jamais
reformulé. Ce n'est PAS une preuve que le modèle a cité CETTE phrase précise
dans sa réponse (ça, aucun calcul mécanique ne peut le garantir sans relire le
texte généré) : c'est une preuve vérifiable de ce que Laura avait sous les yeux
pour ce document-là, que l'utilisateur peut confronter à ce qu'elle a écrit.
"""

from __future__ import annotations

from app.prompts.context_transparency import _sources_from_docs


def test_a_knowledge_source_carries_a_real_excerpt_of_its_content() -> None:
    sources = _sources_from_docs([{"id": "doc-1", "title": "Playbook", "content": "Le client a signé en mars."}])
    assert sources[0]["excerpt"] == "Le client a signé en mars."


def test_the_excerpt_is_bounded_and_never_cuts_mid_word() -> None:
    long_content = "mot " * 200  # bien au-delà de la borne
    sources = _sources_from_docs([{"id": "doc-1", "title": "Long", "content": long_content}])
    excerpt = sources[0]["excerpt"]
    assert len(excerpt) <= 240
    assert excerpt.endswith("…")
    # jamais un mot tronqué au milieu : le caractère juste avant l'ellipse
    # termine un mot entier (le contenu ne contient que « mot » et des espaces).
    assert excerpt[:-1].strip().endswith("mot")


def test_whitespace_and_newlines_collapse_to_single_spaces() -> None:
    sources = _sources_from_docs([{"id": "doc-1", "title": "Messy", "content": "Ligne un.\n\n  Ligne  deux."}])
    assert sources[0]["excerpt"] == "Ligne un. Ligne deux."


def test_a_document_without_content_carries_no_excerpt() -> None:
    # Filtré en amont (`if not str(d.get("content") or "").strip(): continue`) —
    # ne doit jamais apparaître ici, donc jamais de clé `excerpt` fantôme.
    sources = _sources_from_docs([{"id": "doc-1", "title": "Vide", "content": "   "}])
    assert sources == []
