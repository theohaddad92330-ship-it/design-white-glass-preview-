"""Graph SSE endpoint (v2 increment 6, slice 1).

POST /graph/analyze runs the StateGraph and streams typed GraphEvents as SSE.
phase_completed events carry the phase output under data.output so the NestJS
worker can persist from the stream. Phases are mocked — this tests the endpoint
+ event wire, not Claude.
"""

from __future__ import annotations

import asyncio
import contextlib
import json
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest
from fastapi.testclient import TestClient

import app.graph.nodes as nodes
import app.routers.graph_analyze as graph_analyze
from app.graph.events import GraphEvent
from app.models.agent_envelope import AgentStatus
from app.models.contacts import ContactsResponse
from app.models.plan import PlanResponse
from app.models.research import ResearchResponse


def _parse_sse(text: str) -> list[dict]:
    events: list[dict] = []
    for block in text.strip().split("\n\n"):
        block = block.strip()
        if block.startswith("data:"):
            events.append(json.loads(block[len("data:") :].strip()))
    return events


@pytest.fixture(autouse=True)
def _force_memory_checkpointer(monkeypatch: pytest.MonkeyPatch):
    # The endpoint builds its checkpointer from env; force in-memory for tests.
    monkeypatch.delenv("LANGGRAPH_PG_URL", raising=False)
    monkeypatch.delenv("DATABASE_URL", raising=False)


