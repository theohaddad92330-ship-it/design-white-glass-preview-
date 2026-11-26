"""`pin_memory_fact` — #1793, « lui poser un gros pavé de contexte » (Lot 16).

Le lot 12 avait audité et PARQUÉ #1793 : `/settings/memory` est en lecture
seule, `/settings/profile/context` est généré, `ProfileComplementCard` pose
CINQ questions à choix FERMÉ. La capacité « je colle du texte libre et ça
enrichit ce que Laura relit » n'existait nulle part. Ce fichier verrouille la
version AUTORISÉE : elle passe par le MÊME chemin que `toggle_routine` /
`propose_settings_update` (`_proposal`, `pending_confirmation`), et écrit dans
la MÊME table que le pin manuel (`memory_pinned_facts`, `POST /memory/facts`)
— jamais une table neuve.

⚠️ Contrairement aux deux autres écritures de ce lot, celle-ci ne RÉSOUT rien
contre un pont : épingler un texte est un AJOUT, pas une bascule contre un
catalogue fermé. Même garantie que `prepare_consultant_record` : AUCUN appel
réseau, à aucun moment.
"""

from __future__ import annotations

import pytest

from app.services import bellum_api, chat_tools

USER = "11111111-1111-4111-8111-111111111111"


async def _run(tool_input: dict) -> dict:
    return await chat_tools.execute_chat_tool(
        "pin_memory_fact", tool_input, user_id=USER, profile_data=None
    )


# ── 1. Registre ─────────────────────────────────────────────────────────────


def test_pin_memory_fact_is_declared() -> None:
    names = {tool["name"] for tool in chat_tools.CHAT_TOOLS}
    assert "pin_memory_fact" in names


def test_pin_memory_fact_is_appended_after_the_two_settings_writes() -> None:
    """La règle du fichier : une primitive nouvelle se pose EN FIN de liste,
    jamais au milieu — insérer invaliderait le préfixe d'outils mis en cache
    pour tous les tours suivants.

    ⚠️ Plus « le dernier » depuis #1822 : `get_memory` et
    `get_workspace_vocabulary` ont été appendus après, et `get_memory` est
    précisément la LECTURE qui manquait à cet outil-ci — on épinglait dans une
    mémoire qu'aucun outil ne savait relire. L'invariant qui compte n'est donc
    pas « c'est le dernier » mais « il reste APRÈS les deux écritures de
    réglages, sans rien d'inséré entre elles et lui »."""
    names = [str(tool["name"]) for tool in chat_tools.CHAT_TOOLS]
    index = names.index("pin_memory_fact")
    assert names[index - 2 : index + 1] == [
        "get_settings_overview",
        "propose_settings_update",
        "pin_memory_fact",
    ]


def test_pin_memory_fact_is_counted_as_a_write_tool() -> None:
    assert "pin_memory_fact" in chat_tools.WRITE_TOOL_NAMES


def test_pin_memory_fact_description_announces_the_confirmation_step() -> None:
    tool = next(item for item in chat_tools.CHAT_TOOLS if item["name"] == "pin_memory_fact")
    description = str(tool["description"]).lower()
    assert "valid" in description
    assert "n'écrit rien" in tool["description"]


def test_pin_memory_fact_requires_only_fact() -> None:
    schema = next(item for item in chat_tools.CHAT_TOOLS if item["name"] == "pin_memory_fact")["input_schema"]
    assert schema["required"] == ["fact"]
    assert "account_id" in schema["properties"]


# ── 2. AUCUN appel réseau, à aucun moment ────────────────────────────────────


@pytest.mark.asyncio
async def test_no_network_call_ever_even_without_clearing_the_bridge_env(monkeypatch: pytest.MonkeyPatch) -> None:
    """Contrairement à `toggle_routine`/`propose_settings_update`, cet outil ne
    dépend d'AUCUNE configuration de pont — même un pont mal configuré ne doit
    jamais partir en requête."""

    def _explode(*_args: object, **_kwargs: object) -> None:
        raise AssertionError("aucun appel réseau ne doit jamais partir pour épingler un fait")

    monkeypatch.setattr("httpx.AsyncClient", _explode)
    out = await _run({"fact": "Le cycle de vente dure six semaines."})
    assert out["status"] == "pending_confirmation"


def test_bellum_api_exposes_no_write_verb_for_memory() -> None:
    """Preuve par l'absence, comme pour les routines et les réglages."""
    assert not hasattr(bellum_api, "pin_memory_fact")
    assert not hasattr(bellum_api, "create_memory_fact")


# ── 3. La proposition ─────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_returns_a_proposal_and_writes_nothing() -> None:
    out = await _run({"fact": "  Compter six semaines de cycle de vente.  "})
    assert out["status"] == "pending_confirmation"
    proposal = out["proposal"]
    assert proposal["action"] == "pin_memory_fact"
    assert proposal["fact"] == "Compter six semaines de cycle de vente."
    assert proposal["cost_credits"] == 0
    assert "account_id" not in proposal


@pytest.mark.asyncio
async def test_carries_the_account_id_when_given() -> None:
    out = await _run({"fact": "DSI décideur sur ce compte.", "account_id": "acc-9"})
    assert out["proposal"]["account_id"] == "acc-9"


@pytest.mark.asyncio
async def test_an_empty_fact_is_refused() -> None:
    out = await _run({"fact": "   "})
    assert "error" in out
    assert "status" not in out


@pytest.mark.asyncio
async def test_a_missing_fact_is_refused() -> None:
    out = await _run({})
    assert "error" in out


@pytest.mark.asyncio
async def test_an_overlong_fact_is_truncated_to_the_shared_contract_bound() -> None:
    """La borne (2000) est celle de `createMemoryItemSchema`
    (`packages/contracts/src/schemas/memory-item.ts`) — tronquer ICI plutôt que
    de laisser l'écriture réelle échouer à la validation derrière le clic."""
    out = await _run({"fact": "x" * 3000})
    assert len(out["proposal"]["fact"]) == 2000
