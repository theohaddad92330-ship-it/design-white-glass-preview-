"""BEL-SC-239 (lot SC-239 du 28/09 soir) — le pack de proposition dans /chat.

Laura assemble le MÊME plan que l'écran « Préparer la proposition »
(`ProposalsService.buildForProject`), jamais un second calcul. Ce que cette
suite verrouille :
  1. l'outil est exposé au modèle, AJOUTÉ EN FIN de liste, avant `push_profile`
     qui doit en rester le dernier ;
  2. son exécution ne fait QU'UNE LECTURE — le pont interne est remplacé par
     une double qui fait exploser tout ce qui ressemble à une écriture ;
  3. sans besoin, l'outil le dit plutôt que d'inventer une cible ;
  4. un besoin hors espace se lit comme une absence, jamais une exception ;
  5. la description porte le NO-GO du ticket : jamais de fait de consultant
     modifié en silence.
"""

from __future__ import annotations

import pytest

from app.services import bellum_api
from app.services.chat_tools import CHAT_TOOLS, WRITE_TOOL_NAMES, execute_chat_tool

USER = "33333333-3333-4333-8333-333333333333"
PROJECT = "55555555-5555-4555-8555-555555555555"

OUTLINE_VIEW = {
    "project": {"id": PROJECT, "label": "Refonte du socle data", "accountId": "acc-1", "accountName": "Contoso"},
    "outline": {
        "sections": [
            {"key": "context", "state": "ready", "content": ["Client : Contoso"], "gaps": [], "sources": ["compte"]},
            {
                "key": "objections",
                "state": "ready",
                "content": ["Disponibilité de A. Martin pas encore confirmée."],
                "gaps": [],
                "sources": ["équipe positionnée"],
            },
        ],
        "readyCount": 2,
        "complete": True,
    },
}


def _tool(name: str) -> dict:
    return next(tool for tool in CHAT_TOOLS if tool["name"] == name)


class _ReadOnlyBridge:
    """Le pont interne, réduit à la seule lecture que cet outil a le droit de faire."""

    def __init__(self, view: object) -> None:
        self.calls: list[str] = []
        self._view = view

    def is_configured(self) -> bool:
        return True

    async def proposal_outline(self, user_id: str, project_id: str):
        self.calls.append(f"proposal_outline:{project_id}")
        return self._view

    def __getattr__(self, name: str):
        raise AssertionError(f"« {name} » n'a rien à faire ici : cet outil LIT le plan, il n'écrit rien d'autre.")


def test_the_tool_is_exposed_before_push_profile_at_the_end_of_the_list():
    names = [tool["name"] for tool in CHAT_TOOLS]
    assert "prepare_proposal_pack" in names
    # EN FIN de liste, mais AVANT `push_profile` qui doit en rester le dernier
    # (voir test_chat_push_profile_tool.py). #3441/#3442/#3444/#3445 (lot C20,
    # 30/09) a inséré `search_content_library` ENTRE les deux — même règle,
    # `push_profile` reste le DERNIER, les outils neufs s'insèrent au-dessus.
    assert names.index("prepare_proposal_pack") < names.index("push_profile")
    assert names[-1] == "push_profile"


def test_the_tool_says_it_writes_nothing_and_names_the_no_go():
    description = _tool("prepare_proposal_pack")["description"]
    assert "n'écrit rien et n'envoie rien" in description
    assert "silencieusement" in description.lower()


def test_it_is_not_a_write_tool():
    assert "prepare_proposal_pack" not in WRITE_TOOL_NAMES


@pytest.mark.asyncio
async def test_it_only_reads_and_relays_the_outline(monkeypatch):
    bridge = _ReadOnlyBridge(OUTLINE_VIEW)
    monkeypatch.setattr("app.services.bellum_api", bridge)

    result = await execute_chat_tool("prepare_proposal_pack", {"project_id": PROJECT}, user_id=USER, profile_data=None)

    assert bridge.calls == [f"proposal_outline:{PROJECT}"]
    assert result["project"]["label"] == "Refonte du socle data"
    assert result["ready_count"] == 2
    assert result["complete"] is True
    assert result["sections"][1]["key"] == "objections"
    assert "l'écran" in result["writes_nothing"]


@pytest.mark.asyncio
async def test_it_refuses_without_a_project():
    result = await execute_chat_tool("prepare_proposal_pack", {}, user_id=USER, profile_data=None)
    assert "error" in result


@pytest.mark.asyncio
async def test_a_project_outside_the_workspace_reads_as_absence(monkeypatch):
    bridge = _ReadOnlyBridge({"error": "not_found"})
    monkeypatch.setattr("app.services.bellum_api", bridge)

    result = await execute_chat_tool("prepare_proposal_pack", {"project_id": PROJECT}, user_id=USER, profile_data=None)
    assert "error" in result
    assert "espace" in result["error"]


@pytest.mark.asyncio
async def test_it_says_it_cannot_when_the_bridge_is_not_configured(monkeypatch):
    monkeypatch.setattr(bellum_api, "is_configured", lambda: False)
    result = await execute_chat_tool("prepare_proposal_pack", {"project_id": PROJECT}, user_id=USER, profile_data=None)
    assert "error" in result
