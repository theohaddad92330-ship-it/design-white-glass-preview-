"""#3229 (LAU-FINAL-214, reste) — un ``CoverageReport`` construit sur de VRAIS
résultats d'outil.

Le tour est rejoué de bout en bout : le modèle appelle ``search_workspace_contacts``
(entrée) → l'exécuteur RÉEL de l'outil tourne (seul le pont HTTP est simulé) →
la sortie porte le rapport → ``coverage_sink`` le reçoit par référence, comme
``verifier_status_sink`` (le contrat ``(reply, actions)`` ne change pas).
"""

from __future__ import annotations

from types import SimpleNamespace

import pytest

from app.services import chat_orchestrator

USER = "11111111-1111-4111-8111-111111111111"


class _DummyThrottle:
    async def __aenter__(self):
        return self

    async def __aexit__(self, *_a):
        return False


class _FakeMessageStream:
    def __init__(self, response):
        self._response = response

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_exc):
        return False

    async def __aiter__(self):
        for block in getattr(self._response, "content", None) or []:
            if getattr(block, "type", None) == "text":
                yield SimpleNamespace(type="text", text=block.text)

    async def get_final_message(self):
        return self._response


class _FakeMessages:
    def __init__(self, responses):
        self._responses = list(responses)

    def stream(self, **_kwargs):
        return _FakeMessageStream(self._responses.pop(0))


class _FakeClient:
    def __init__(self, responses):
        self.messages = _FakeMessages(responses)


def _text(text: str) -> SimpleNamespace:
    return SimpleNamespace(type="text", text=text)


def _tool_use(name: str, tool_input: dict, block_id: str) -> SimpleNamespace:
    return SimpleNamespace(type="tool_use", name=name, input=tool_input, id=block_id)


def _resp(stop_reason: str, content: list) -> SimpleNamespace:
    usage = SimpleNamespace(
        input_tokens=100, output_tokens=20, cache_read_input_tokens=0, cache_creation_input_tokens=0
    )
    return SimpleNamespace(stop_reason=stop_reason, content=content, usage=usage)


@pytest.fixture(autouse=True)
def _patch_env(monkeypatch):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-test")
    monkeypatch.delenv("CHAT_TURN_BUDGET_S", raising=False)
    monkeypatch.setattr(chat_orchestrator, "throttle", lambda _provider: _DummyThrottle())


def _install_client(monkeypatch, responses) -> None:
    fake = _FakeClient(responses)
    monkeypatch.setattr(chat_orchestrator.anthropic, "AsyncAnthropic", lambda **_kw: fake)


_BRIDGE_RESULT = {
    "total": 3,
    "truncated": False,
    "contacts": [
        {"contact_id": "a", "decision_role": "technical", "has_email": True, "has_network_profile": False},
        {"contact_id": "b", "decision_role": "technical", "has_email": False, "has_network_profile": True},
        {"contact_id": "c", "decision_role": None, "has_email": False, "has_network_profile": False},
    ],
}


def _install_bridge(monkeypatch, result) -> None:
    from app.services import bellum_api

    async def _workspace_contacts(*_a, **_kw):
        return result

    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)
    monkeypatch.setattr(bellum_api, "workspace_contacts", _workspace_contacts)


def _contacts_turn(monkeypatch) -> None:
    _install_client(
        monkeypatch,
        [
            _resp("tool_use", [_tool_use("search_workspace_contacts", {"role": "technical"}, "t1")]),
            _resp("end_turn", [_text("Deux DSI connus de l'espace.")]),
        ],
    )


@pytest.mark.asyncio
async def test_a_contact_search_turn_fills_the_coverage_sink_with_measured_tiers(monkeypatch):
    _install_bridge(monkeypatch, _BRIDGE_RESULT)
    _contacts_turn(monkeypatch)
    sink: list[dict] = []
    await chat_orchestrator.run_chat_with_tools(
        "sys", "user", user_id=USER, profile_data=None, coverage_sink=sink
    )

    assert len(sink) == 1
    wire = sink[0]
    assert (wire["detected"], wire["resolved"], wire["relevant"], wire["enriched"]) == (3, 2, 2, 2)
    # La sortie d'outil ne porte aucune vérification : non mesuré, jamais 0.
    assert wire["verified"] is None
    assert wire["estimated_coverage"] is None


@pytest.mark.asyncio
async def test_a_failed_bridge_leaves_the_coverage_sink_empty(monkeypatch):
    """Pont muet → l'outil rend une erreur, pas de liste : AUCUN rapport
    (une couverture inventée sur une lecture qui n'a pas eu lieu serait pire
    que l'absence)."""
    _install_bridge(monkeypatch, None)
    _contacts_turn(monkeypatch)
    sink: list[dict] = []
    await chat_orchestrator.run_chat_with_tools(
        "sys", "user", user_id=USER, profile_data=None, coverage_sink=sink
    )

    assert sink == []


@pytest.mark.asyncio
async def test_without_a_coverage_sink_nothing_changes(monkeypatch):
    _install_bridge(monkeypatch, _BRIDGE_RESULT)
    _contacts_turn(monkeypatch)
    reply, actions = await chat_orchestrator.run_chat_with_tools("sys", "user", user_id=USER, profile_data=None)

    assert reply == "Deux DSI connus de l'espace."
    assert [a["tool"] for a in actions] == ["search_workspace_contacts"]


@pytest.mark.asyncio
async def test_3229_account_scoped_report_wins_over_a_workspace_wide_one(monkeypatch):
    """Recette prod 01/10 (Société Générale, « Donne-moi les contacts DSI ») :
    « Périmètre de recherche · 1959 détecté(s) » comptait TOUT l'espace, pas le
    périmètre du compte. Quand le tour a lu les contacts D'UN compte, le rapport
    affiché est celui de ce compte, même si une recherche d'espace a eu lieu après."""
    from app.services import bellum_api

    async def _account_contacts(*_a, **_kw):
        return {
            "total": 37,
            "truncated": True,
            "contacts": [{"contact_id": str(i)} for i in range(5)],
            "account_sector": None,
        }

    async def _workspace_contacts(*_a, **_kw):
        return {**_BRIDGE_RESULT, "total": 1959, "truncated": True}

    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)
    monkeypatch.setattr(bellum_api, "account_contacts", _account_contacts)
    monkeypatch.setattr(bellum_api, "workspace_contacts", _workspace_contacts)
    _install_client(
        monkeypatch,
        [
            _resp(
                "tool_use",
                [
                    _tool_use("get_account_contacts", {"account_id": "acc-1"}, "t1"),
                    _tool_use("search_workspace_contacts", {"role": "technical"}, "t2"),
                ],
            ),
            _resp("end_turn", [_text("Voici les DSI.")]),
        ],
    )
    sink: list[dict] = []
    await chat_orchestrator.run_chat_with_tools(
        "sys", "user", user_id=USER, profile_data=None, coverage_sink=sink
    )

    assert sink, "un rapport est attendu"
    assert sink[-1]["detected"] == 37
    assert all(report["detected"] != 1959 for report in sink)
