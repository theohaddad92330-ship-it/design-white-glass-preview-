"""#3223 (#3198.5) — « Market Memory appelée mais non citée » : lu sur le tour, jamais deviné.

Décidable seulement quand la mémoire marché a rendu au moins une entreprise ; « citée » = la réponse
nomme au moins une de ces entreprises. Sans résultat (ou outil non appelé) : non décidable → aucun code.
"""

from __future__ import annotations

import json

from app.services.market_memory_citation import (
    MARKET_MEMORY_CITED,
    MARKET_MEMORY_UNCITED,
    market_memory_citation_codes,
)


def _output(*names: str) -> str:
    return json.dumps(
        {"matches": [{"company_name": n, "market_paths": 4} for n in names], "methodological_limits": "x"}
    )


def test_a_reply_naming_a_returned_company_is_cited() -> None:
    codes = market_memory_citation_codes(
        "Cévennes Défense recrute chez des ESN.", [_output("Cévennes Défense", "Aubrac")]
    )
    assert codes == (MARKET_MEMORY_CITED,)


def test_a_reply_naming_none_of_them_is_uncited() -> None:
    assert market_memory_citation_codes("Voici des pistes générales.", [_output("Aubrac")]) == (MARKET_MEMORY_UNCITED,)


def test_no_result_or_no_tool_is_not_decidable() -> None:
    assert market_memory_citation_codes("texte", [_output()]) == ()
    assert market_memory_citation_codes("texte", ['{"status": "ok"}', "pas du json"]) == ()
    assert market_memory_citation_codes("texte", []) == ()
