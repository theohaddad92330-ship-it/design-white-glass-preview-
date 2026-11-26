"""#2434.56 (épopée #3579) — `propose_bulk_enrichment`.

« Enrichis ces dix contacts » à la voix : `ENRICH_CONTACT_TOOL` ne prend qu'un
`contact_id`. Ce test REJOUE le tour (entrée du modèle → outil appelé → carte) et tient :

1. l'outil est exposé, compté comme écriture, AVANT `push_profile` (qui reste le dernier) ;
2. son exécution rend une PROPOSITION avec le COÛT TOTAL annoncé (jamais un effet, jamais un débit) ;
3. un contact étranger, introuvable ou sans ancre org, ou un lot trop gros, ne donne AUCUNE carte.
"""

from __future__ import annotations

import pytest

from app.services import chat_tools
from app.services.chat_tools import CHAT_TOOLS, WRITE_TOOL_NAMES, execute_chat_tool

USER = "11111111-1111-4111-8111-111111111111"
C_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
C_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
C_NO_ORG = "cccccccc-cccc-4ccc-8ccc-cccccccccccc"

_CONTACTS = {
    C_A: {"id": C_A, "full_name": "Ada Lovelace", "entity": "Decathlon", "account_id": None},
    C_B: {"id": C_B, "full_name": "Alan Turing", "entity": None, "account_id": "acc-1"},
    C_NO_ORG: {"id": C_NO_ORG, "full_name": "Sans Ancre", "entity": None, "account_id": None},
}


@pytest.fixture(autouse=True)
def _scoped_reads(monkeypatch: pytest.MonkeyPatch) -> None:
    async def fake_resolve(contact_id: str, user_id: str, *, columns: str = ""):
        return _CONTACTS.get(contact_id)

    async def fake_account_name(account_id, user_id):
        return "Orange" if account_id == "acc-1" else ""

    monkeypatch.setattr(chat_tools, "_resolve_owned_contact", fake_resolve)
    monkeypatch.setattr(chat_tools, "_account_name_for", fake_account_name)


async def _run(tool_input: dict) -> dict:
    return await execute_chat_tool("propose_bulk_enrichment", tool_input, user_id=USER, profile_data=None)


def test_tool_is_registered_before_push_profile_and_counted_as_a_write() -> None:
    names = [tool["name"] for tool in CHAT_TOOLS]
    assert names[-1] == "push_profile"
    assert names.index("propose_bulk_enrichment") < names.index("push_profile")
    assert "propose_bulk_enrichment" in WRITE_TOOL_NAMES


def test_search_tool_tells_the_model_to_resolve_homonyms_one_at_a_time() -> None:
    """#3579 — recette prod 08/10 : « enrichis Olivier Fourt, Marie de Sanofi et
    Annick de QUIETALIS » redemandait de choisir entre homonymes DEUX tours de
    suite, sans jamais produire la carte. Le modèle n'avait aucune consigne
    pour reprendre un nom déjà clarifié par un repère donné en langage libre
    (« Marie de Sanofi ») plutôt que de tout redemander — cette consigne doit
    exister dans la description de l'outil qui résout les noms."""
    tool = next(tool for tool in chat_tools.CHAT_TOOLS if tool["name"] == "search_workspace_contacts")
    description = tool["description"]
    assert "relance CET appel avec `company`" in description
    assert "ne redemande JAMAIS le même choix déjà répondu" in description


@pytest.mark.asyncio
async def test_turn_returns_one_proposal_with_the_total_ceiling() -> None:
    result = await _run({"contact_ids": [C_A, C_B, C_A]})
    proposal = result.get("proposal") or result
    assert proposal["action"] == "propose_bulk_enrichment"
    assert [c["contact_id"] for c in proposal["contacts"]] == [C_A, C_B]  # dédoublonné, ordre gardé
    assert [c["organization_name"] for c in proposal["contacts"]] == ["Decathlon", "Orange"]
    assert proposal["cost_credits"] == 2
    assert proposal["credit_kind"] == "enrichment"


@pytest.mark.asyncio
@pytest.mark.parametrize(
    "tool_input",
    [
        {"contact_ids": []},
        {"contact_ids": [C_A, "dddddddd-dddd-4ddd-8ddd-dddddddddddd"]},  # étranger / inventé
        {"contact_ids": [C_A, C_NO_ORG]},  # l'endpoint unitaire refuserait le clic
        {"contact_ids": [f"id-{i}" for i in range(11)]},  # trop gros pour être relu
    ],
)
async def test_unreadable_or_oversized_batch_gives_no_card(tool_input: dict) -> None:
    result = await _run(tool_input)
    assert "error" in result
    assert "proposal" not in result and "action" not in result


# ── LOT (15/10) DATA-B.5 — le lot ne paie que ce qui manque ─────────────────────────────────────


@pytest.mark.asyncio
async def test_bulk_skips_contacts_whose_coordinates_are_already_known() -> None:
    """C_A a e-mail ET téléphone : exclu, nommé, jamais compté dans le plafond. C_B n'a que l'e-mail :
    téléphone seul."""
    _CONTACTS[C_A] = {**_CONTACTS[C_A], "email": "ada@example.com", "phone": "+33 1 00 00 00 00"}
    _CONTACTS[C_B] = {**_CONTACTS[C_B], "email": "alan@example.com", "phone": None}
    try:
        result = await _run({"contact_ids": [C_A, C_B]})
    finally:
        _CONTACTS[C_A] = {k: v for k, v in _CONTACTS[C_A].items() if k not in ("email", "phone")}
        _CONTACTS[C_B] = {k: v for k, v in _CONTACTS[C_B].items() if k not in ("email", "phone")}
    proposal = result["proposal"]
    assert [c["contact_id"] for c in proposal["contacts"]] == [C_B]
    assert proposal["contacts"][0]["only"] == "phone"
    assert proposal["cost_credits"] == 1
    assert result["already_complete"] == ["Ada Lovelace"]


@pytest.mark.asyncio
async def test_bulk_with_every_contact_already_complete_yields_no_card() -> None:
    _CONTACTS[C_A] = {**_CONTACTS[C_A], "email": "ada@example.com", "phone": "+33 1 00 00 00 00"}
    try:
        result = await _run({"contact_ids": [C_A]})
    finally:
        _CONTACTS[C_A] = {k: v for k, v in _CONTACTS[C_A].items() if k not in ("email", "phone")}
    assert "proposal" not in result and "action" not in result
    assert result["status"] == "nothing_to_enrich"
