"""#3706 — préciser une recherche en cours sans perdre ni changer le périmètre.

« Cinq entreprises de luxe en Île-de-France » puis « finalement dans toute la
France » : la ZONE change, « luxe » reste. Avant ce lot la région n'était pas un
critère AFFINABLE : `drop: ["region"]` était accepté par le schéma de
`find_accounts` puis ignoré en silence, et `run_account_search` n'exposait pas
la région du tout — le tour d'horizon ne pouvait pas exprimer « Île-de-France ».
"""

from __future__ import annotations

from app.services import chat_tools
from app.services.chat_thread_state import REFINABLE_SEARCH_CRITERIA, ThreadStateCollector

IDF = ["11"]


def _record_luxe_in_idf(tool: str) -> ThreadStateCollector:
    collector = ThreadStateCollector()
    if tool == "find_accounts":
        output = {
            "status": "pending_confirmation",
            "proposal": {"action": "find_accounts", "cost_credits": 0, "keywords": "luxe", "region": IDF},
        }
    else:
        output = {"companies": [{"name": "Maison Lumière"}]}
    collector.record(tool, {"keywords": "luxe", "region": IDF}, output)
    return collector


def test_region_is_a_refinable_criterion_for_both_account_searches():
    for tool in ("find_accounts", "run_account_search"):
        assert "region" in REFINABLE_SEARCH_CRITERIA[tool]


def test_ile_de_france_to_whole_france_drops_the_zone_and_keeps_luxe():
    for tool in ("find_accounts", "run_account_search"):
        collector = _record_luxe_in_idf(tool)
        effective, refinement = collector.prepare(tool, {"refine": True, "drop": ["region"]})
        assert effective == {"keywords": "luxe"}, tool
        assert refinement["dropped"] == ["region"]
        assert refinement["kept"] == {"keywords": "luxe"}


def test_changing_the_zone_replaces_it_and_keeps_luxe():
    for tool in ("find_accounts", "run_account_search"):
        collector = _record_luxe_in_idf(tool)
        effective, refinement = collector.prepare(tool, {"refine": True, "region": ["84"]})
        assert effective == {"keywords": "luxe", "region": ["84"]}, tool
        assert refinement["changed"] == {"region": ["84"]}


def test_the_account_search_tool_exposes_region_and_its_drop():
    schema = chat_tools.RUN_ACCOUNT_SEARCH_TOOL["input_schema"]["properties"]
    assert schema["region"]["items"]["enum"] == list(chat_tools._DISCOVER_REGIONS)
    assert "region" in schema["drop"]["items"]["enum"]
