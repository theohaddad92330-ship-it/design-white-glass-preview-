"""#2124.49 à .55 — Laura PROPOSE les champs de preuve, elle ne les écrit pas.

Décision de Louis du 14/09/2026 : « Laura les propose, l'humain valide ».

Ce que cette suite verrouille, et qui n'est pas décoratif :
  1. l'outil est exposé au modèle, et il est AJOUTÉ EN FIN de liste (le préfixe
     d'outils est mis en cache ; l'insérer au milieu le ferait payer à chaque
     tour) ;
  2. son exécution ne fait QU'UNE LECTURE. Le pont interne est remplacé par une
     double qui fait exploser tout ce qui ressemble à une écriture : si un jour
     quelqu'un branche un chemin d'écriture depuis cet outil, ce test tombe ;
  3. ce qu'aucun enregistrement ne fonde est NOMMÉ vide, jamais comblé ;
  4. sans mission, l'outil le dit — il n'invente pas de cible.
"""

from __future__ import annotations

import pytest

from app.services import bellum_api
from app.services.chat_tools import CHAT_TOOLS, WRITE_TOOL_NAMES, execute_chat_tool

USER = "33333333-3333-4333-8333-333333333333"
MISSION = "44444444-4444-4444-8444-444444444444"

PROPOSAL = {
    "mission": {"mission_id": MISSION, "label": "Migration du socle", "ended_on": None},
    "proof_id": None,
    "proposal": {
        "claim": {"value": "Migration du socle", "from": "mission"},
        "problem": {"value": "Réduire le délai de mise en production", "from": "need"},
        "result": None,
        "expertise": {"value": ["Architecte plateforme"], "from": "mission"},
        "source": "mission",
    },
}


def _tool(name: str) -> dict:
    return next(tool for tool in CHAT_TOOLS if tool["name"] == name)


class _ReadOnlyBridge:
    """Le pont interne, réduit à la seule lecture que cet outil a le droit de faire."""

    def __init__(self) -> None:
        self.calls: list[str] = []

    def is_configured(self) -> bool:
        return True

    async def proof_proposal(self, user_id: str, mission_id: str):
        self.calls.append(f"proof_proposal:{mission_id}")
        return PROPOSAL

    def __getattr__(self, name: str):
        raise AssertionError(
            f"« {name} » n'a rien à faire ici : cet outil PROPOSE, il n'écrit pas et ne lit rien d'autre."
        )


