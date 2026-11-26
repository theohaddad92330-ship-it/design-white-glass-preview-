"""#4434.3 (recette prod 22/10) — « des comptes qui cherchent du Clojure » : 0 compte, « recherche élargie par thème »
sans voisin nommé.

Le moteur applique (ou tente) l'élargissement par compétence ; sa sortie n'arrivait pas à Laura. Elle le reçoit
désormais (`widening_steps` / `widening_tried`) et le code pose UNE ligne qui NOMME les voisines — jamais un zéro sec.
"""

from __future__ import annotations

from typing import Any

import pytest

from app.prompts.laura_acts import ensure_widening_line, widening_line_from_output
from app.services.chat_tools import _skill_widening_fields, execute_chat_tool


def test_4434_3_applied_steps_name_the_neighbour_skills() -> None:
    query = {"widening": {"steps": [{"axis": "skill", "tier": 1, "codes": ["typescript", "react"], "added": 4}]}}
    fields = _skill_widening_fields(query)
    assert fields == {"widening_steps": ["TypeScript, React"]}
    assert widening_line_from_output({"items": [{"name": "A"}], **fields}) == (
        "Peu de comptes sur la compétence exacte : j'ai élargi aux compétences voisines (TypeScript, React)"
    )


def test_4434_3_a_tried_widening_that_found_nothing_is_named_not_a_dry_zero() -> None:
    query = {"wideningTried": [{"axis": "skill", "tier": 1, "terms": ["Scala", "Kotlin"]}]}
    fields = _skill_widening_fields(query)
    assert fields == {"widening_tried": ["Scala", "Kotlin"]}
    line = widening_line_from_output({"items": [], **fields})
    assert line and "Scala, Kotlin" in line and line.startswith("Aucune offre récente")


def test_4434_3_the_guard_says_no_without_widening_and_for_non_skill_axes() -> None:
    assert _skill_widening_fields(None) == {}
    assert _skill_widening_fields({"widening": {"steps": [{"axis": "size", "tier": 1, "codes": ["GC"]}]}}) == {}
    # Des voisines tentées MAIS des comptes rendus : aucune phrase de « rien trouvé ».
    assert widening_line_from_output({"items": [{"name": "A"}], "widening_tried": ["Scala"]}) is None


def test_4434_3_the_model_saying_widened_without_a_neighbour_still_gets_the_line() -> None:
    line = "Peu de comptes sur la compétence exacte : j'ai élargi aux compétences voisines (TypeScript, React)"
    actions = [{"widening_line": line}]
    out = ensure_widening_line("J'ai fait une recherche élargie par thème.\n\nVoici 4 comptes.", actions)
    assert out.startswith(line + ".")


def test_4434_3_the_model_that_names_a_neighbour_is_not_doubled() -> None:
    line = "Peu de comptes sur la compétence exacte : j'ai élargi aux compétences voisines (TypeScript, React)"
    reply = "J'ai élargi à TypeScript, faute d'offre exacte.\n\nVoici 4 comptes."
    assert ensure_widening_line(reply, [{"widening_line": line}]) == reply


class _Response:
    def __init__(self, query: dict[str, Any]) -> None:
        self.candidates: list[dict[str, Any]] = []
        self.degraded: list[dict[str, Any]] = []
        self.query = query
        self.recommendedSort = "balanced"


@pytest.mark.asyncio
async def test_4434_3_run_account_search_hands_the_engine_widening_to_laura(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _fake(req: Any) -> Any:
        return _Response({"wideningTried": [{"axis": "skill", "tier": 1, "terms": ["Scala"]}]})

    monkeypatch.setattr("app.routers.discover.discover_registry", _fake)
    out = await execute_chat_tool(
        "run_account_search", {"technologies": ["Clojure"], "department": "75"}, user_id="u", profile_data=None
    )
    assert out["widening_tried"] == ["Scala"]


def test_4434_3_discover_lists_the_neighbours_it_tried() -> None:
    from app.routers.discover import _skill_widening_tried

    tried = _skill_widening_tried(["Java"])
    assert tried and tried[0]["axis"] == "skill" and tried[0]["terms"]
    # Une compétence hors référentiel n'a pas de voisine directe (#4433.2) : seul le palier DOMAINE s'ouvre,
    # jamais un voisin deviné au palier 1.
    unknown = _skill_widening_tried(["Zzqxv-inconnu"])
    assert unknown and all(step["tier"] >= 2 for step in unknown)
    assert _skill_widening_tried([]) == []


def test_4433_3_a_referential_skill_in_keywords_is_a_skill_not_a_company_name() -> None:
    """« comptes qui cherchent du Clojure à Toulouse » : Clojure (référentiel, famille fonctionnelle) glissé dans
    `keywords` était lu comme une raison sociale → 0 compte, puis élargissement par la ZONE seulement, jamais par
    le palier de compétence voisin (Elixir, Erlang, Haskell…)."""
    from app.services.chat_tools import _split_technologies

    techs, keywords = _split_technologies(None, "Clojure", reclassify=True, hiring=False)
    assert techs == ["Clojure"]
    assert keywords == ""
    # SAIT DIRE NON — une vraie raison sociale reste un nom, et sans cadre (zone/secteur) rien n'est reclassé.
    assert _split_technologies(None, "Sopra", reclassify=True, hiring=False) == ([], "Sopra")
    assert _split_technologies(None, "Clojure", reclassify=False, hiring=False) == ([], "Clojure")
