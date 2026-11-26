"""#3093 — AUCUNE confirmation de Laura ne demande de taper « go ».

Retour du call bêta Apricot Labs du 24/09/2026 : « pouvoir répondre de manière
interactive sur Laura en mode QCM, pareil pour les « go » ». #2679
(`offer_reply_options`) couvre déjà les précisions posées en texte ; ce fichier
couvre les DEUX confirmations qui restaient du texte à retaper :

 1. `LANCER UNE ANALYSE` (`_BLOCK_TOOLS`) disait encore « termine par : Réponds
    à ce que tu veux, ou dis-moi simplement go » — alors que #2723 (22/09/2026,
    `c84_analyse_recherche_enrichissement_partent_sans_carte`) a DÉJÀ supprimé
    ce palier côté outils (`START_ANALYSIS_TOOL` : « Ne requiert PLUS de « go »
    explicite »). Le bloc de prompt n'avait jamais été mis à jour en face — deux
    consignes contradictoires dans le même system prompt.
 2. `DEUX GESTES` (même bloc) faisait choisir entre le tour d'horizon et
    l'analyse de fond par un « go » / « vas-y » / « lance » tapé en toutes
    lettres, sans jamais appeler `offer_reply_options`.
"""

from __future__ import annotations

from app.prompts.bellum_advisor import _BLOCK_TOOLS, build_system_prompt
from app.services.chat_tools import REPLY_OPTIONS_TOOL_NAME


def test_launching_an_analysis_never_asks_to_type_go() -> None:
    prompt = build_system_prompt({}, {}, "", "")
    assert "dis-moi simplement go" not in prompt
    assert "Au « go »" not in prompt


def test_launching_an_analysis_matches_the_tool_that_no_longer_waits_for_go() -> None:
    # #2723 : les deux outils enchaînent dans le même tour, sans confirmation
    # d'aucune sorte — le bloc de prompt doit dire la même chose, pas l'inverse.
    assert "n'attend" in _BLOCK_TOOLS.lower() or "sans attendre" in _BLOCK_TOOLS.lower()


def test_the_two_gestures_choice_is_clickable_too() -> None:
    prompt = build_system_prompt({}, {}, "", "")
    deux_gestes = prompt[prompt.index("DEUX GESTES") : prompt.index("LANCER UNE ANALYSE")]
    assert REPLY_OPTIONS_TOOL_NAME in deux_gestes