@pytest.fixture
def graph_phases(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(
        nodes,
        "_research",
        AsyncMock(
            return_value=ResearchResponse(
                data={"businessDescription": "Banque", "executives": [{"first_name": "A", "last_name": "B", "role": "DG"}]}
            )
        ),
    )
    monkeypatch.setattr(nodes, "_contacts", AsyncMock(return_value=ContactsResponse(data={"contacts": [{"fullName": "A B"}]})))
    monkeypatch.setattr(nodes, "_plan", AsyncMock(return_value=PlanResponse(data={"actionPlan": {"strategy": "S"}})))

    class _Cls:
        run = AsyncMock(
            return_value=SimpleNamespace(
                status=AgentStatus.SUCCESS,
                data=SimpleNamespace(model_dump=lambda **_k: {"contacts": [{"fullName": "A B", "decisionRole": "economic"}]}),
                error=None,
                meta=None,
            )
        )

    monkeypatch.setattr(nodes, "ClassifierAgent", _Cls)


def test_analyze_streams_phase_events_with_output(client: TestClient, graph_phases) -> None:
    resp = client.post(
        "/graph/analyze",
        json={"company_name": "Crédit Mutuel", "account_id": "acc-1", "profile_data": {"companyName": "Skaizen"}},
    )
    assert resp.status_code == 200
    assert resp.headers["content-type"].startswith("text/event-stream")

    events = _parse_sse(resp.text)
    # The always-on anti-hallucination judge emits a judge_completed after plan.
    assert [e["type"] for e in events] == [
        "phase_completed",
        "phase_completed",
        "phase_completed",
        "phase_completed",
        "judge_completed",
        "run_completed",
    ]
    by_phase = {e.get("phase"): e for e in events if e["type"] == "phase_completed"}
    # phase_completed events carry the phase output for the DB writer.
    assert by_phase["research"]["data"]["output"]["research"]["businessDescription"] == "Banque"
    assert by_phase["research"]["data"]["output"]["gate"]["decision"] == "go"
    assert by_phase["research"]["data"]["output"]["seed_contacts"][0]["last_name"] == "B"
    assert by_phase["contacts"]["data"]["output"]["contacts"][0]["fullName"] == "A B"
    assert by_phase["classify"]["data"]["output"]["classified_contacts"][0]["decisionRole"] == "economic"
    assert by_phase["plan"]["data"]["output"]["plan"]["actionPlan"]["strategy"] == "S"
    # Terminal event carries the telemetry summary.
    assert "summary" in events[-1]["data"]


def test_resume_with_empty_state_fails_clearly_not_keyerror(client: TestClient) -> None:
    # Resume with no company_name: under MemorySaver the restored state is empty,
    # so this used to raise a bare KeyError → opaque SSE crash. It must now stream
    # a clean failure event instead.
    resp = client.post("/graph/analyze", json={"resume": True, "account_id": "acc-x", "company_name": ""})
    assert resp.status_code == 200
    events = _parse_sse(resp.text)
    assert any(e["type"] in ("phase_failed", "run_failed") for e in events)
    assert "MissingCompanyName" in resp.text or "nom d'entreprise" in resp.text


def test_resume_reprovides_inputs_and_runs_to_completion(client: TestClient, graph_phases) -> None:
    # Resume re-sends the base inputs (the worker does too), so a fresh
    # MemorySaver run still has company_name and completes — no KeyError.
    resp = client.post(
        "/graph/analyze",
        json={
            "resume": True,
            "account_id": "acc-r",
            "company_name": "Crédit Mutuel",
            "profile_data": {"companyName": "Skaizen"},
        },
    )
    assert resp.status_code == 200
    events = _parse_sse(resp.text)
    assert events[-1]["type"] == "run_completed"


def test_keepalive_comment_emitted_during_a_silent_stream(client: TestClient, monkeypatch) -> None:
    # A slow phase (Firecrawl/Claude) can go silent long enough for a proxy to
    # idle-close the stream → truncated SSE → the whole run fails. The endpoint
    # must emit an SSE comment during silence to keep the connection alive, WITHOUT
    # cancelling the graph. Comments carry no ``data:`` line → the worker skips them.
    monkeypatch.delenv("SSE_KEEPALIVE_SECONDS", raising=False)  # module default drives the cadence
    monkeypatch.setattr(graph_analyze, "_KEEPALIVE_SECONDS", 0.03)

    @contextlib.asynccontextmanager
    async def _fake_session():
        yield None

    monkeypatch.setattr(graph_analyze, "analysis_graph_session", _fake_session)

    async def _slow_stream(_inputs, *, thread_id, graph):
        await asyncio.sleep(0.15)  # silence > keepalive → forces at least one comment
        yield SimpleNamespace(model_dump_json=lambda: json.dumps({"type": "phase_completed", "phase": "research"}))
        yield SimpleNamespace(model_dump_json=lambda: json.dumps({"type": "run_completed", "data": {"summary": {}}}))

    monkeypatch.setattr(graph_analyze, "stream_analysis_graph", _slow_stream)

    resp = client.post("/graph/analyze", json={"company_name": "X", "account_id": "acc-keepalive"})

    assert resp.status_code == 200
    # A keepalive comment kept the stream open through the silent gap…
    assert ": keepalive" in resp.text
    # …and the real events + terminal still streamed through intact (comments skipped).
    events = _parse_sse(resp.text)
    assert [e["type"] for e in events] == ["phase_completed", "run_completed"]


def test_keepalive_cadence_is_env_configurable(monkeypatch) -> None:
    # Operators tune the keepalive below the edge proxy's idle timeout via
    # SSE_KEEPALIVE_SECONDS, without a code change. A valid positive value wins
    # over the module default; an unset / non-numeric / non-positive value falls
    # back to it so a misconfiguration can never disable the keepalive.
    monkeypatch.setattr(graph_analyze, "_KEEPALIVE_SECONDS", 15.0)

    monkeypatch.setenv("SSE_KEEPALIVE_SECONDS", "5")
    assert graph_analyze._keepalive_seconds() == 5.0

    monkeypatch.setenv("SSE_KEEPALIVE_SECONDS", "not-a-number")
    assert graph_analyze._keepalive_seconds() == 15.0

    monkeypatch.setenv("SSE_KEEPALIVE_SECONDS", "0")  # non-positive → ignored
    assert graph_analyze._keepalive_seconds() == 15.0

    monkeypatch.delenv("SSE_KEEPALIVE_SECONDS", raising=False)
    assert graph_analyze._keepalive_seconds() == 15.0


def test_analyze_no_go_streams_run_skipped(client: TestClient, monkeypatch) -> None:
    monkeypatch.delenv("DATABASE_URL", raising=False)
    monkeypatch.setattr(nodes, "_research", AsyncMock(return_value=ResearchResponse(data={"recentSignals": []})))
    monkeypatch.setattr(nodes, "_contacts", AsyncMock())
    monkeypatch.setattr(nodes, "_plan", AsyncMock())

    resp = client.post("/graph/analyze", json={"company_name": "??", "account_id": "acc-2"})
    events = _parse_sse(resp.text)
    assert [e["type"] for e in events] == ["phase_completed", "run_skipped"]
    assert events[-1]["data"]["gate"]["decision"] == "no_go"


# #1631.3/.4, #1606.2 (lot 14) — l'axe CHEMIN : POST /graph/analyze est le
# point d'entrée du pipeline PRINCIPAL (première analyse). Le champ doit
# atteindre `research_node`, exactement comme `crm_presence`.
def test_analyze_forwards_the_market_path_axis_to_research(client: TestClient, graph_phases) -> None:
    resp = client.post(
        "/graph/analyze",
        json={
            "company_name": "BNP Paribas",
            "account_id": "acc-1",
            "profile_data": {},
            "market_paths_observed": 9,
            "market_top_esn": "ALTEN",
        },
    )
    assert resp.status_code == 200

    req = nodes._research.await_args.args[0]
    assert req.market_paths_observed == 9
    assert req.market_top_esn == "ALTEN"


def test_analyze_omits_the_market_path_axis_by_default_byte_identical(client: TestClient, graph_phases) -> None:
    resp = client.post(
        "/graph/analyze",
        json={"company_name": "Crédit Mutuel", "account_id": "acc-1", "profile_data": {}},
    )
    assert resp.status_code == 200

    req = nodes._research.await_args.args[0]
    assert req.market_paths_observed is None
    assert req.market_top_esn == ""


async def test_disconnect_after_first_phase_stops_before_paying_the_next_one(monkeypatch) -> None:
    """#2915.1 — un client qui se déconnecte en cours de flux doit annuler la
    tâche `_pump` AVANT qu'elle ne paie la phase suivante (un appel Claude).

    Incident du 24/09 : côté API, `packages/http/src/client.ts` (`streamSse`)
    ne coupait la connexion QUE sur une erreur de lecture déjà attrapée — pas
    quand son consommateur arrêtait de lire le flux plus tôt (le `for await`
    de `runViaGraph` qui lève quand une phase échoue à se persister). Le
    correctif (voir client.test.ts, même numéro) ferme désormais le lecteur
    dans tous les cas. Côté IA, rien à corriger : ce test fige le mécanisme
    déjà correct qui n'avait simplement jamais l'occasion de s'exécuter en
    prod — `StreamingResponse.__call__` (Starlette) annule `stream_response`
    dès que `receive()` rend `http.disconnect`, ce qui déroule le `finally` de
    `event_stream` (`graph_analyze.py`) et annule `_pump`.

    `stream_analysis_graph` est remplacé par un faux flux à deux phases : la
    seconde dort 0,2 s avant de se déclarer atteinte — le temps d'observer si
    l'annulation l'a coupée avant, ou si elle a tourné jusqu'au bout faute
    d'avoir été annulée.
    """
    reached_second_phase = False

    async def _fake_stream(_inputs, *, thread_id, graph):
        nonlocal reached_second_phase
        yield GraphEvent(type="phase_completed", phase="research", progress=25)
        # Tient lieu de phase coûteuse (un appel Claude) : si `_pump` n'est
        # jamais annulée, ce sommeil va à son terme et le drapeau bascule.
        await asyncio.sleep(0.2)
        reached_second_phase = True
        yield GraphEvent(type="phase_completed", phase="contacts", progress=50)

    monkeypatch.setattr(graph_analyze, "stream_analysis_graph", _fake_stream)

    @contextlib.asynccontextmanager
    async def _fake_session():
        yield None

    monkeypatch.setattr(graph_analyze, "analysis_graph_session", _fake_session)

    body = json.dumps({"company_name": "X", "account_id": "acc-disc", "profile_data": {}}).encode()
    scope = {
        "type": "http",
        "method": "POST",
        "path": "/graph/analyze",
        "headers": [(b"content-type", b"application/json")],
        "query_string": b"",
        "server": ("test", 80),
        "client": ("test", 123),
        "scheme": "http",
        "http_version": "1.1",
        # Sans `spec_version` déclaré, Starlette prend le chemin
        # `anyio.create_task_group()` (`StreamingResponse.__call__`), qui fait
        # courir `listen_for_disconnect(receive)` contre `stream_response` —
        # exactement le chemin qu'un VRAI client ASGI emprunte.
        "asgi": {"version": "3.0"},
    }
    request_sent = False
    first_event_sent = asyncio.Event()
    disconnect_now = asyncio.Event()

    async def receive():
        nonlocal request_sent
        if not request_sent:
            request_sent = True
            return {"type": "http.request", "body": body, "more_body": False}
        await disconnect_now.wait()
        return {"type": "http.disconnect"}

    async def send(message):
        if message["type"] == "http.response.body" and b"research" in message.get("body", b""):
            first_event_sent.set()

    async def _drive_disconnect():
        await first_event_sent.wait()
        disconnect_now.set()

    from app.main import app

    driver = asyncio.create_task(_drive_disconnect())
    await asyncio.wait_for(app(scope, receive, send), timeout=5)
    await driver
    # Attendre PLUS que le sommeil simulé : si `_pump` n'avait pas été
    # annulée, c'est assez pour qu'elle finisse et bascule le drapeau.
    await asyncio.sleep(0.3)

    assert reached_second_phase is False
