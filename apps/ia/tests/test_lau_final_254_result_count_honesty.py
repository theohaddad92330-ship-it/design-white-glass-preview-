"""LAU-FINAL-254 (#3344) — honnêteté sur le volume et la couverture.

Laura affirme « Les autres recherches ont fait ressortir au moins quatre
besoins distincts supplémentaires » sans les nommer, les sourcer, ni
expliquer pourquoi ils sont écartés — une impression artificielle de
profondeur sans valeur. Portée par l'extension de `_BLOCK_SEARCH_RESULTS`
dans `build_system_prompt` (même bloc que le total qui « se mesure, ne se
devine pas », #1924.4 — un nombre annoncé se décompose de la même façon
qu'un total s'assume ou s'avoue inconnu)."""

from __future__ import annotations

from app.prompts.bellum_advisor import _BLOCK_SEARCH_RESULTS, build_system_prompt


def test_an_announced_count_never_stands_alone():
    """#3344.1 — un nombre annoncé se décompose, il ne s'affiche jamais seul."""
    assert "UN NOMBRE ANNONCÉ SE DÉCOMPOSE, IL NE S'AFFICHE JAMAIS SEUL" in _BLOCK_SEARCH_RESULTS


def test_only_two_options_show_or_withhold():
    """#3344.2 — option A (montrer avec niveau + raison d'exclusion) ou option B (ne pas annoncer)."""
    assert (
        "tu montres chacun avec son niveau de qualification et sa raison d'exclusion s'il est écarté"
        in _BLOCK_SEARCH_RESULTS
    )
    assert "tu n'annonces PAS le nombre tant qu'il ne peut pas être expliqué ainsi" in _BLOCK_SEARCH_RESULTS


def test_carries_the_exact_breakdown_example():
    """#3344.2 — l'exemple exact de décomposition de l'issue."""
    assert "deux besoins anciens déjà périmés" in _BLOCK_SEARCH_RESULTS
    assert "trois recrutements CDI" in _BLOCK_SEARCH_RESULTS


def test_never_fills_a_top_3_with_weak_leads_to_round_the_count():
    """#3344.3 — une short-list ne se remplit jamais avec des pistes faibles pour un compte rond."""
    assert "ne se remplit JAMAIS avec des pistes faibles pour atteindre un compte rond" in _BLOCK_SEARCH_RESULTS
    assert (
        "une seule piste mérite réellement une vérification, je préfère ne pas compléter artificiellement le top 3"
        in _BLOCK_SEARCH_RESULTS
    )


def test_a_large_volume_never_masks_a_narrow_search():
    """#3344.4 — 4ᵉ réflexe interdit de l'issue : un grand volume annoncé ne
    masque jamais une recherche restée étroite. Formulation dédiée, sans le
    mot « couverture » (réservé par GA-259/c65 à `get_account_coverage_map` —
    voir `test_ga259_coverage_word_still_avoided` ci-dessous)."""
    assert (
        "un grand nombre annoncé ne masque jamais une recherche restée étroite" in _BLOCK_SEARCH_RESULTS
    )


def test_ga259_coverage_word_still_avoided():
    """Garde GA-259 (c65_couverture_nest_pas_un_fait_de_marche) : ce bloc ne
    parle jamais d'un TAUX DE COUVERTURE de marché — le mot est réservé à
    `get_account_coverage_map`."""
    assert "couvertur" not in _BLOCK_SEARCH_RESULTS.lower()


def test_the_rule_reaches_the_real_system_prompt():
    """Une règle qui n'atteint jamais `build_system_prompt` n'est pas livrée."""
    prompt = build_system_prompt({}, {}, "", "")
    assert "UN NOMBRE ANNONCÉ SE DÉCOMPOSE, IL NE S'AFFICHE JAMAIS SEUL" in prompt
