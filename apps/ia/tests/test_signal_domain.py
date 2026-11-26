"""#3978 — la classification d'un signal par DOMAINE D'OFFRE, au moment de l'analyse.

Avant : `primary_domain_code` n'était jamais écrit pour un compte réel, donc les
trois libellés par signal (le fait, « Ce que ça change », le geste) ne sortaient
jamais. La donnée n'existait pas : rapprocher le texte d'un code après coup aurait
été DEVINER. Ici le modèle classe, et ce qu'il ne sait pas classer reste vide.
"""

from __future__ import annotations

from app.models.outputs.research import ItChallenge, Pain, RecentSignal
from app.prompts import bellum_signals, bellum_strategy
from app.services.offer_domains.portfolio import PACK_PRIORITY
from app.services.offer_domains.signal_domain import (
    SIGNAL_DOMAIN_CODES,
    normalize_signal_domain,
    signal_domain_prompt_line,
)


def test_classifiable_codes_are_the_packs_minus_the_catch_all() -> None:
    # Les codes de PACK : c'est le vocabulaire que l'écran compare au pack de
    # l'espace (`ownDomainCodes`). `generic` est le fourre-tout : classer un
    # signal « autre » dedans ferait « toucher l'expertise » de tout vendeur
    # générique — il reste donc vide.
    assert "generic" not in SIGNAL_DOMAIN_CODES
    assert set(SIGNAL_DOMAIN_CODES) == set(PACK_PRIORITY) - {"generic"}
    assert "esn_it" in SIGNAL_DOMAIN_CODES


def test_normalize_keeps_a_known_code_and_never_guesses() -> None:
    assert normalize_signal_domain("finance") == "finance"
    assert normalize_signal_domain("  Finance ") == "finance"
    # Inconnu, fourre-tout, vide, mauvais type : vide — jamais un code deviné.
    assert normalize_signal_domain("generic") == ""
    assert normalize_signal_domain("domaine_invente") == ""
    assert normalize_signal_domain("CLOUD_DEVOPS_SRE") == ""  # code FIN, pas un pack
    assert normalize_signal_domain("") == ""
    assert normalize_signal_domain(None) == ""
    assert normalize_signal_domain(["finance"]) == ""


def test_signal_accepts_camel_and_snake_and_serializes_snake() -> None:
    camel = RecentSignal(signal="x", domainCode="cyber")
    snake = RecentSignal(signal="x", domain_code="cyber")
    assert camel.domain_code == snake.domain_code == "cyber"
    assert camel.model_dump(by_alias=True)["domain_code"] == "cyber"


def test_signal_pain_challenge_drop_an_unknown_code() -> None:
    assert RecentSignal(signal="x", domainCode="inventé").domain_code == ""
    assert Pain(pain="x", domain_code="generic").domain_code == ""
    assert ItChallenge(title="x", description="y", domainCode="supply_chain").domain_code == "supply_chain"
    # Absent = vide : les analyses écrites avant cette capacité restent valides.
    assert RecentSignal(signal="x").domain_code == ""
    assert Pain(pain="x").domain_code == ""
    assert ItChallenge(title="x", description="y").domain_code == ""


def test_prompt_line_lists_the_closed_vocabulary_and_the_empty_rule() -> None:
    line = signal_domain_prompt_line()
    for code in SIGNAL_DOMAIN_CODES:
        assert code in line
    assert "generic" not in line
    assert "vide" in line.lower()  # le droit de ne pas classer est écrit


def test_signals_and_strategy_prompts_ask_for_the_field() -> None:
    signals_prompt = bellum_signals.build_user_prompt("Acme", "", "", "")
    assert '"domainCode"' in signals_prompt
    strategy_prompt = bellum_strategy.build_user_prompt("Acme", "", "", "", "")
    assert strategy_prompt.count('"domainCode"') == 2  # pains + itChallenges
