"""LOT (15/10) DATA-C — la file de lots Anthropic (Message Batches, −50 %) des
traitements NON interactifs.

Contrat gardé ici :

* hors voie « lot », rien ne change — aucun client de lot n'est construit ;
* dans la voie « lot » (en-tête ``x-bellum-llm-lane: batch`` posé par l'appelant
  nocturne), les appels concurrents d'une même requête partent dans UN lot ;
* chaque sortie est validée (schéma Pydantic) ; une sortie invalide repart dans
  un 2e lot avec l'erreur (reask) ; ce qui échoue encore part en SYNCHRONE ;
* un lot qui échoue ou dépasse son délai est annulé et TOUT repart en synchrone :
  le nocturne est moins cher, jamais moins complet ;
* le coût compté est celui du lot (moitié prix).
"""

from __future__ import annotations

import asyncio
from types import SimpleNamespace
from typing import Any

import pytest
from pydantic import BaseModel

from app.services import claude_service, llm_batch
from app.services.claude_service import BatchItem, CallMetadata, call_claude_batch


class Facts(BaseModel):
    sector: str
    headcount: int


# ── faux client de lots ──────────────────────────────────────────────────────


def _usage(inp: int = 1000, out: int = 100) -> SimpleNamespace:
    return SimpleNamespace(input_tokens=inp, output_tokens=out, cache_read_input_tokens=0, cache_creation_input_tokens=0)


def _tool_msg(payload: dict, name: str = "Facts", stop: str = "tool_use") -> SimpleNamespace:
    block = SimpleNamespace(type="tool_use", id="toolu_1", name=name, input=payload)
    return SimpleNamespace(content=[block], usage=_usage(), stop_reason=stop)


def _text_msg(text: str, stop: str = "end_turn") -> SimpleNamespace:
    return SimpleNamespace(content=[SimpleNamespace(type="text", text=text)], usage=_usage(), stop_reason=stop)


class _FakeBatches:
    """Rejoue, lot après lot, ce que ``answer(custom_id, params)`` rend."""

    def __init__(self, answer, *, polls_before_end: int = 1, fail_create: bool = False) -> None:
        self.answer = answer
        self.polls_before_end = polls_before_end
        self.fail_create = fail_create
        self.created: list[list[dict]] = []
        self.cancelled: list[str] = []
        self._polls: dict[str, int] = {}

    async def create(self, *, requests):
        if self.fail_create:
            raise RuntimeError("lot refusé")
        requests = list(requests)
        self.created.append(requests)
        batch_id = f"msgbatch_{len(self.created)}"
        self._polls[batch_id] = 0
        return SimpleNamespace(id=batch_id, processing_status="in_progress")

    async def retrieve(self, batch_id):
        self._polls[batch_id] += 1
        status = "ended" if self._polls[batch_id] >= self.polls_before_end else "in_progress"
        return SimpleNamespace(id=batch_id, processing_status=status)

    async def cancel(self, batch_id):
        self.cancelled.append(batch_id)
        return SimpleNamespace(id=batch_id, processing_status="canceling")

    async def results(self, batch_id):
        index = int(batch_id.rsplit("_", 1)[1]) - 1
        rows = []
        for request in self.created[index]:
            outcome = self.answer(request["custom_id"], request["params"])
            if outcome is None:
                result = SimpleNamespace(type="errored", error=SimpleNamespace(type="api_error"))
            else:
                result = SimpleNamespace(type="succeeded", message=outcome)
            rows.append(SimpleNamespace(custom_id=request["custom_id"], result=result))

        async def _iter():
            for row in rows:
                yield row

        return _iter()


@pytest.fixture
def fake(monkeypatch):
    holder: dict[str, Any] = {}

    def install(answer, **kw) -> _FakeBatches:
        batches = _FakeBatches(answer, **kw)
        client = SimpleNamespace(messages=SimpleNamespace(batches=batches))
        monkeypatch.setattr(claude_service.anthropic, "AsyncAnthropic", lambda **_kw: client)
        holder["b"] = batches
        return batches

    monkeypatch.setenv("ANTHROPIC_API_KEY", "test-key")
    monkeypatch.setenv("LLM_BATCH_POLL_S", "0")
    monkeypatch.setenv("LLM_BATCH_COALESCE_S", "0.01")
    monkeypatch.delenv("LLM_BATCH_DISABLED", raising=False)
    return install


