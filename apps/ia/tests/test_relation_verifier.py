"""« Vérifier une relation » — la dernière action manquante de l'annexe (p22).

Un lien inféré (pointillé, confiance ≤ 89) reste une hypothèse tant qu'aucune
preuve ne l'établit. Le commercial doit pouvoir demander : « ce lien, il est
vrai ? » — et obtenir soit une preuve datée, soit un aveu d'ignorance.

Ce module est DÉTERMINISTE : il lit des hits de recherche web et décide du
grounding (p10) sur ce qui est écrit dans le hit. Aucun LLM ne prononce ici une
hiérarchie — le spec l'interdit (« le LLM enrichit, mais ne doit pas décider seul
de la hiérarchie », p12), et une inférence LLM seule plafonne de toute façon à 49.
"""

from __future__ import annotations

from app.services.relation_verifier import (
    build_verification_queries,
    verdict_from_hits,
)

_TODAY = "2026-07-23"


def _hit(url: str, title: str = "", description: str = "") -> dict:
    return {"url": url, "title": title, "description": description, "source": "serper"}


# ── Les requêtes ──────────────────────────────────────────────────────────────


def test_queries_name_both_people_and_the_company():
    queries = build_verification_queries(
        company="TF1",
        from_name="Marc Oliveira",
        to_name="Claire Basset",
        website="https://www.tf1.fr",
    )
    assert queries, "sans requête, aucune vérification possible"
    joined = " | ".join(queries)
    assert "Marc Oliveira" in joined
    assert "Claire Basset" in joined
    assert "TF1" in joined
    # Une requête vise explicitement le site officiel — c'est la seule qui peut
    # produire du grounding A.
    assert any("site:tf1.fr" in q for q in queries)


def test_no_query_without_two_named_people():
    assert build_verification_queries(company="TF1", from_name="", to_name="Claire Basset") == []
    assert build_verification_queries(company="TF1", from_name="Marc Oliveira", to_name="  ") == []


# ── Le verdict ────────────────────────────────────────────────────────────────


def test_official_page_naming_both_people_verifies_the_link():
    hits = [
        _hit(
            "https://www.tf1.fr/groupe/gouvernance",
            title="Gouvernance du groupe TF1",
            description="Claire Basset, Directrice Data, et Marc Oliveira, DSI, pilotent la transformation.",
        )
    ]
    verdict = verdict_from_hits(hits, from_name="Marc Oliveira", to_name="Claire Basset", website="https://www.tf1.fr", today=_TODAY)
    assert verdict["verified"] is True
    assert verdict["confidence"] >= 90
    assert verdict["sources"], "un lien vérifié CITE sa preuve (invariant du contrat)"
    assert verdict["sources"][0]["grounding"] == "A"
    assert verdict["sources"][0]["kind"] == "official_site"
    assert verdict["sources"][0]["date"] == _TODAY


def test_linkedin_naming_both_people_stays_probable_never_verified():
    hits = [
        _hit(
            "https://fr.linkedin.com/in/marc-oliveira",
            title="Marc Oliveira — DSI chez TF1",
            description="Rattaché à Claire Basset, Directrice Data.",
        )
    ]
    verdict = verdict_from_hits(hits, from_name="Marc Oliveira", to_name="Claire Basset", website="https://www.tf1.fr", today=_TODAY)
    assert verdict["verified"] is False
    # Grounding B = pointillé, 70-89 (p10). Jamais 90+, qui voudrait dire vérifié.
    assert 70 <= verdict["confidence"] <= 89
    assert verdict["sources"][0]["grounding"] == "B"
    assert verdict["sources"][0]["kind"] == "linkedin"


def test_a_page_naming_only_one_of_the_two_proves_nothing():
    hits = [
        _hit(
            "https://www.tf1.fr/groupe/gouvernance",
            title="Gouvernance",
            description="Claire Basset, Directrice Data.",
        )
    ]
    verdict = verdict_from_hits(hits, from_name="Marc Oliveira", to_name="Claire Basset", website="https://www.tf1.fr", today=_TODAY)
    assert verdict["verified"] is False
    assert verdict["confidence"] is None
    assert verdict["sources"] == []


def test_no_hit_at_all_admits_ignorance_instead_of_downgrading_the_edge():
    verdict = verdict_from_hits([], from_name="Marc Oliveira", to_name="Claire Basset", website=None, today=_TODAY)
    assert verdict == {"verified": False, "confidence": None, "sources": [], "checked": True}


def test_a_third_party_page_is_not_the_official_site():
    # Le nom du compte apparaît, mais le domaine n'est pas le sien : c'est de la
    # presse, pas un registre officiel — grounding B au mieux, jamais A.
    hits = [
        _hit(
            "https://www.lesechos.fr/tech/tf1-nomme-son-dsi",
            title="TF1 nomme son DSI",
            description="Marc Oliveira rejoint l'équipe de Claire Basset.",
        )
    ]
    verdict = verdict_from_hits(hits, from_name="Marc Oliveira", to_name="Claire Basset", website="https://www.tf1.fr", today=_TODAY)
    assert verdict["verified"] is False
    assert verdict["sources"][0]["grounding"] == "B"
    assert verdict["sources"][0]["kind"] == "press"


def test_the_best_evidence_wins_when_several_hits_match():
    hits = [
        _hit("https://fr.linkedin.com/in/marc-oliveira", description="Marc Oliveira, rattaché à Claire Basset"),
        _hit(
            "https://www.tf1.fr/organigramme",
            description="Marc Oliveira reporte à Claire Basset",
        ),
    ]
    verdict = verdict_from_hits(hits, from_name="Marc Oliveira", to_name="Claire Basset", website="https://www.tf1.fr", today=_TODAY)
    assert verdict["verified"] is True
    assert verdict["sources"][0]["grounding"] == "A"


def test_names_match_case_and_accent_insensitively():
    hits = [
        _hit(
            "https://www.tf1.fr/gouvernance",
            description="MARC OLIVEIRA travaille avec Claire Bassèt",
        )
    ]
    verdict = verdict_from_hits(hits, from_name="Marc Oliveira", to_name="Claire Basset", website="https://www.tf1.fr", today=_TODAY)
    assert verdict["verified"] is True
