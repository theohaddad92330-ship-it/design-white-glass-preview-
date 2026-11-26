"""#3905.4 (décision Louis 15/10) — « demander des comptes en une phrase » : Laura rend une liste COURTE et justifiée.

Une raison par cible (ce que le moteur Découvrir a rendu, jamais inventé), et RIEN autour :
ni « tour d'horizon / analyse de fond » proposés après, ni autre proposition. Aucun champ obligatoire.
"""

from __future__ import annotations

from app.prompts.bellum_advisor import build_system_prompt


def _direct_search_block() -> str:
    out = build_system_prompt({}, {}, "", "")
    start = out.index("RECHERCHE DIRECTE (#3707)")
    return out[start : out.index("\n\n", start)]


def test_list_is_short_and_each_target_carries_its_reason() -> None:
    block = _direct_search_block()
    assert "#3905.4" in block
    assert "liste COURTE" in block
    assert "une raison par compte" in block


def test_no_other_proposal_around_the_list() -> None:
    block = _direct_search_block()
    assert "SANS autre proposition autour" in block
    # L'ancienne consigne imposait au contraire deux gestes APRÈS la liste.
    assert "ne viennent QU'APRÈS la liste" not in block


def test_a_request_without_field_is_still_a_search() -> None:
    block = _direct_search_block()
    assert "aucun champ obligatoire" in block


# #3905.4 (recette R37, 16/10) — « 5 écartés, 0 retenu » : le critère qui a tout écarté est nommé.
def test_3905_4_zero_retained_names_the_criterion_in_one_sentence() -> None:
    from app.services.chat_tools import _no_retained_reason

    skipped = [{"name": f"Société {i}", "siren": f"{i}" * 9, "reason": "activité hors du secteur demandé"} for i in range(5)]
    sentence = _no_retained_reason(skipped)
    assert sentence == "Les 5 entreprises rendues par le registre ont toutes été écartées : activité hors du secteur demandé."
    assert "Élargir" not in sentence and "Relancer" not in sentence
    # Rien d'écarté ⇒ rien à dire : jamais une raison inventée.
    assert _no_retained_reason([]) == ""
    mixed = _no_retained_reason(skipped[:2], esn_excluded=3)
    assert mixed.startswith("Les 5 entreprises") and "2 : activité hors du secteur demandé" in mixed
