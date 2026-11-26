"""#4183 — Laura ne nomme JAMAIS un contact d'un autre espace ni une provenance.

Le stockage est gardé (CHECK >= 3, `workspace_id = $1`) ; ici on garde ce que le
modèle LIT (résultat d'outil, côté outil) et ce qu'il DIT (réponse). Chaque garde
prouve qu'elle sait dire NON (cas fautif) ET se taire (cas voisin légitime).
"""

from __future__ import annotations

import json

import pytest

from app.services import chat_tools
from app.services.space_boundary_guard import (
    MARKET_MEMORY_ESPACE_NOMME,
    MARKET_MEMORY_FOURNISSEUR_NOMME,
    market_memory_boundary_codes,
    redact_foreign_identity,
)

USER_A = "11111111-1111-4111-8111-111111111111"
# Une personne connue du SEUL espace B.
FOREIGN_PERSON = "Camille Delorme"


def _poisoned_match() -> dict:
    return {
        "company_name": "Thales",
        "coverage": {"covered": True, "market_paths": 41},
        "contact_name": FOREIGN_PERSON,
        "contacts": [{"name": FOREIGN_PERSON, "title": "DSI"}],
        "contributing_workspaces": ["ws-b", "ws-c", "ws-d"],
        "workspace_name": "Cabinet Concurrent",
        "provider": "Apollo",
        "provenance": "pappers",
    }


def test_a_person_from_another_space_is_removed_from_a_shared_corpus_result() -> None:
    cleaned, leaked = redact_foreign_identity("search_market_memory", {"matches": [_poisoned_match()]})
    assert leaked is True
    dumped = json.dumps(cleaned, ensure_ascii=False)
    for forbidden in (FOREIGN_PERSON, "ws-b", "Cabinet Concurrent", "Apollo", "pappers"):
        assert forbidden not in dumped
    # Le fait légitime survit : l'entreprise et sa couverture.
    assert cleaned["matches"][0]["company_name"] == "Thales"
    assert cleaned["matches"][0]["coverage"] == {"covered": True, "market_paths": 41}


def test_a_clean_shared_corpus_result_is_untouched_and_not_flagged() -> None:
    clean = {"matches": [{"company_name": "Thales", "coverage": {"covered": True}}], "truncated": False}
    cleaned, leaked = redact_foreign_identity("search_market_memory", clean)
    assert leaked is False
    assert cleaned == clean


def test_a_count_of_persons_is_not_a_person() -> None:
    """``persons: 5`` est un COMPTE légitime du corpus ; une liste de noms sous la même clé, non."""
    counted = {"matches": [{"esn_observed": [{"esn_name": "Capgemini", "persons": 5}]}]}
    assert redact_foreign_identity("search_market_memory", counted) == (counted, False)
    named = {"matches": [{"persons": [FOREIGN_PERSON]}]}
    cleaned, leaked = redact_foreign_identity("search_market_memory", named)
    assert leaked is True
    assert FOREIGN_PERSON not in json.dumps(cleaned, ensure_ascii=False)


def test_a_portfolio_tool_keeps_its_contacts() -> None:
    """`get_account_contacts` lit le portefeuille de l'appelant : ses contacts sont le produit."""
    mine = {"contacts": [{"name": "Alice Martin", "title": "DSI"}]}
    cleaned, leaked = redact_foreign_identity("get_account_contacts", mine)
    assert leaked is False
    assert cleaned == mine


@pytest.mark.asyncio
async def test_execute_chat_tool_never_hands_a_foreign_person_to_the_model(monkeypatch: pytest.MonkeyPatch) -> None:
    """Le VRAI point d'entrée : espace A interroge, le corpus (mal projeté) porte la personne de B."""
    leaks: list[str] = []

    async def _fake_dispatch(name, tool_input, **kw):
        return {"status": "ok", "matches": [_poisoned_match()]}

    async def _noop(*_a: object, **_k: object) -> None:
        return None

    async def _spy_leak(tool_name: str, *, user_id: str) -> None:
        leaks.append(tool_name)

    monkeypatch.setattr(chat_tools, "_execute_chat_tool_dispatch", _fake_dispatch)
    monkeypatch.setattr(chat_tools, "record_tool_call", _noop)
    monkeypatch.setattr(chat_tools, "record_leak_detected", _spy_leak)

    result = await chat_tools.execute_chat_tool("search_market_memory", {}, user_id=USER_A, profile_data=None)

    assert FOREIGN_PERSON not in json.dumps(result, ensure_ascii=False)
    assert leaks == ["search_market_memory"]


MM_OUTPUT = json.dumps({"matches": [{"company_name": "Thales"}], "methodological_limits": "x"})


def test_a_reply_naming_a_supplier_after_market_memory_is_flagged() -> None:
    codes = market_memory_boundary_codes("D'après Apollo, Thales recrute du Java.", [MM_OUTPUT])
    assert MARKET_MEMORY_FOURNISSEUR_NOMME in codes


def test_a_reply_naming_the_contributing_space_is_flagged() -> None:
    codes = market_memory_boundary_codes("Trois espaces contributeurs ont observé Thales.", [MM_OUTPUT])
    assert MARKET_MEMORY_ESPACE_NOMME in codes
    codes = market_memory_boundary_codes("Un autre espace a vu Thales.", [MM_OUTPUT])
    assert MARKET_MEMORY_ESPACE_NOMME in codes


def test_a_clean_reply_is_not_flagged() -> None:
    assert market_memory_boundary_codes("Thales a été observée sur du Java en Île-de-France.", [MM_OUTPUT]) == ()


def test_without_market_memory_in_the_turn_nothing_is_decidable() -> None:
    """Pas de lecture marché ce tour : citer HubSpot (le CRM branché de l'espace) n'est pas visé ici."""
    assert market_memory_boundary_codes("Ton HubSpot est connecté.", ["{}"]) == ()
