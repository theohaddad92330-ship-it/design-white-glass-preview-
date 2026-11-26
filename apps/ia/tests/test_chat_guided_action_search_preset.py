"""#2162.27 / épopée #2892 — Laura ouvre `/search` avec un preset STRUCTURÉ.

Le lien est PLAT : ``/search?company=…&preset=signal&source=…`` — un paramètre
par champ du preset, du nom du schéma (``analysis-context.ts``). Le web le lit
avec ``analysisContextFromSearch`` (``@bellum/contracts``) ; ICI, le service IA
le vérifie AVANT de le proposer, dans la même porte que les autres liens
profonds (#1933.9) — jamais un nettoyage silencieux :

 1. l'écran est connu (#1903.15) et ses paramètres sont lus ;
 2. un champ qui n'appartient pas au preset annoncé est REFUSÉ ;
 3. un preset ou une valeur hors liste est REFUSÉ, avec ce qui est valable ;
 4. `context` (texte libre) ne voyage pas avec un preset structuré ;
 5. le lien déjà livré (``company`` + ``context``) passe comme avant.

Rien n'est lancé : le débit ne part qu'au clic, après la confirmation du
périmètre à l'écran.
"""

from __future__ import annotations

import pytest

from app.services import chat_tools

USER = "33333333-3333-4333-8333-333333333333"


async def _propose(route: str, label: str = "Nouvelle analyse") -> dict:
    return await chat_tools.execute_chat_tool(
        "propose_guided_action", {"route": route, "label": label}, user_id=USER, profile_data=None
    )


def test_search_is_a_known_screen_of_the_catalogue():
    assert chat_tools._is_known_app_route("/search")
    entry = chat_tools._deep_link_entry("/search")
    assert entry is not None
    params = set(entry["params"])
    assert {"company", "scope", "context", "preset"} <= params
    for fields in chat_tools.SEARCH_PRESET_FIELDS.values():
        assert set(fields) <= params


def test_the_catalogue_params_are_exactly_the_preset_fields_plus_the_base():
    entry = chat_tools._deep_link_entry("/search")
    assert entry is not None
    fields = {field for fields in chat_tools.SEARCH_PRESET_FIELDS.values() for field in fields}
    # #2790 (restes, intégration 27/09) — `accountId` rejoint la base : le
    # handoff « Ouvrir Analyser » après `compare_accounts` désigne le compte.
    assert set(entry["params"]) == {"company", "scope", "context", "preset", "accountId"} | fields


@pytest.mark.asyncio
async def test_a_structured_preset_link_is_proposed():
    route = "/search?company=Capgemini&preset=signal&signalType=tender&source=BOAMP&implication=Refonte+RH"
    result = await _propose(route)
    assert "error" not in result, result
    assert result["proposal"]["route"] == route
    assert result["proposal"]["action"] == "open_screen"
    assert result["proposal"]["cost_credits"] == 0


@pytest.mark.asyncio
async def test_the_free_context_link_already_shipped_still_passes():
    result = await _propose("/search?company=Capgemini&context=Pousser+notre+offre+cloud&scope=france")
    assert "error" not in result, result


@pytest.mark.asyncio
async def test_a_field_of_another_preset_is_refused():
    result = await _propose("/search?company=Capgemini&preset=signal&offer=Cloud")
    assert "`offer`" in result["error"]
    assert "push-offer" in result["error"]


@pytest.mark.asyncio
async def test_a_field_without_preset_is_refused():
    result = await _propose("/search?company=Capgemini&source=BOAMP")
    assert "`preset`" in result["error"]


@pytest.mark.asyncio
async def test_an_unknown_preset_is_refused_with_the_valid_ones():
    result = await _propose("/search?company=Capgemini&preset=urgence")
    assert "urgence" in result["error"]
    assert "push-offer" in result["error"]


@pytest.mark.asyncio
async def test_a_value_out_of_its_list_is_refused():
    result = await _propose("/search?company=Capgemini&preset=signal&signalType=rumeur")
    assert "rumeur" in result["error"]
    assert "tender" in result["error"]


@pytest.mark.asyncio
async def test_an_unknown_scope_is_refused():
    result = await _propose("/search?company=Capgemini&scope=monde")
    assert "monde" in result["error"]


@pytest.mark.asyncio
async def test_free_text_does_not_travel_with_a_structured_preset():
    result = await _propose("/search?company=Capgemini&preset=retry&context=texte&newAngle=Data")
    assert "`context`" in result["error"]


@pytest.mark.asyncio
async def test_an_invented_param_is_still_refused():
    result = await _propose("/search?company=Capgemini&budget=100k")
    assert "`budget`" in result["error"]


def test_the_digest_teaches_the_preset_fields():
    digest = chat_tools._deep_link_screens_digest()
    assert "/search" in digest
    for preset, fields in chat_tools.SEARCH_PRESET_FIELDS.items():
        assert preset in digest
        for field in fields:
            assert field in digest
