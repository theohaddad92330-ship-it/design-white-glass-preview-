"""#1903.1 — « COMPRENDRE » a un marqueur nommé, comme les douze autres intentions.

Le registre (#1903.1, `.claude/notes/registre-2026-09-12.md`) trouvait `_BLOCK_IDENTITY`
partiel : sa ligne MISSION nomme déjà les six familles d'intention (« compréhension,
une recommandation, une préparation d'action, une exécution, un contrôle ou un
apprentissage ») mais aucune n'a de bloc à elle qui dise CE QUE Laura fait d'une
question de pure compréhension — contrairement à PRIORISER (`_BLOCK_PRIORITISATION`),
DÉCOUVRIR BELLUM (`_BLOCK_DISCOVERY`) ou EXÉCUTER (`_BLOCK_TOOLS`), qui en ont chacune un.

Sans marqueur, rien n'empêche un tour de compréhension (« qu'est-ce que le score
de fraîcheur ? », « pourquoi ce compte remonte-t-il ? ») d'appeler un outil qui ne
lui sert à rien : personne ne lui dit explicitement de répondre d'abord avec ce
qu'elle sait déjà.

⚠️ CE QUE CE TEST PROUVE, ET CE QU'IL NE PROUVE PAS. Il tient la RÈGLE écrite là où
le modèle la lit — le prompt système, dans son segment invariant (même famille que
`test_ask_clarification_routing_scope.py`, #1903.22). Il ne prouve pas qu'un modèle
donné l'applique à chaque tour : ça, c'est la recette en ligne.
"""

from __future__ import annotations

from app.prompts.bellum_advisor import build_system_prompt

#: Le prompt « nu » : tout ce qu'on y trouve vient des blocs constants.
BARE = build_system_prompt({}, {}, "", "")


def test_a_named_comprendre_marker_exists() -> None:
    # Dire NON : un marqueur nommé « COMPRENDRE », pas juste la ligne MISSION
    # générique de `_BLOCK_IDENTITY` qui ne nomme aucune des six familles à part.
    assert "COMPRENDRE" in BARE


def test_it_says_to_answer_directly_without_a_superfluous_tool() -> None:
    # Le coeur de la demande #1903.1 : « une question de compréhension recevra
    # une réponse directe sans outil superflu ».
    start = BARE.index("COMPRENDRE")
    # Le bloc suivant commence à `_BLOCK_TOOLS` (« OUTILS, EXÉCUTION ET
    # APPROBATION »), qui referme la fenêtre de recherche.
    end = BARE.index("OUTILS, EXÉCUTION ET APPROBATION")
    segment = BARE[start:end]
    assert "sans outil" in segment or "sans appeler d'outil" in segment
    assert "directement" in segment.lower()


def test_it_still_allows_a_tool_when_the_answer_needs_a_missing_fact() -> None:
    # Ne doit pas dégénérer en « jamais d'outil » : quand la réponse dépend
    # d'une donnée absente, le bloc doit prévoir de la chercher.
    start = BARE.index("COMPRENDRE")
    end = BARE.index("OUTILS, EXÉCUTION ET APPROBATION")
    segment = BARE[start:end]
    assert "sauf" in segment.lower()