def test_the_tool_is_exposed_and_added_at_the_end_of_the_list():
    names = [tool["name"] for tool in CHAT_TOOLS]
    assert "propose_mission_proof" in names
    # EN FIN de liste : le préfixe d'outils mis en cache ne doit pas bouger.
    # #1903.10 / #1935 — `prepare_campaign` a rejoint la liste APRÈS lui, pour
    # la même raison : le préfixe qui se termine par `propose_mission_proof`
    # reste intact, seul un nouveau suffixe s'ajoute.
    # #2470 — `run_account_search` a suivi, EN FIN, pour la même raison encore.
    # #2268.1/.5/.10 — `note_thread_context` a suivi à son tour, EN FIN.
    # #2271.19 — `get_account_timeline` a suivi à son tour, EN FIN.
    # #2327.26 — `explain_talent_duplicate` a suivi à son tour, EN FIN.
    # #2623.1 — `get_account_contacts` a suivi à son tour, EN FIN.
    # Ce que ce test tient n'est pas un RANG, c'est un ORDRE : chaque nouvel
    # outil s'ajoute après les précédents, jamais entre deux.
    # #2679 — `offer_reply_options` a suivi à son tour, EN FIN.
    # #2301 — `get_account_preflight` a suivi à son tour, EN FIN.
    # #2300 — `get_account_work_contract` a suivi à son tour, EN FIN.
    # #2302 — `resolve_account_territory` a suivi à son tour, EN FIN.
    # #2308 — `get_account_coverage_map` a suivi à son tour, EN FIN.
    # #2324 — `compile_opportunity` et `get_pipeline_health` ont suivi, EN FIN.
    # #2322 — `compile_need` a suivi à son tour, EN FIN.
    # #2721 — `web_search` a suivi à son tour, EN FIN.
    # #2294 — `search_workspace_contacts` a suivi à son tour, EN FIN.
    # #2337 — `plan_talent_territory` a suivi à son tour, EN FIN.
    # #2392 — `compile_day_closure` a suivi à son tour, EN FIN.
    # #2338.8 / #2409.8 — `get_mission_start_readiness` a suivi à son tour, EN FIN.
    # #2423.9 — `propose_mission_amendment` a suivi à son tour, EN FIN.
    # #1950.4 — la PRÉSENCE et l'ordre relatif, jamais la queue : un outil ajouté
    # EN FIN après eux (`describe_plan`) ne doit pas faire tomber ce test.
    assert names[names.index("propose_mission_proof") :][:21] == [
        "propose_mission_proof",
        "prepare_campaign",
        "run_account_search",
        "note_thread_context",
        "get_account_timeline",
        "explain_talent_duplicate",
        "get_account_contacts",
        "offer_reply_options",
        "get_account_preflight",
        "get_account_work_contract",
        "resolve_account_territory",
        "get_account_coverage_map",
        "compile_opportunity",
        "get_pipeline_health",
        "compile_need",
        "web_search",
        # #2294 — la recherche de contacts dans tout l'espace, EN FIN.
        "search_workspace_contacts",
        "plan_talent_territory",
        "compile_day_closure",
        "get_mission_start_readiness",
        "propose_mission_amendment",
    ]


def test_the_tool_says_it_writes_nothing_and_where_the_validation_happens():
    description = _tool("propose_mission_proof")["description"]
    assert "n'écrit rien" in description
    assert "preuves" in description.lower()
    # L'autorisation de citation est un accord du CLIENT : jamais proposée.
    assert "citation" in description.lower()


def test_it_is_not_a_write_tool_because_no_write_path_exists_from_it():
    """Les outils de `WRITE_TOOL_NAMES` débouchent sur une écriture confirmée
    DANS LE FIL. Celui-ci n'en a aucune : la validation vit sur un écran."""
    assert "propose_mission_proof" not in WRITE_TOOL_NAMES


@pytest.mark.asyncio
async def test_it_only_reads_and_returns_a_proposal(monkeypatch):
    bridge = _ReadOnlyBridge()
    monkeypatch.setattr("app.services.bellum_api", bridge)

    result = await execute_chat_tool("propose_mission_proof", {"mission_id": MISSION}, user_id=USER, profile_data=None)

    assert bridge.calls == [f"proof_proposal:{MISSION}"]
    assert result["proposal"]["problem"]["value"] == "Réduire le délai de mise en production"
    assert result["proposal"]["problem"]["from"] == "need"
    # Ce qu'aucun enregistrement ne fonde est NOMMÉ vide, jamais comblé.
    assert result["missing"] == ["result"]
    assert "preuves" in result["writes_nothing"].lower()


@pytest.mark.asyncio
async def test_it_refuses_without_a_mission():
    result = await execute_chat_tool("propose_mission_proof", {}, user_id=USER, profile_data=None)
    assert "error" in result


@pytest.mark.asyncio
async def test_it_says_it_cannot_when_the_bridge_is_not_configured(monkeypatch):
    """Pont éteint ⇒ on le DIT. Une proposition vide se lirait « il n'y a rien
    à tirer de cette mission », ce qui est une réponse fausse à une question
    qu'on n'a pas pu poser."""
    monkeypatch.setattr(bellum_api, "is_configured", lambda: False)
    result = await execute_chat_tool("propose_mission_proof", {"mission_id": MISSION}, user_id=USER, profile_data=None)
    assert "error" in result
