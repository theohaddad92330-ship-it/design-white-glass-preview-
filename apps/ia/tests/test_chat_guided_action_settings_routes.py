"""#1822 — `propose_guided_action` refuse une route de RÉGLAGES inventée.

Avant ce lot, l'outil ne vérifiait que `route.startswith("/")` : n'importe
quelle chaîne commençant par une barre passait, y compris une route de
réglages qui n'a jamais existé. Le retour nomme le piège déjà payé :
`/messagerie` proposé à la place de `/mailbox`.

Ce fichier tient la moitié « réglages » (`/settings*`, `/integrations`,
`/billing`) du retour #1822. Le reste de l'application a son propre catalogue
depuis #1903 — `test_chat_guided_action_app_routes.py` : une route hors de ce
domaine n'y passe plus telle quelle, elle doit être un écran de la navigation
ou une fiche.
"""

from __future__ import annotations

import pytest

from app.services import chat_tools

USER = "22222222-2222-4222-8222-222222222222"


async def _propose(route: str, label: str = "Import", highlight: str | None = "Ce que tu y feras") -> dict:
    payload: dict = {"route": route, "label": label}
    if highlight is not None:
        payload["highlight"] = highlight
    return await chat_tools.execute_chat_tool(
        "propose_guided_action", payload, user_id=USER, profile_data=None
    )


@pytest.mark.asyncio
async def test_a_known_settings_route_is_proposed_normally() -> None:
    result = await _propose("/settings/routines")
    assert "error" not in result
    assert result["proposal"]["route"] == "/settings/routines"


@pytest.mark.asyncio
async def test_every_cataloguesd_route_is_individually_accepted() -> None:
    for entry in chat_tools.SETTINGS_SCREENS:
        result = await _propose(str(entry["route"]))
        assert "error" not in result, entry["route"]


# ── #1822 — LE RENVOI N'EST PAS UN REPLI : il DIT ce qu'on va y faire ────────
#
# La décision de Louis a deux moitiés, et celle-ci est la seconde : « Laura
# écrit OU renvoie », mais un renvoi qui ne porte qu'une route rend au
# commercial exactement le travail qu'on lui promettait d'éviter — il arrive sur
# un écran sans savoir ce qu'il y cherche. `highlight` existait déjà et restait
# FACULTATIF : la carte affichait alors « Ouvrir Réglages » et rien d'autre.
#
# Il devient OBLIGATOIRE sur une route de réglages, et là seulement : le reste
# de l'application (un compte, une mission, le vivier) n'a pas de catalogue et
# ce lot n'en construit pas — un écran de compte s'ouvre sur un dossier qui se
# lit tout seul, ce qui n'est pas vrai d'un écran de réglage.


@pytest.mark.asyncio
async def test_a_settings_route_without_a_reason_is_REFUSED() -> None:
    result = await _propose("/settings/lexicon", highlight=None)
    assert "error" in result
    assert "status" not in result


@pytest.mark.asyncio
async def test_a_blank_reason_counts_as_no_reason() -> None:
    """« Une chaîne d'espaces » est le contournement le plus facile d'une règle
    de ce genre — et elle produirait une ligne vide sur la carte."""
    assert "error" in await _propose("/settings/lexicon", highlight="   ")


@pytest.mark.asyncio
async def test_the_reason_travels_in_the_proposal() -> None:
    result = await _propose("/settings/catalogues", highlight="Ajouter « concurrent installé » aux motifs de perte")
    assert result["proposal"]["highlight"] == "Ajouter « concurrent installé » aux motifs de perte"


@pytest.mark.asyncio
async def test_a_route_OUTSIDE_settings_keeps_its_optional_reason() -> None:
    """Témoin du cas légitime voisin : `prepare_consultant_record` renvoie vers
    `/consultants` sans `highlight`, et rien ne doit casser — l'exigence porte
    sur les écrans de RÉGLAGES, pas sur toute l'application."""
    result = await _propose("/consultants", highlight=None)
    assert "error" not in result
    assert "highlight" not in result["proposal"]


def test_the_tool_description_demands_the_reason() -> None:
    description = str(
        next(t for t in chat_tools.CHAT_TOOLS if t["name"] == "propose_guided_action")["description"]
    )
    assert "highlight" in description
    schema = next(t for t in chat_tools.CHAT_TOOLS if t["name"] == "propose_guided_action")["input_schema"]
    # Le schéma NE le rend PAS obligatoire : il le serait alors pour les routes
    # hors réglages aussi, ce que le témoin ci-dessus interdit. La règle est
    # portée par l'exécuteur, qui SAIT si la route est un écran de réglages.
    assert "highlight" not in schema["required"]


@pytest.mark.asyncio
async def test_a_guessed_settings_route_is_refused_with_a_clear_reason() -> None:
    # Le piège nommé par le retour : une route plausible mais inexistante.
    result = await _propose("/settings/messagerie")
    assert "error" in result
    assert "réglages" in result["error"].lower() or "settings" in result["error"].lower()


def test_the_historical_trap_is_not_in_the_settings_catalogue() -> None:
    """`/messagerie` — l'incident cité par le retour — n'est même pas un écran
    de réglages : il ne doit jamais être confondu avec un écran existant."""
    assert "/messagerie" not in {str(e["route"]) for e in chat_tools.SETTINGS_SCREENS}


@pytest.mark.asyncio
async def test_a_non_settings_route_is_left_untouched() -> None:
    """Hors du domaine réglages, le comportement précédent est INCHANGÉ — sinon
    `prepare_consultant_record` (route `/consultants`) casserait."""
    result = await _propose("/consultants")
    assert "error" not in result
    assert result["proposal"]["route"] == "/consultants"


@pytest.mark.asyncio
async def test_the_guided_action_tool_description_names_every_settings_screen() -> None:
    description = str(next(t for t in chat_tools.CHAT_TOOLS if t["name"] == "propose_guided_action")["description"])
    for entry in chat_tools.SETTINGS_SCREENS:
        assert str(entry["route"]) in description, entry["route"]
