"""#3196.5 (LAU-FINAL-202, épopée #3236) — le REJEU d'un appel déjà exécuté
dans le même tour, pas seulement sa DÉTECTION.

Le lot du 28/09 (commit f502c532b) journalisait déjà les doublons
(`duplicate_call_names`) sans changer le chemin d'exécution. Cette tranche
fait le pas suivant : une LECTURE dont la signature (nom + arguments) a déjà
un résultat dans `replay_cache` ne repart jamais sur le réseau — elle reprend
le résultat déjà obtenu, marqué ``replayed: True``. Restreint aux lectures :
une écriture n'est jamais idempotente (crédit débité, proposition émise), la
rejouer sans exécuter changerait son sens.
"""

from __future__ import annotations

import asyncio

from app.services import chat_orchestrator, tool_resilience
from app.services.chat_orchestrator import _run_tool_round, _ToolCall


def _bypass_short_ttl_dedup(monkeypatch) -> None:
    """`tool_resilience.execute_chat_tool_resilient` a son PROPRE cache
    (`tool_idempotency`, TTL 5s, #2283.24) — une coalescence de quasi-doublon
    volontairement à courte portée (voir son docstring), PAS le rejeu de tout
    un tour que cette suite teste. Le désactiver isole la couche sous test.
    `tool_resilience` importe `recent_result`/`remember_result` PAR NOM (donc
    lié dans SON espace de noms) — monkeypatcher `tool_idempotency` ne
    suffirait pas, voir `from … import` en tête de `tool_resilience.py`."""
    monkeypatch.setattr(tool_resilience, "recent_result", lambda _key: None)
    monkeypatch.setattr(tool_resilience, "remember_result", lambda _key, _result: None)


async def _noop(_event: dict) -> None:
    return None


def _round(calls: list[_ToolCall], replay_cache: dict | None):
    return asyncio.run(
        _run_tool_round(
            calls,
            user_id="u1",
            profile_data=None,
            crm_connected=False,
            crm_provider="",
            emit=_noop,
            replay_cache=replay_cache,
        )
    )


def test_a_repeated_read_in_a_later_round_is_replayed_not_re_executed(monkeypatch):
    calls_made: list[dict] = []

    async def _fake(name, tool_input, **_kwargs):
        calls_made.append({"name": name, "input": dict(tool_input)})
        return {"revenue": 42}

    monkeypatch.setattr(chat_orchestrator, "execute_chat_tool", _fake)

    cache: dict = {}
    first_call = [_ToolCall(id="t1", name="get_revenue", input={"account_id": "a1"})]
    actions_1, results_1, _stop = _round(first_call, cache)
    assert len(calls_made) == 1
    assert actions_1[0].get("replayed") is None
    assert results_1[0][1] == {"revenue": 42}

    # Round 2 du MÊME tour (même `cache`) : mêmes nom + arguments.
    second_call = [_ToolCall(id="t2", name="get_revenue", input={"account_id": "a1"})]
    actions_2, results_2, _stop = _round(second_call, cache)

    # La source n'a PAS été rappelée — un seul appel réel au total.
    assert len(calls_made) == 1
    assert actions_2[0]["replayed"] is True
    assert results_2[0][1] == {"revenue": 42}


def test_different_arguments_are_not_replayed(monkeypatch):
    calls_made: list[dict] = []

    async def _fake(name, tool_input, **_kwargs):
        calls_made.append({"name": name, "input": dict(tool_input)})
        return {"revenue": len(calls_made)}

    monkeypatch.setattr(chat_orchestrator, "execute_chat_tool", _fake)

    cache: dict = {}
    _round([_ToolCall(id="t1", name="get_revenue", input={"account_id": "a1"})], cache)
    actions_2, _results, _stop = _round([_ToolCall(id="t2", name="get_revenue", input={"account_id": "a2"})], cache)

    assert len(calls_made) == 2
    assert actions_2[0].get("replayed") is None


def test_without_a_replay_cache_nothing_changes(monkeypatch):
    """Un appelant qui ne passe pas `replay_cache` (`None`, la valeur par
    défaut) garde le comportement d'avant cette tranche à l'octet : chaque
    appel, même identique, ré-exécute."""
    _bypass_short_ttl_dedup(monkeypatch)
    calls_made: list[dict] = []

    async def _fake(name, tool_input, **_kwargs):
        calls_made.append({"name": name, "input": dict(tool_input)})
        return {"revenue": 42}

    monkeypatch.setattr(chat_orchestrator, "execute_chat_tool", _fake)

    call = [_ToolCall(id="t1", name="get_revenue", input={"account_id": "a1"})]
    _round(call, None)
    actions_2, _results, _stop = _round(call, None)

    assert len(calls_made) == 2
    assert actions_2[0].get("replayed") is None


def test_a_repeated_write_is_never_replayed(monkeypatch):
    """Une écriture (proposition) n'est JAMAIS rejouée : `enrich_contact` est
    dans `WRITE_TOOL_NAMES`, donc hors du périmètre de `_is_read_only_tool`."""
    _bypass_short_ttl_dedup(monkeypatch)
    calls_made: list[dict] = []

    async def _fake(name, tool_input, **_kwargs):
        calls_made.append({"name": name, "input": dict(tool_input)})
        return {
            "status": "pending_confirmation",
            "message": "préparée",
            "proposal": {"action": "enrich_contact", "contact_id": tool_input["contact_id"]},
        }

    monkeypatch.setattr(chat_orchestrator, "execute_chat_tool", _fake)

    cache: dict = {}
    call = [_ToolCall(id="t1", name="enrich_contact", input={"contact_id": "c1"})]
    _round(call, cache)
    _round(call, cache)

    assert len(calls_made) == 2
