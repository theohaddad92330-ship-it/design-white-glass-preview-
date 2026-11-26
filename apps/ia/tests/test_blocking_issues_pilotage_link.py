"""#3397.7 — « Voir ce qui bloque l'équipe » ouvre Pilotage.

`get_blocking_issues` dit CE QUI bloque ; la demande de l'issue est que la
recommandation soit reliée à la page qui en est propriétaire. `/pilotage` existe
au catalogue de navigation, mais la description du tool ne disait jamais à Laura
de proposer ce lien : elle décrivait le blocage sans emmener nulle part.

Tranché sans Louis : un lien SANS filtre. `/pilotage` ne lit aucun paramètre et
`get_blocking_issues` ne rend pas d'identifiant de dossier stable ; inventer un
filtre serait « un filtre annoncé, jamais lu » (#1933.9). La porte reste celle de
l'écran (gestionnaires uniquement) : Laura le dit au lieu de promettre l'accès.
"""

from __future__ import annotations

import pytest

from app.services import chat_tools

USER = "33333333-3333-4333-8333-333333333333"


def test_the_blocking_issues_description_sends_the_manager_to_pilotage():
    description = str(chat_tools.BLOCKING_ISSUES_TOOL["description"])
    assert "`/pilotage`" in description
    assert "gestionnaire" in description


def test_pilotage_is_a_real_catalogued_route():
    assert "/pilotage" in {str(entry["route"]) for entry in chat_tools.APP_SCREENS}


@pytest.mark.asyncio
async def test_the_pilotage_link_is_accepted_bare_and_a_filter_it_does_not_read_is_not_invented():
    ok = await chat_tools.execute_chat_tool(
        "propose_guided_action",
        {"route": "/pilotage", "label": "Voir ce qui bloque l'équipe"},
        user_id=USER,
        profile_data=None,
    )
    assert "error" not in ok


@pytest.mark.asyncio
@pytest.mark.parametrize("issues", [[], ["Gmail n'est plus connecté."]])
async def test_3397_7_the_result_always_names_its_scope_and_the_pilotage_screen(monkeypatch, issues):
    """#3397.7 (recette prod 02/10) — « Qu'est-ce qui bloque l'équipe ? » : l'outil rendait
    « aucun blocage » sans lien ni phrase. Il ne couvre que les CONNEXIONS : le résultat le dit
    (jamais « rien ne bloque l'équipe ») et porte toujours l'écran propriétaire, même sans bloqueur.

    Question exacte à poser en recette : /chat, « Qu'est-ce qui bloque l'équipe ? » — Laura propose
    « Ouvrir Pilotage » (ou dit que l'écran est réservé aux gestionnaires) et ne conclut pas
    « aucun blocage » pour l'équipe."""
    from app.services import bellum_api

    async def _issues(*_a, **_kw):
        return {"issues": issues}

    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)
    monkeypatch.setattr(bellum_api, "laura_blocking_issues", _issues)
    result = await chat_tools.execute_chat_tool("get_blocking_issues", {}, user_id=USER, profile_data=None)

    assert result["issues"] == issues
    assert "connexions" in result["scope"] and "équipe" in result["scope"]
    assert result["team_screen"]["route"] == "/pilotage"
    assert result["team_screen"]["label"] == "Ouvrir Pilotage"
    assert "écran réservé aux gestionnaires" in result["team_screen"]["if_not_manager"]


@pytest.mark.asyncio
async def test_3397_7_a_failed_read_stays_an_error_without_the_team_screen(monkeypatch):
    from app.services import bellum_api

    async def _down(*_a, **_kw):
        return None

    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)
    monkeypatch.setattr(bellum_api, "laura_blocking_issues", _down)
    result = await chat_tools.execute_chat_tool("get_blocking_issues", {}, user_id=USER, profile_data=None)
    assert "error" in result and "team_screen" not in result
