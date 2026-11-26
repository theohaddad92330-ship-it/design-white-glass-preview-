"""#2308 (LAU-FINAL-049) — le COMPILATEUR de la carte de couverture du chat.

Mesuré le 18/09/2026 : `chat_tools.py` porte 34 fonctions et aucune n'ASSEMBLE
quoi que ce soit — « les ingrédients existent presque tous, le plat n'existe
pas ». Ce module est le plat : il prend la réponse brute du pont
(`bellum_api.account_coverage_map`, elle-même `CoverageService
.computeChatCoverageMapForAccount` côté NestJS) et compose ce que Laura DIT
sur le gap PRINCIPAL (#2308.44) — jamais un second calcul de couverture.

GA-259 tient la règle : ce module ne recalcule RIEN, il ne fait que choisir
des mots. Un gap absent ne produit JAMAIS de titre inventé.
"""

from __future__ import annotations

from app.services.compilers.coverage_map import build_gap_headline, compile_chat_coverage_map


def _gap(**overrides: object) -> dict:
    base = {
        "id": "role_family:sponsor",
        "axis": "role_family",
        "key": "sponsor",
        "label": "Sponsor",
        "reason": "Aucun sponsor identifié — la décision n'a personne pour la porter en interne.",
        "state": "unknown",
        "priority_category": "bloque_action",
        "suggested_action": "recherche_ciblee",
    }
    base.update(overrides)
    return base


def test_build_gap_headline_names_the_top_gap() -> None:
    headline = build_gap_headline([_gap()])
    assert headline is not None
    assert "Sponsor" in headline
    assert "sponsor" in headline.lower()


def test_build_gap_headline_is_none_without_any_gap() -> None:
    # #2308.44 — pas de trou, pas de phrase inventée sur du vide.
    assert build_gap_headline([]) is None


def test_build_gap_headline_ignores_a_malformed_gap_rather_than_guessing() -> None:
    assert build_gap_headline([{"id": "x"}]) is None


def test_build_gap_headline_reads_only_the_first_gap_the_api_already_ranked() -> None:
    # Le tri (bloque_action d'abord) est fait côté API — ce compilateur ne
    # retrie JAMAIS : un second tri qui diverge du premier serait une seconde
    # vérité (GA-26).
    top = _gap(key="sponsor", label="Sponsor")
    second = _gap(key="achats", label="Achats", priority_category="bloque_etape_suivante")
    headline = build_gap_headline([top, second])
    assert headline is not None
    assert "Sponsor" in headline
    assert "Achats" not in headline


def test_compile_chat_coverage_map_passes_through_the_named_axes_untouched() -> None:
    raw = {
        "account_id": "a-1",
        "generated_at": "2026-09-22T00:00:00.000Z",
        "meaning": "Ce que nous savons, jamais ce que le marché fait.",
        "role_families": [{"role_family": "partenaire", "label": "Partenaire", "state": "unknown", "contact_count": 0}],
        "perimeters": [],
        "sales_stages": [],
        "gaps": [_gap()],
    }
    compiled = compile_chat_coverage_map(raw)
    assert compiled["role_families"] == raw["role_families"]
    assert compiled["meaning"] == raw["meaning"]
    assert compiled["gaps"] == raw["gaps"]
    assert compiled["headline"] is not None and "Sponsor" in compiled["headline"]


def test_compile_chat_coverage_map_tolerates_missing_lists_without_inventing_data() -> None:
    compiled = compile_chat_coverage_map({"account_id": "a-1"})
    assert compiled["role_families"] == []
    assert compiled["perimeters"] == []
    assert compiled["sales_stages"] == []
    assert compiled["gaps"] == []
    assert compiled["headline"] is None
