"""#3707 (R2 07/10) — « comptes Java dans la banque » : le TOUR entier rejoué, routeur ``/chat/message``
compris (modèle simulé → VRAI outil ``run_account_search`` → registre simulé).

R1 n'avait testé que le TEXTE du prompt, et la recette prod du 07/10 a relu « pas de compte bancaire clair »,
0 carte. Cause : la techno (« Java ») partait dans ``keywords``, que le registre lit comme une RAISON SOCIALE
(``discover.py`` filtre le secteur ET le nom) : aucune banque ne s'appelle « Java ». L'outil rendait donc 0 compte
et Laura concluait qu'il n'y en avait pas. Maintenant la techno a sa propre porte (``technologies``), NOMMÉE comme
non appliquée (le registre public ne lit pas les technos), jamais utilisée pour filtrer un nom ; une techno qui
arrive quand même dans ``keywords`` y est reprise.
"""

from __future__ import annotations

import json
from types import SimpleNamespace
from typing import Any

import pytest
from fastapi.testclient import TestClient

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
    def __init__(self, responses, calls):
        self._responses = list(responses)
        self.calls = calls

    def stream(self, **kwargs):
        self.calls.append(kwargs)
        return _FakeMessageStream(self._responses.pop(0))


class _FakeClient:
    def __init__(self, responses, calls):
        self.messages = _FakeMessages(responses, calls)


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


def _parse_sse(text: str) -> list[dict]:
    events: list[dict] = []
    for block in text.strip().split("\n\n"):
        block = block.strip()
        if block.startswith("data:"):
            events.append(json.loads(block[len("data:") :].strip()))
    return events


def _install(monkeypatch, responses) -> list[dict]:
    calls: list[dict] = []
    fake = _FakeClient(responses, calls)
    monkeypatch.setattr(chat_orchestrator.anthropic, "AsyncAnthropic", lambda **_kw: fake)
    return calls


class _Registry:
    """Le registre public simulé : filtre le NOM quand ``freetext`` est posé, comme le vrai (``discover.py``)."""

    def __init__(self) -> None:
        self.requests: list[Any] = []

    async def __call__(self, request: Any) -> Any:
        self.requests.append(request)
        rows = [
            {"name": "Crédit Test", "siren": "100000001", "nafCode": "64.19Z", "nafLabel": "Autres intermédiations"},
            {"name": "Banque Exemple", "siren": "100000002", "nafCode": "64.19Z", "nafLabel": "Autres intermédiations"},
        ]
        freetext = (getattr(request.filters, "freetext", None) or "").strip().lower()
        if freetext:
            rows = [row for row in rows if freetext in row["name"].lower()]
        return SimpleNamespace(candidates=rows, degraded=[])


@pytest.fixture
def registry(monkeypatch) -> _Registry:
    fake = _Registry()
    monkeypatch.setattr("app.routers.discover.discover_registry", fake)

    def _no_workspace():
        raise RuntimeError("pas de base dans ce test")

    monkeypatch.setattr("app.services.supabase_client.get_supabase", _no_workspace)
    return fake


def _tool_result_text(calls: list[dict]) -> str:
    """Ce que le modèle a LU de l'outil au second appel (le résultat sérialisé)."""
    last = calls[-1]["messages"][-1]
    blocks = last["content"] if isinstance(last["content"], list) else []
    return " ".join(str(block.get("content")) for block in blocks if isinstance(block, dict))


def _ask(client: TestClient) -> list[dict]:
    res = client.post(
        "/chat/message",
        json={"message": "Trouve-moi des comptes Java dans la banque", "user_id": USER},
    )
    assert res.status_code == 200
    return _parse_sse(res.text)


