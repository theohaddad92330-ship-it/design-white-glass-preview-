"""#3772.5 — l'exclusion STRICTE des données de l'espace est appliquée en code.

« Sans les données du portefeuille » ne se ferme pas par un badge : le
portefeuille, le CRM et l'historique commercial sont vidés dans la copie de la
requête, et les outils qui lisent l'espace quittent le catalogue. Chaque test
sait dire NON : sans le drapeau, le tour est celui d'avant, au byte près.
"""

from __future__ import annotations

from app.models.chat import ChatRequest
from app.services.context_mode import (
    WORKSPACE_DATA_TOOL_NAMES,
    apply_context_mode,
    workspace_data_exclusion_block,
    workspace_data_excluded_tool_names,
)

_PROFILE = {"geoZone": "Zorglubie-Ouest"}


def _req(**extra) -> ChatRequest:
    return ChatRequest(
        message="Quels comptes prioriser ?",
        user_id="user-1",
        profile_data=_PROFILE,
        accounts_summary="Portefeuille : ZorgPortfolio SA",
        crm_presence="CRM : ZorgCRM",
        account_feedback="Historique : perdu chez ZorgPortfolio",
        **extra,
    )


def test_sans_drapeau_rien_ne_change() -> None:
    req = _req()
    narrowed, trace = apply_context_mode(req)
    assert narrowed is req
    assert trace is None
    assert workspace_data_excluded_tool_names(req) == frozenset()
    assert workspace_data_exclusion_block(req, "fr") == ""


def test_exclusion_vide_portefeuille_crm_historique_mais_garde_le_profil() -> None:
    req = _req(exclude_workspace_data=True)
    narrowed, trace = apply_context_mode(req)
    assert narrowed.accounts_summary == ""
    assert narrowed.crm_presence == ""
    assert narrowed.account_feedback == ""
    # « sans portefeuille » n'est pas « neutre » : le profil reste.
    assert narrowed.profile_data == _PROFILE
    # La requête d'entrée n'est jamais modifiée.
    assert req.accounts_summary
    assert trace is not None and trace["workspace_data_excluded"] is True
    assert "portfolio" in trace["excluded_context_layers"]
    assert "profile" in trace["included_context_layers"]


def test_exclusion_et_neutre_se_cumulent() -> None:
    narrowed, trace = apply_context_mode(_req(exclude_workspace_data=True, context_mode="neutral"))
    assert narrowed.profile_data == {}
    assert narrowed.accounts_summary == ""
    assert trace is not None and trace["mode"] == "neutral"


def test_exclusion_retire_les_outils_qui_lisent_l_espace() -> None:
    names = workspace_data_excluded_tool_names(_req(exclude_workspace_data=True))
    assert names == WORKSPACE_DATA_TOOL_NAMES
    assert {"search_workspace_accounts", "get_portfolio_priorities", "get_account_briefing"} <= names


def test_le_bloc_dit_l_exclusion_et_ne_promet_pas_l_oubli() -> None:
    fr = workspace_data_exclusion_block(_req(exclude_workspace_data=True), "fr")
    en = workspace_data_exclusion_block(_req(exclude_workspace_data=True), "en")
    assert "EXCLUSION STRICTE" in fr and "ne prétends pas l'avoir oublié" in fr
    assert "STRICT EXCLUSION" in en and "do not claim to have forgotten" in en


def test_chaque_outil_retire_existe_dans_le_catalogue() -> None:
    from app.services.chat_tools import CHAT_TOOLS

    catalogue = {tool["name"] for tool in CHAT_TOOLS}
    assert WORKSPACE_DATA_TOOL_NAMES <= catalogue


# ── Le tour rejoué : corps HTTP → routeur → prompt système ET outils ─────────

import json  # noqa: E402

import pytest  # noqa: E402

_PORTFOLIO = "Portefeuille : ZorgPortfolio SA (client)"
_CRM = "CRM : ZorgCRM opportunité ouverte"


def _body(**extra) -> dict:
    return {
        "message": "Quels comptes prioriser ?",
        "user_id": "user-1",
        "profile_data": _PROFILE,
        "accounts_summary": _PORTFOLIO,
        "crm_presence": _CRM,
        **extra,
    }


def _terminal_event(text: str) -> dict:
    events = [
        json.loads(block.strip()[len("data:") :].strip())
        for block in text.strip().split("\n\n")
        if block.strip().startswith("data:")
    ]
    return events[-1]


@pytest.fixture
def captured(monkeypatch):
    seen: dict = {}

    async def _call(system, user, **kwargs):
        seen["system"] = system
        seen["kwargs"] = kwargs
        return ("réponse", [])

    async def _rag(*args, **kwargs):
        return ("", [], [])

    monkeypatch.setattr("app.services.chat_orchestrator.run_chat_with_tools", _call)
    monkeypatch.setattr("app.services.rag_knowledge.retrieve_reranked_citations", _rag)
    return seen


def test_tour_rejoue_exclusion_stricte_ni_portefeuille_ni_crm_dans_le_prompt(client, captured):
    res = client.post("/chat/message", json=_body(exclude_workspace_data=True))
    assert res.status_code == 200
    system = captured["system"]
    assert "ZorgPortfolio" not in system
    assert "ZorgCRM" not in system
    assert "EXCLUSION STRICTE" in system
    trace = _terminal_event(res.text)["data"]["context"]["context_mode"]
    assert trace["workspace_data_excluded"] is True


def test_tour_rejoue_temoin_sans_drapeau_le_portefeuille_est_la(client, captured):
    res = client.post("/chat/message", json=_body())
    assert res.status_code == 200
    system = captured["system"]
    assert "ZorgPortfolio" in system
    assert "EXCLUSION STRICTE" not in system
    assert "context_mode" not in _terminal_event(res.text)["data"]["context"]
