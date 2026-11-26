"""LAU-FINAL-251 (#3341) — niveaux de qualification du consultant.

Objectif de l'issue : empêcher Laura de présenter une piste exploratoire
comme un match prêt à être envoyé. Quatre niveaux, portés par
`_BLOCK_CONSULTANT_QUALIFICATION_LEVELS` dans `build_system_prompt`."""

from __future__ import annotations

from app.prompts.bellum_advisor import (
    _BLOCK_CONSULTANT_QUALIFICATION_LEVELS,
    build_system_prompt,
)


def test_names_the_four_levels():
    """#3341.1 — les quatre niveaux, nommés verbatim."""
    for level in (
        "NIVEAU 1 — EXPLORATION DE MARCHÉ",
        "NIVEAU 2 — COMPATIBILITÉ PROBABLE",
        "NIVEAU 3 — MATCH DÉFENDABLE",
        "NIVEAU 4 — PRÊT À PRÉSENTER",
    ):
        assert level in _BLOCK_CONSULTANT_QUALIFICATION_LEVELS, f"niveau absent : {level!r}"


def test_every_lead_is_classified_exactly_once():
    """#3341.2 — toute piste se classe dans exactement un des quatre niveaux."""
    assert "se classe dans EXACTEMENT un des quatre niveaux" in _BLOCK_CONSULTANT_QUALIFICATION_LEVELS


def test_a_lead_full_of_hedges_never_makes_the_top_3():
    """#3341.3 — une piste chargée de réserves ne se classe pas parmi les trois meilleurs matchs."""
    assert "« uniquement si », « peut-être », « à vérifier »" in _BLOCK_CONSULTANT_QUALIFICATION_LEVELS
    assert "NE SE CLASSE PAS parmi les trois meilleurs matchs" in _BLOCK_CONSULTANT_QUALIFICATION_LEVELS


def test_never_fills_the_top_3_artificially_when_nothing_is_defendable():
    """#3341.4 — si aucun match n'est défendable, le dire clairement plutôt que de remplir artificiellement."""
    assert "Si aucun match n'est défendable, tu le dis clairement" in _BLOCK_CONSULTANT_QUALIFICATION_LEVELS
    assert "tu ne remplis JAMAIS artificiellement un top 3" in _BLOCK_CONSULTANT_QUALIFICATION_LEVELS


def test_names_the_four_forbidden_reflexes():
    """#3341.5 — les quatre réflexes à ne plus appliquer, nommés dans le bloc."""
    assert "confondre une proximité d'intitulé avec une adéquation réelle" in _BLOCK_CONSULTANT_QUALIFICATION_LEVELS
    assert "Data Manager comme Business Analyst Finance sans preuve" in _BLOCK_CONSULTANT_QUALIFICATION_LEVELS
    assert "Tech Lead comme Data Engineer hands-on sans preuve" in _BLOCK_CONSULTANT_QUALIFICATION_LEVELS
    assert (
        "transformer une piste faible en recommandation pour satisfaire la demande"
        in _BLOCK_CONSULTANT_QUALIFICATION_LEVELS
    )


def test_the_rule_reaches_the_real_system_prompt():
    """Une règle qui n'atteint jamais `build_system_prompt` n'est pas livrée."""
    prompt = build_system_prompt({}, {}, "", "")
    assert "NIVEAUX DE QUALIFICATION D'UNE PISTE CONSULTANT" in prompt
