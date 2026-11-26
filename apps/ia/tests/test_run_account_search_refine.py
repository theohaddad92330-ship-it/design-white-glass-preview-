"""#3201.1 (épopée #3224) — le tour d'horizon (`run_account_search`) sait
RESSERRER une recherche déjà exécutée dans ce fil, exactement comme
`find_accounts`. Trois choses à vérifier, séparément :

* le SCHÉMA d'outil déclare `refine`/`drop`, et `drop` n'énumère RIEN qui ne
  soit mémorisé (un critère absent de `REFINABLE_SEARCH_CRITERIA` n'a aucun
  effet à `drop` — l'énumérer tromperait le modèle) ;
* la boucle d'orchestration — l'APPELANT RÉEL de
  `ThreadStateCollector.prepare`, jamais testé directement jusqu'ici pour
  aucun outil de ce fichier — fusionne bien `refine: true` AVANT d'exécuter
  l'outil, pas seulement le mécanisme générique testé en isolation dans
  `test_chat_thread_state.py`.
"""

from __future__ import annotations

from app.services import chat_orchestrator
from app.services.chat_thread_state import REFINABLE_SEARCH_CRITERIA, ThreadStateCollector
from app.services.chat_tools import RUN_ACCOUNT_SEARCH_TOOL


def test_the_tool_schema_declares_refine_and_drop() -> None:
    properties = RUN_ACCOUNT_SEARCH_TOOL["input_schema"]["properties"]
    assert properties["refine"]["type"] == "boolean"
    assert set(properties["drop"]["items"]["enum"]) == set(REFINABLE_SEARCH_CRITERIA["run_account_search"])


def test_the_orchestrator_merges_refine_before_executing_the_tool() -> None:
    """L'APPELANT réel : `_prepared_call`, pas `ThreadStateCollector.prepare` en
    isolation. Un tour d'horizon en Île-de-France, puis « et effectif 250-999 »
    avec `refine: true` : le SECOND appel exécuté doit porter les DEUX."""
    collector = ThreadStateCollector()
    collector.record(
        "run_account_search",
        {"department": "75"},
        {"accounts": []},
    )
    call = chat_orchestrator._ToolCall(id="call-1", name="run_account_search", input={"refine": True, "headcount": "250-999"})

    prepared, refinement = chat_orchestrator._prepared_call(call, collector)

    assert prepared.input == {"department": "75", "headcount": "250-999"}
    assert refinement == {
        "previous_found": True,
        "kept": {"department": "75"},
        "changed": {"headcount": "250-999"},
        "dropped": [],
    }
