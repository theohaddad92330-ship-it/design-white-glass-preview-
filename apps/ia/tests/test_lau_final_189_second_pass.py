"""LAU-FINAL-189 (#3183) — approfondissement progressif et second passage.

L'issue décrit une architecture à quatre niveaux (PASS 0 contexte local → PASS
3 résolution de contradictions), enchaînée automatiquement dans le tour de
conversation. Ce moteur — détection automatique du niveau à lancer,
enchaînement, budget — est un système de plusieurs jours : hors de ce lot,
versé à l'épopée dédiée.

Une bonne partie du reste est DÉJÀ LÀ, ailleurs, vérifiée avant d'écrire ce
fichier :

* ne pas relancer la même requête à l'identique, et conserver les résultats
  valides d'un tour à l'autre — `THREAD_CONTINUITY_BLOCK`
  (`apps/ia/app/prompts/thread_state.py`) : « Une demande qui RESSERRE une
  recherche déjà préparée... la modifie » / « Ne repose jamais une question
  déjà posée, et ne prépare pas à l'identique une action déjà préparée » ;
* ne facturer que le delta d'un approfondissement, et résumer confirmé /
  changé / ajouté / écarté / non mesuré en fin de passage — le devis et le
  résumé du geste explicite « approfondir » (#2452,
  `packages/contracts/src/schemas/chat-deepen.ts::buildDeepenQuote` et
  `summarizeDeepenRun`) ;
* transformer un long approfondissement en job asynchrone confirmé par un
  humain plutôt que de tout faire dans une réponse — `plan_laura_job`
  (`apps/ia/app/services/laura_job_tool.py`) ;
* une entité ambiguë déclenche une clarification ciblée, jamais une reprise
  à l'identique — `ask_clarification` (`apps/ia/app/services/chat_tools.py`).

Ce que ce fichier verrouille : la consigne RETENUE et neuve — nommer, avant un
passage supplémentaire, ce qu'il cherche à améliorer, et résumer ensuite ce
que le premier passage avait seulement établi contre ce que le second a
résolu — portée par `THREAD_CONTINUITY_BLOCK`, qui existait déjà mais ne
disait pas encore cette partie-là."""

from __future__ import annotations

from app.prompts.bellum_advisor import build_system_prompt
from app.prompts.thread_state import THREAD_CONTINUITY_BLOCK


def test_names_what_the_extra_pass_seeks_to_improve():
    """#3183.6 — avant de lancer un passage supplémentaire, dire en une phrase
    ce qu'il cherche à améliorer par rapport au précédent."""
    assert "ce que ce passage cherche à améliorer" in THREAD_CONTINUITY_BLOCK


def test_summarizes_what_the_first_pass_established_versus_what_the_second_resolved():
    """#3183.9 — le format de synthèse de l'exemple de l'issue : ce que le
    premier passage avait seulement établi, ce que le second a résolu ou
    laisse encore incertain — jamais la même réponse avec plus de texte."""
    assert "ce que le premier passage avait seulement établi" in THREAD_CONTINUITY_BLOCK
    assert "jamais la même réponse avec plus de texte" in THREAD_CONTINUITY_BLOCK


def test_names_the_nine_triggers_from_the_issue():
    """#3183.2 — les déclencheurs de l'issue, nommés (pas reformulés en une
    liste générique)."""
    for trigger in (
        "trouvé insuffisant",
        "mauvais interlocuteurs",
        "confiance faible",
        "entité ambiguë",
        "liste trop générique",
        "conteste",
        "signal non rattaché",
        "chemin d'accès",
        "observation du marché",
    ):
        assert trigger in THREAD_CONTINUITY_BLOCK, f"déclencheur absent : {trigger!r}"
    # #GA-259 (c65_couverture_nest_pas_un_fait_de_marche) — le mot « couverture »
    # ne s'emploie qu'à propos de `get_account_coverage_map` : un déclencheur
    # de second passage se dit autrement pour ne pas laisser croire à un TAUX
    # de couverture de marché (`test_copilote_scope_eval.py`,
    # `test_no_tool_answers_the_market_recourse_coverage_rate_question`).
    assert "couvertur" not in THREAD_CONTINUITY_BLOCK.lower()


def test_the_rule_reaches_the_real_system_prompt():
    """Une règle qui n'atteint jamais `build_system_prompt` n'est pas livrée."""
    prompt = build_system_prompt({}, {}, "", "")
    assert "ce que ce passage cherche à améliorer" in prompt
