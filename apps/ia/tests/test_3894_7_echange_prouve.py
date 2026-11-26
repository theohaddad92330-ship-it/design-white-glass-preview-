"""#3894.7 — « Suite à notre échange » ne suppose JAMAIS un échange non prouvé : la règle couvre toute la
famille de formules qui présupposent un échange passé, et elle vit à UN seul endroit (GA-26)."""

from __future__ import annotations

from app.prompts import commercial_method_turn as turn

FORMULAS = ("merci pour notre échange", "suite à notre appel", "comme convenu", "comme promis", "notre dernier échange")


def test_the_rule_names_the_whole_family_of_presumed_exchange_formulas() -> None:
    rule = turn.PROVEN_EXCHANGE_RULE
    for formula in FORMULAS:
        assert formula in rule.lower(), formula
    assert "interaction tracée" in rule and "prise de contact neutre" in rule


def test_both_message_blocks_carry_the_same_rule() -> None:
    approach = turn.approach_preparation_turn_block("prépare un message de prise de contact pour le DSI de Servier")
    follow_up = turn.recent_contacts_follow_up_turn_block("relance les 2 derniers contacts que j'ai vus chez EDF")
    for block in (approach, follow_up):
        assert turn.PROVEN_EXCHANGE_RULE in block


def test_the_rule_says_no_when_nothing_is_traced() -> None:
    assert "sans interaction tracée" in turn.PROVEN_EXCHANGE_RULE.lower() or "sinon" in turn.PROVEN_EXCHANGE_RULE