def test_sector_plus_tech_calls_the_market_search_and_hands_the_list_to_the_model(
    monkeypatch, client: TestClient, registry: _Registry
) -> None:
    calls = _install(
        monkeypatch,
        [
            _resp(
                "tool_use",
                [_tool_use("run_account_search", {"sectors": ["finance"], "technologies": ["Java"]}, "t1")],
            ),
            _resp("end_turn", [_text("Voici deux banques.")]),
        ],
    )
    events = _ask(client)
    assert events[-1]["type"] == "done" and events[-1]["success"] is True, events[-1]
    # La recherche MARCHÉ a bien eu lieu, sur le secteur, SANS prendre « Java » pour un nom d'entreprise.
    assert len(registry.requests) == 1
    assert not (registry.requests[0].filters.freetext or "").strip()
    seen = _tool_result_text(calls)
    assert "Crédit Test" in seen and "Banque Exemple" in seen
    # La techno est NOMMÉE comme non appliquée au registre, jamais ignorée en silence.
    assert "technologies_not_applied" in seen


def test_a_tech_sent_in_keywords_is_not_read_as_a_company_name(
    monkeypatch, client: TestClient, registry: _Registry
) -> None:
    """Le défaut de la recette : `keywords: "Java"` filtrait le NOM et rendait 0 banque."""
    calls = _install(
        monkeypatch,
        [
            _resp("tool_use", [_tool_use("run_account_search", {"sectors": ["finance"], "keywords": "Java"}, "t1")]),
            _resp("end_turn", [_text("Voici deux banques.")]),
        ],
    )
    events = _ask(client)
    assert events[-1]["type"] == "done" and events[-1]["success"] is True, events[-1]
    assert not (registry.requests[0].filters.freetext or "").strip()
    assert "Crédit Test" in _tool_result_text(calls)


def test_a_real_company_name_in_keywords_still_filters_the_name(
    monkeypatch, client: TestClient, registry: _Registry
) -> None:
    """SAIT DIRE NON — une vraie raison sociale reste un filtre de nom, la reprise ne vise que les technos."""
    calls = _install(
        monkeypatch,
        [
            _resp("tool_use", [_tool_use("run_account_search", {"sectors": ["finance"], "keywords": "Crédit"}, "t1")]),
            _resp("end_turn", [_text("Une banque.")]),
        ],
    )
    _ask(client)
    assert registry.requests[0].filters.freetext == "Crédit"
    seen = _tool_result_text(calls)
    assert "Crédit Test" in seen and "Banque Exemple" not in seen


def test_a_tech_alone_is_not_a_search_it_asks_for_a_sector(
    monkeypatch, client: TestClient, registry: _Registry
) -> None:
    """SAIT DIRE NON — une techno seule n'a rien à interroger au registre : erreur nommée, aucun faux zéro."""
    calls = _install(
        monkeypatch,
        [
            _resp("tool_use", [_tool_use("run_account_search", {"technologies": ["Java"]}, "t1")]),
            _resp("end_turn", [_text("Quel secteur ?")]),
        ],
    )
    _ask(client)
    assert registry.requests == []
    assert "missing_search_criteria" in _tool_result_text(calls)


def test_city_plus_tech_without_sector_uses_the_discover_skill_engine_and_links_to_it(
    monkeypatch, client: TestClient, registry: _Registry
) -> None:
    """Recette 21/10 B.4 (K.6) — « comptes à Lille qui recrutent des développeurs Java » : le MÊME moteur que
    Découvrir (la compétence trouve les comptes par leurs offres), et un lien /discover pré-rempli."""

    async def _lille(_city: str, _note_out: dict | None = None) -> str:
        return "Lille"

    monkeypatch.setattr("app.services.chat_tools._resolve_city_commune_name", _lille)
    calls = _install(
        monkeypatch,
        [
            _resp("tool_use", [_tool_use("run_account_search", {"city": "Lille", "technologies": ["Java"]}, "t1")]),
            _resp("end_turn", [_text("Voici les comptes.")]),
        ],
    )
    events = _ask(client)
    assert events[-1]["type"] == "done" and events[-1]["success"] is True, events[-1]
    filters = registry.requests[0].filters
    assert filters.technologiesObserved == ["Java"]
    assert filters.city == "Lille"
    assert not (filters.freetext or "").strip()
    seen = _tool_result_text(calls)
    assert "technologies_not_applied" not in seen
    assert "/discover?" in seen and "keywords=Java" in seen and "city=Lille" in seen