@pytest.fixture
def sync_calls(monkeypatch):
    calls: list[dict] = []

    async def _sync(system_prompt, user_prompt, **kw):
        calls.append({"system": system_prompt, "user": user_prompt, **kw})
        model = kw["response_model"]
        if model is None:
            return "sync", _real_usage()
        return model(sector="synchrone", headcount=1), _real_usage()

    monkeypatch.setattr(claude_service, "_dispatch_anthropic_sync", _sync)
    return calls


def _real_usage():
    return claude_service.TokenUsage(input_tokens=1, output_tokens=1, model="m", cost_usd=0.01)


def _item(response_model=Facts, name: str = "bellum_facts") -> BatchItem:
    return BatchItem(
        system_prompt="system",
        user_prompt="user",
        response_model=response_model,
        max_tokens=2000,
        model="claude-sonnet-5",
        metadata=CallMetadata(prompt_name=name),
    )


# ── le lot ───────────────────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_a_batch_builds_submits_reads_and_validates(fake, sync_calls) -> None:
    batches = fake(lambda cid, params: _tool_msg({"sector": "Banque", "headcount": 12}))
    [(value, usage)] = await call_claude_batch([_item()])
    assert value == Facts(sector="Banque", headcount=12)
    assert sync_calls == []
    [requests] = batches.created
    params = requests[0]["params"]
    assert params["tools"][0]["name"] == "Facts"
    assert params["tool_choice"] == {"type": "tool", "name": "Facts"}
    assert params["system"][0]["cache_control"] == {"type": "ephemeral", "ttl": "1h"}
    full = claude_service._compute_cost(1000, 100, "claude-sonnet-5")
    assert usage.cost_usd == pytest.approx(full / 2), "un lot coûte moitié prix"


@pytest.mark.asyncio
async def test_text_items_ride_the_same_batch(fake, sync_calls) -> None:
    batches = fake(lambda cid, params: _text_msg("bonjour") if "tools" not in params else _tool_msg({"sector": "x", "headcount": 1}))
    results = await call_claude_batch([_item(), _item(response_model=None, name="bellum_signals")])
    assert [r[0] for r in results] == [Facts(sector="x", headcount=1), "bonjour"]
    assert len(batches.created) == 1 and len(batches.created[0]) == 2


@pytest.mark.asyncio
async def test_dict_items_are_unwrapped(fake, sync_calls) -> None:
    fake(lambda cid, params: _tool_msg({"data": {"a": 1}}, name=params["tools"][0]["name"]))
    [(value, _usage_)] = await call_claude_batch([_item(response_model=dict)])
    assert value == {"a": 1}


@pytest.mark.asyncio
async def test_an_invalid_output_is_reasked_in_a_second_batch(fake, sync_calls) -> None:
    def answer(cid, params):
        if len(params["messages"]) == 1:
            return _tool_msg({"sector": "Banque"})  # headcount manquant
        return _tool_msg({"sector": "Banque", "headcount": 3})

    batches = fake(answer)
    [(value, _)] = await call_claude_batch([_item()])
    assert value.headcount == 3
    assert len(batches.created) == 2
    reask = batches.created[1][0]["params"]["messages"]
    assert [m["role"] for m in reask] == ["user", "assistant", "user"]
    assert reask[2]["content"][0]["type"] == "tool_result" and reask[2]["content"][0]["is_error"] is True
    assert "headcount" in reask[2]["content"][0]["content"]
    assert sync_calls == []


@pytest.mark.asyncio
async def test_still_invalid_after_reask_goes_synchronous(fake, sync_calls) -> None:
    fake(lambda cid, params: _tool_msg({"sector": "Banque"}))
    [(value, _)] = await call_claude_batch([_item()])
    assert value.sector == "synchrone"
    assert len(sync_calls) == 1


