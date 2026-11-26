"""#2442.4 (épopée #2879, lot M10 09/10) — LE SPAN « connecteur ».

Tout ce qu'un outil de Laura lit d'un connecteur de la personne (messagerie,
agenda, CRM, documents) traverse le pont `bellum_api` — `_post` ou `_get`, seuls
points de sortie vers l'API qui détient les jetons OAuth. Comme `db`
(`TableQuery.execute()`), le temps passé là doit apparaître dans le
récapitulatif du tour, distinct du span `tool:*` qui l'englobe : « l'outil a mis
4 s » ne disait pas si c'était la boîte mail ou nous.
"""

from __future__ import annotations

import pytest

from app.services import bellum_api
from app.services import langfuse_client as lf


class _FakeResponse:
    status_code = 200

    def json(self):
        return {"ok": True}


class _FakeClient:
    def __init__(self, *_a, **_kw) -> None:
        pass

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_exc):
        return False

    async def post(self, *_a, **_kw):
        return _FakeResponse()

    async def get(self, *_a, **_kw):
        return _FakeResponse()


@pytest.fixture
def _bridge(monkeypatch):
    monkeypatch.setenv("API_INTERNAL_URL", "http://api.internal")
    monkeypatch.setenv("INTERNAL_API_SECRET", "s3cret")
    monkeypatch.setattr(bellum_api.httpx, "AsyncClient", _FakeClient)
    monkeypatch.setenv("LANGFUSE_PUBLIC_KEY", "pk-lf-test")
    monkeypatch.setenv("LANGFUSE_SECRET_KEY", "sk-lf-test")
    lf._reset_for_tests()
    yield
    lf._reset_for_tests()


def _summary() -> dict:
    traces = [e["body"] for e in lf._pending_events() if e["type"] == "trace-create"]
    return traces[-1]["metadata"]["turn"]


@pytest.mark.asyncio
@pytest.mark.parametrize("verb", ["post", "get"])
async def test_a_bridge_call_is_a_connector_span_distinct_from_its_tool(_bridge, verb):
    with lf.bind_trace("chat_turn", user_id="u-pseudo", session_id="cid-conn", summarize=True):
        with lf.span("tool:search_mailbox"):
            if verb == "post":
                assert await bellum_api._post("/internal/copilot/mailbox/search", {"userId": "u"}) == {"ok": True}
            else:
                assert await bellum_api._get("/internal/dataforge/candidates", {}) == {"ok": True}
        lf.note_turn_status("ok")
    summary = _summary()
    assert "connector" in summary["stageMs"]
    assert [t["name"] for t in summary["tools"]] == ["search_mailbox"]


@pytest.mark.asyncio
async def test_an_unconfigured_bridge_poses_no_span(monkeypatch, _bridge):
    """No-op STRICT sans configuration : aucun appel, donc aucun temps de
    connecteur à mesurer — jamais un `connector: 0` qui se lirait « instantané »."""
    monkeypatch.delenv("API_INTERNAL_URL")
    with lf.bind_trace("chat_turn", user_id="u-pseudo", session_id="cid-off", summarize=True):
        assert await bellum_api._post("/internal/copilot/mailbox/search", {}) is None
        lf.note_turn_status("ok")
    assert "connector" not in _summary()["stageMs"]
