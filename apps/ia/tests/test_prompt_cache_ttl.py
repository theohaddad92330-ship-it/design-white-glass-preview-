"""LOT (15/10) DATA-C — cache de prompt à 1 h sur ce qui se relit à plus de 5 min.

Le cache de prompt par défaut vit 5 min. Trois prompts se relisent à des écarts
de 5 à 60 min — la seule fenêtre où l'écriture à 2× (contre 1,25×) se rembourse :

* les system prompts des PHASES (un même espace analyse plusieurs comptes dans
  l'heure ; le refresh nocturne est ÉTALÉ, un compte toutes les N minutes) ;
* Laura entre deux tours espacés de plus de 5 min (outils + system + historique).

Ce fichier garde : la forme sur le fil, l'ordre des TTL (1 h avant 5 min), le
plafond de quatre coupures, le prix d'une écriture 1 h (2×), et que le défaut
reste octet pour octet celui d'avant.
"""

from __future__ import annotations

import json
from types import SimpleNamespace

import pytest

from app.services import chat_orchestrator, prompt_cache_layout
from app.services.chat_tools import tools_for
from app.services.claude_service import (
    CACHE_SEGMENT_BREAK,
    _cache_write_1h_tokens,
    _cached_system,
    _compute_cost,
)
from tests.test_chat_orchestrator import (  # noqa: F401 — fixtures autouse
    _install_client,
    _patch_env,
    _resp,
    _text,
)

_ONE_HOUR = {"type": "ephemeral", "ttl": "1h"}


def _marks(payload: object) -> list[dict]:
    """Toutes les coupures ``cache_control`` d'un morceau de requête."""
    found: list[dict] = []

    def walk(node: object) -> None:
        if isinstance(node, dict):
            if "cache_control" in node:
                found.append(node["cache_control"])
            for value in node.values():
                walk(value)
        elif isinstance(node, list):
            for value in node:
                walk(value)

    walk(payload)
    return found


# ── la primitive ───────────────────────────────────────────────────────────


def test_default_system_block_is_byte_identical() -> None:
    assert _cached_system("x") == [{"type": "text", "text": "x", "cache_control": {"type": "ephemeral"}}]


def test_one_hour_ttl_lands_on_every_breakpoint_of_the_system() -> None:
    blocks = _cached_system(f"a{CACHE_SEGMENT_BREAK}b{CACHE_SEGMENT_BREAK}c", ttl="1h")
    assert _marks(blocks) == [_ONE_HOUR, _ONE_HOUR]
    assert "cache_control" not in blocks[-1]


def test_disabled_cache_ignores_the_ttl() -> None:
    assert _cached_system("x", enabled=False, ttl="1h") == "x"


def test_tools_breakpoint_carries_the_ttl_and_default_is_unchanged() -> None:
    tools = tools_for(None)
    assert _marks(prompt_cache_layout.cache_ordered_tools(tools)) == [{"type": "ephemeral"}]
    assert _marks(prompt_cache_layout.cache_ordered_tools(tools, ttl="1h")) == [_ONE_HOUR]


# ── la politique : qui prend 1 h ─────────────────────────────────────────────


@pytest.mark.parametrize(
    "name",
    [
        "bellum_facts",
        "bellum_signals",
        "bellum_strategy",
        "bellum_contacts_fallback",
        "bellum_contacts_batch_1_of_3",
        "bellum_organigramme",
        "bellum_plan",
        "bellum_plan_evaluation",
        "bellum_messages",
    ],
)
def test_phase_prompts_take_one_hour(name: str) -> None:
    assert prompt_cache_layout.cache_ttl_for(name) == "1h"


@pytest.mark.parametrize("name", ["bellum_chat_title", "bellum_cv_parse", "unknown", "", "bellum_planx"])
def test_other_prompts_keep_the_default(name: str) -> None:
    assert prompt_cache_layout.cache_ttl_for(name) is None


# ── le prix : une écriture 1 h coûte 2×, pas 1,25× ───────────────────────────


def test_one_hour_write_is_priced_twice_the_input() -> None:
    base = _compute_cost(0, 0, "claude-sonnet-5")
    five_min = _compute_cost(0, 0, "claude-sonnet-5", cache_creation_tokens=1_000_000)
    one_hour = _compute_cost(
        0, 0, "claude-sonnet-5", cache_creation_tokens=1_000_000, cache_creation_1h_tokens=1_000_000
    )
    assert base == 0
    assert one_hour == pytest.approx(five_min / 1.25 * 2.0)


def test_one_hour_write_count_is_read_from_the_usage_breakdown() -> None:
    usage = SimpleNamespace(cache_creation=SimpleNamespace(ephemeral_1h_input_tokens=700, ephemeral_5m_input_tokens=3))
    assert _cache_write_1h_tokens(usage) == 700
    assert _cache_write_1h_tokens(SimpleNamespace()) == 0
    assert _cache_write_1h_tokens(SimpleNamespace(cache_creation=None)) == 0


# ── Laura sur le fil ─────────────────────────────────────────────────────────


async def _laura_calls(monkeypatch, responses: list) -> list[dict]:
    fake = _install_client(monkeypatch, responses)
    await chat_orchestrator.run_chat_with_tools(
        "sys", "Analyse Decathlon", user_id="u1", profile_data=None, user_message="Analyse Decathlon"
    )
    return fake.messages.calls


@pytest.mark.asyncio
async def test_laura_caches_tools_system_and_history_for_one_hour(monkeypatch) -> None:
    calls = await _laura_calls(monkeypatch, [_resp("end_turn", [_text("ok")])])
    sent = calls[0]
    assert _marks(sent["tools"]) == [_ONE_HOUR]
    assert _marks(sent["system"]) and all(m == _ONE_HOUR for m in _marks(sent["system"]))
    # La coupure de l'historique est sur le DERNIER message (le tour suivant
    # relit tout ce qui précède, même 20 min plus tard).
    assert _marks(sent["messages"][-1]) == [_ONE_HOUR]
    every = _marks(sent["tools"]) + _marks(sent["system"]) + _marks(sent["messages"])
    assert len(every) <= 4, "le fournisseur refuse plus de quatre coupures"


@pytest.mark.asyncio
async def test_laura_history_breakpoint_never_accumulates_nor_mutates(monkeypatch) -> None:
    from tests.test_chat_orchestrator import _tool_use  # noqa: PLC0415

    calls = await _laura_calls(
        monkeypatch,
        [
            _resp("tool_use", [_tool_use("search_company", {"query": "Decathlon"})]),
            _resp("end_turn", [_text("ok")]),
        ],
    )
    assert len(calls) == 2
    for sent in calls:
        assert len(_marks(sent["messages"])) == 1, "une seule coupure dans l'historique, sur le dernier message"
        assert _marks(sent["messages"][-1]) == [_ONE_HOUR]
    # Le premier message (texte nu) n'a pas été réécrit en place par le 1er appel.
    assert json.dumps(calls[1]["messages"][0], default=str).count("cache_control") == 0
