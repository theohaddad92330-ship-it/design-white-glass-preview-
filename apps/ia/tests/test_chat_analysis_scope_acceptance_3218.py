"""#3218 (réfuté, recette 07/10) — « Lance maintenant l'analyse approfondie de BNP
Paribas » redemandait un périmètre à chaque tour et ne lançait jamais, même quand la
personne acceptait un périmètre par défaut (« lance-la ») ou choisissait une des puces
proposées par `offer_reply_options`. `_BLOCK_ANALYSIS_SCOPE` (#3434) pose la question
de périmètre mais ne disait rien du tour SUIVANT : une acceptation générique, ou le
choix d'une puce déjà offerte, doit déclencher `plan_account_analysis` immédiatement —
jamais reposer la même question.
"""

from __future__ import annotations

from app.prompts.bellum_advisor import _BLOCK_ANALYSIS_SCOPE, build_system_prompt


def test_a_generic_acceptance_launches_on_the_default_scope_proposed():
    """#3218.1 — « lance-la », « vas-y », « oui » après une question de périmètre
    DÉCLENCHE l'analyse sur le premier périmètre proposé, jamais une nouvelle
    question."""
    block = _BLOCK_ANALYSIS_SCOPE
    assert "« lance-la »" in block or "« vas-y »" in block
    assert "premier périmètre proposé" in block or "périmètre par défaut" in block
    assert "jamais reposer la question" in block or "ne repose jamais la question" in block


def test_a_picked_bullet_launches_immediately_never_asked_twice():
    """#3218.2 — une puce choisie (réponse à `offer_reply_options`) relance
    `plan_account_analysis` sur CE périmètre, dans le même tour, jamais une relance
    de la question."""
    block = _BLOCK_ANALYSIS_SCOPE
    assert "puce" in block
    assert "immédiatement" in block or "dans ce même tour" in block


def test_the_rule_reaches_the_real_system_prompt():
    prompt = build_system_prompt({}, {}, "", "")
    assert "APRÈS UNE QUESTION DE PÉRIMÈTRE" in prompt or "lance-la" in prompt