@pytest.mark.asyncio
async def test_a_truncated_or_errored_item_goes_synchronous(fake, sync_calls) -> None:
    def answer(cid, params):
        return None if cid.endswith("1") else _tool_msg({"sector": "x", "headcount": 1}, stop="max_tokens")

    batches = fake(answer)
    results = await call_claude_batch([_item(), _item()])
    assert [r[0].sector for r in results] == ["synchrone", "synchrone"]
    assert len(batches.created) == 1, "une sortie tronquée ou en erreur ne se redemande pas en lot"


@pytest.mark.asyncio
async def test_a_failed_batch_falls_back_synchronously(fake, sync_calls) -> None:
    fake(lambda cid, params: _tool_msg({"sector": "x", "headcount": 1}), fail_create=True)
    [(value, _)] = await call_claude_batch([_item()])
    assert value.sector == "synchrone"


@pytest.mark.asyncio
async def test_a_batch_past_its_deadline_is_cancelled_then_synchronous(fake, sync_calls, monkeypatch) -> None:
    monkeypatch.setenv("LLM_BATCH_MAX_WAIT_S", "0")
    batches = fake(lambda cid, params: _tool_msg({"sector": "x", "headcount": 1}), polls_before_end=10**6)
    [(value, _)] = await call_claude_batch([_item()])
    assert value.sector == "synchrone"
    assert batches.cancelled == ["msgbatch_1"]


# ── la voie : qui part en lot ────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_outside_the_batch_lane_nothing_changes(fake, sync_calls) -> None:
    batches = fake(lambda cid, params: _tool_msg({"sector": "x", "headcount": 1}))
    value, _ = await claude_service._dispatch_anthropic(
        "s", "u", response_model=Facts, max_tokens=10, max_retries=1, model="m", metadata=CallMetadata()
    )
    assert value.sector == "synchrone"
    assert batches.created == []


@pytest.mark.asyncio
async def test_concurrent_calls_of_a_batch_lane_share_one_batch(fake, sync_calls) -> None:
    batches = fake(lambda cid, params: _tool_msg({"sector": "lot", "headcount": 2}))

    async def one():
        return await claude_service._dispatch_anthropic(
            "s", "u", response_model=Facts, max_tokens=10, max_retries=1, model="m", metadata=CallMetadata()
        )

    with llm_batch.llm_lane(llm_batch.LANE_BATCH):
        results = await asyncio.gather(one(), one(), one())
    assert [r[0].sector for r in results] == ["lot"] * 3
    assert len(batches.created) == 1 and len(batches.created[0]) == 3
    assert sync_calls == []


@pytest.mark.asyncio
async def test_the_kill_switch_keeps_the_lane_synchronous(fake, sync_calls, monkeypatch) -> None:
    monkeypatch.setenv("LLM_BATCH_DISABLED", "true")
    batches = fake(lambda cid, params: _tool_msg({"sector": "x", "headcount": 1}))
    with llm_batch.llm_lane(llm_batch.LANE_BATCH):
        value, _ = await claude_service._dispatch_anthropic(
            "s", "u", response_model=Facts, max_tokens=10, max_retries=1, model="m", metadata=CallMetadata()
        )
    assert value.sector == "synchrone" and batches.created == []


def test_only_the_known_lane_value_opens_the_lane() -> None:
    assert llm_batch.lane_from_header("batch") == llm_batch.LANE_BATCH
    assert llm_batch.lane_from_header(" BATCH ") == llm_batch.LANE_BATCH
    assert llm_batch.lane_from_header("sync") is None
    assert llm_batch.lane_from_header(None) is None


@pytest.mark.asyncio
async def test_the_header_opens_the_lane_for_the_request_only() -> None:
    from app.middleware.llm_lane import LlmLaneMiddleware

    seen: list[bool] = []

    async def app(scope, receive, send):
        seen.append(llm_batch.batch_lane_requested())

    mw = LlmLaneMiddleware(app)
    await mw({"type": "http", "headers": [(b"x-bellum-llm-lane", b"batch")]}, None, None)
    await mw({"type": "http", "headers": []}, None, None)
    assert seen == [True, False]
    assert llm_batch.batch_lane_requested() is False
