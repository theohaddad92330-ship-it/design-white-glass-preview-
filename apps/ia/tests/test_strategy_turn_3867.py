"""#3867 (BEL-LAU-1008-016, bêta 08/10) — « fais-moi toute la stratégie » sur un objectif confirmé
rend une recommandation avec de vrais arbitrages, les cinq dimensions, calée sur le délai/les moyens
déclarés, sans jamais garantir un délai de démarrage ni un résultat commercial."""

from __future__ import annotations

from app.prompts.strategy_turn import full_strategy_turn_block


def test_unrelated_message_yields_no_block() -> None:
    assert full_strategy_turn_block("Quel est le SIREN de Thales ?") == ""


def test_full_strategy_request_opens_the_consigne() -> None:
    block = full_strategy_turn_block("Fais-moi toute la stratégie sur ce compte")
    assert "STRATÉGIE COMPLÈTE DEMANDÉE" in block
    assert "VRAIS" in block and "arbitrages" in block
    assert "périmètre" in block and "problème" in block and "personnes" in block
    assert "preuves" in block and "passage" in block


def test_5p_is_never_named_as_a_checklist() -> None:
    block = full_strategy_turn_block("Produis la stratégie complète")
    assert "5P" not in block
    assert "SalesConnect" not in block
    assert "checklist" in block or "formulaire de complétude" in block


def test_declared_time_and_means_are_respected() -> None:
    block = full_strategy_turn_block("Fais-moi toute la stratégie, j'ai trois priorités max")
    assert "DÉLAI" in block and "MOYENS" in block
    assert "cinquante approches" in block


def test_first_actions_are_prepared_not_offered_for_later() -> None:
    block = full_strategy_turn_block("Fais-moi toute la stratégie et prépare les premières actions")
    assert "MAINTENANT" in block
    assert "offre de les préparer plus tard" in block


def test_no_guaranteed_start_delay_or_commercial_outcome() -> None:
    """Cas BPCE de la recette bêta : « premier démarrage sous 60 jours » ne devient jamais garanti,
    et une durée de référencement mémorisée n'est pas une durée garantie pour cette opération."""
    block = full_strategy_turn_block("Fais-moi toute la stratégie pour un premier démarrage sous 60 jours")
    assert "garanti sans fondement" in block
    assert "n'est PAS une durée garantie pour cette opération" in block


def test_incomplete_5p_dimension_is_named_in_plain_french_never_as_5p() -> None:
    block = full_strategy_turn_block(
        "Fais-moi toute la stratégie", strategy5p={"readiness": "INCOMPLETE", "next_action_dimension": "people"}
    )
    assert "les personnes" in block
    assert "5P" not in block


def test_unknown_or_missing_5p_projection_names_nothing_invented() -> None:
    assert full_strategy_turn_block("Fais-moi toute la stratégie", strategy5p=None) != ""
    block_unknown_dim = full_strategy_turn_block(
        "Fais-moi toute la stratégie", strategy5p={"readiness": "INCOMPLETE", "next_action_dimension": "bogus"}
    )
    assert "cadrer en premier" not in block_unknown_dim.rsplit("\n", 1)[-1]


def test_english_variant_never_mixes_languages() -> None:
    block = full_strategy_turn_block("Give me the full strategy for this account", english=True)
    assert "FULL STRATEGY REQUESTED" in block
    assert "STRATÉGIE COMPLÈTE" not in block
    assert "guarantee a start delay" in block
