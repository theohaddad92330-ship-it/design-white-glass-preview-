"""BEL-SC-226 (#3255) — la DISCIPLINE de méthode : Laura applique la méthode
SalesConnect naturellement (instruction commune #3249, règle 12), elle ne la
récite pas et ne la nomme pas à chaque tour. Ce test garde le bloc de prompt
qui porte cette discipline — son contenu, son budget de caractères, et sa
présence réelle dans le prompt assemblé.
"""

from __future__ import annotations

from app.prompts.bellum_advisor import _BLOCK_METHOD_DISCIPLINE, build_system_prompt


def test_the_block_is_not_empty():
    assert _BLOCK_METHOD_DISCIPLINE.strip(), "Le bloc est vide : le retirer ne changerait rien."


def test_the_block_stays_inside_its_character_budget():
    # Même discipline que `_BLOCK_ASK_FIRST` (1600) : un bloc invariant se paie
    # sur CHAQUE tour, court à dessein.
    assert len(_BLOCK_METHOD_DISCIPLINE) <= 1100, (
        f"Le bloc fait {len(_BLOCK_METHOD_DISCIPLINE)} caractères. Au-delà, il se paie sur tous les tours."
    )


def test_facts_and_user_context_win_over_the_method():
    assert "prime" in _BLOCK_METHOD_DISCIPLINE.lower()
    assert "fait" in _BLOCK_METHOD_DISCIPLINE.lower()
    assert "historique réel" in _BLOCK_METHOD_DISCIPLINE or "historique du workspace" in _BLOCK_METHOD_DISCIPLINE


def test_no_nominal_citation_of_the_method_by_default():
    lowered = _BLOCK_METHOD_DISCIPLINE.lower()
    assert "salesconnect" in lowered
    assert "5p" in lowered
    assert "demande explicite" in lowered or "sauf demande" in lowered


def test_caps_one_objection_and_one_proactive_recommendation():
    lowered = _BLOCK_METHOD_DISCIPLINE.lower()
    assert "une objection méthodologique" in lowered
    assert "une recommandation proactive" in lowered


def test_no_go_never_recite_principles_before_a_simple_request():
    # NO-GO explicite de la spec : « Laura récite cinq principes de vente avant
    # de répondre à une demande simple. »
    lowered = _BLOCK_METHOD_DISCIPLINE.lower()
    assert "récite" in lowered or "réciter" in lowered
    assert "cours théorique" in lowered or "checklist" in lowered


def test_the_block_is_wired_into_the_assembled_system_prompt():
    prompt = build_system_prompt({}, {}, "", "", "")
    assert _BLOCK_METHOD_DISCIPLINE in prompt
