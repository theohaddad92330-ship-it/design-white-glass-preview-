"""#3236.2 (b, tranche) — LA REPRISE DES LECTURES d'un tour Approfondi coupé.

Le vrai job BullMQ de fond reste hors tranche. Ce qui est livré : quand un tour
Approfondi manque de budget, les LECTURES déjà faites sont mises de côté
(Redis, durée courte, par personne ET conversation) ; le tour suivant de la même
conversation les REJOUE au lieu de relire les sources — le budget sert alors à
avancer, pas à refaire. Sans Redis, sans identifiant de conversation, ou sans
rien à garder : aucun appel, chemin identique à avant.
"""

from __future__ import annotations

import json

import pytest

from app.services import chat_resume_checkpoint as checkpoint


class _FakeRedis:
    def __init__(self) -> None:
        self.store: dict[str, str] = {}
        self.ttls: dict[str, int] = {}

    async def set(self, key: str, value: str, ex: int | None = None) -> None:
        self.store[key] = value
        if ex is not None:
            self.ttls[key] = ex

    async def getdel(self, key: str) -> str | None:
        return self.store.pop(key, None)


@pytest.fixture
def fake(monkeypatch: pytest.MonkeyPatch) -> _FakeRedis:
    redis = _FakeRedis()

    async def _redis() -> _FakeRedis:
        return redis

    monkeypatch.setattr(checkpoint, "_redis", _redis)
    return redis


def _cache() -> dict:
    return {
        ("get_account", '{"id": "a-1"}'): ({"tool": "get_account", "status": "ok"}, {"name": "Thales"}, False),
        ("search_contacts", '{"q": "dsi"}'): ({"tool": "search_contacts", "status": "ok"}, "3 contacts", False),
    }


@pytest.mark.asyncio
async def test_saved_reads_come_back_once_for_the_same_person_and_conversation(fake: _FakeRedis) -> None:
    assert await checkpoint.save("u1", "c1", _cache()) is True
    assert await checkpoint.load("u1", "c1") == _cache()
    # Consommé UNE fois : une reprise ne se rejoue pas indéfiniment (un fait vieillit).
    assert await checkpoint.load("u1", "c1") == {}


@pytest.mark.asyncio
async def test_another_person_or_conversation_never_reads_it(fake: _FakeRedis) -> None:
    await checkpoint.save("u1", "c1", _cache())
    assert await checkpoint.load("u2", "c1") == {}
    assert await checkpoint.load("u1", "c2") == {}
    assert await checkpoint.load("u1", "c1") == _cache()


@pytest.mark.asyncio
async def test_the_checkpoint_is_short_lived(fake: _FakeRedis) -> None:
    await checkpoint.save("u1", "c1", _cache())
    (ttl,) = fake.ttls.values()
    assert 0 < ttl <= 300  # la fraîcheur d'une lecture prime : une reprise immédiate, pas un cache


@pytest.mark.asyncio
async def test_nothing_is_stored_without_a_conversation_or_without_reads(fake: _FakeRedis) -> None:
    assert await checkpoint.save("u1", None, _cache()) is False
    assert await checkpoint.save("u1", "c1", {}) is False
    assert fake.store == {}
    assert await checkpoint.load("u1", None) == {}


@pytest.mark.asyncio
async def test_an_unserialisable_result_is_left_out_never_breaks_the_save(fake: _FakeRedis) -> None:
    cache = _cache()
    cache[("odd", "{}")] = ({"tool": "odd"}, object(), False)
    assert await checkpoint.save("u1", "c1", cache) is True
    assert set(await checkpoint.load("u1", "c1")) == {("get_account", '{"id": "a-1"}'), ("search_contacts", '{"q": "dsi"}')}


@pytest.mark.asyncio
async def test_an_oversized_checkpoint_keeps_the_first_reads_within_the_bound(fake: _FakeRedis) -> None:
    cache = {
        ("get_account", f'{{"id": "{i}"}}'): ({"tool": "get_account"}, "x" * 40_000, False) for i in range(20)
    }
    assert await checkpoint.save("u1", "c1", cache) is True
    (raw,) = fake.store.values()
    assert len(raw.encode()) <= checkpoint.MAX_BYTES
    loaded = await checkpoint.load("u1", "c1")
    assert 0 < len(loaded) < 20


@pytest.mark.asyncio
async def test_corrupt_payload_reads_as_nothing(fake: _FakeRedis) -> None:
    await checkpoint.save("u1", "c1", _cache())
    key = next(iter(fake.store))
    fake.store[key] = "{pas du json"
    assert await checkpoint.load("u1", "c1") == {}
    fake.store[key] = json.dumps({"version": 99, "reads": []})
    assert await checkpoint.load("u1", "c1") == {}


@pytest.mark.asyncio
async def test_without_redis_everything_is_a_strict_no_op(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _none() -> None:
        return None

    monkeypatch.setattr(checkpoint, "_redis", _none)
    assert await checkpoint.save("u1", "c1", _cache()) is False
    assert await checkpoint.load("u1", "c1") == {}


# ── Le tour : coupé par le budget, repris sur la conversation suivante ───────

from unittest.mock import AsyncMock  # noqa: E402

from app.services import chat_orchestrator, tool_idempotency  # noqa: E402
from app.services.chat_model_routing import ChatTierContext  # noqa: E402
from app.services.chat_turn_plan import plan_turn  # noqa: E402
from tests.test_chat_orchestrator import _DummyThrottle, _install_client, _resp, _text, _tool_use  # noqa: E402

_REQUEST = "Fais une étude complète du groupe Thales"


def _rounds(n: int) -> list:
    return [
        _resp("tool_use", [_tool_use("compare_accounts", {"account_ids": [str(i)]}, f"toolu_{i}")]) for i in range(n)
    ]


async def _turn(monkeypatch, responses, *, mode="approfondi", conversation_id="c1", user_id="u1") -> None:
    tool_idempotency.forget_all()  # la déduplication à 5 s ne doit pas masquer le point de reprise
    _install_client(monkeypatch, responses)
    await chat_orchestrator.run_chat_with_tools(
        "sys",
        "user",
        user_id=user_id,
        profile_data=None,
        tier_request=_REQUEST,
        tier_context=ChatTierContext(requested_mode=mode),
        user_message=_REQUEST,
        conversation_id=conversation_id,
    )


@pytest.fixture
def executor(monkeypatch: pytest.MonkeyPatch) -> AsyncMock:
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-test")
    monkeypatch.setattr(chat_orchestrator, "throttle", lambda _p: _DummyThrottle())
    mocked = AsyncMock(return_value={"recommendation": "A"})
    monkeypatch.setattr(chat_orchestrator, "execute_chat_tool", mocked)
    return mocked


@pytest.mark.asyncio
async def test_a_cut_off_approfondi_turn_is_resumed_without_rereading(
    fake: _FakeRedis, executor: AsyncMock, monkeypatch: pytest.MonkeyPatch
) -> None:
    rounds = plan_turn(_REQUEST, ChatTierContext(requested_mode="approfondi")).tool_rounds
    await _turn(monkeypatch, [*_rounds(rounds), _resp("end_turn", [_text("Première tranche.")])])
    assert executor.await_count == rounds
    assert len(fake.store) == 1  # les lectures du tour coupé sont de côté

    before = executor.await_count
    # « continue » : le modèle redemande les MÊMES lectures puis conclut.
    await _turn(monkeypatch, [*_rounds(2), _resp("end_turn", [_text("Suite.")])])
    assert executor.await_count == before  # rien n'est relu, tout est rejoué
    assert fake.store == {}  # consommé une fois


@pytest.mark.asyncio
async def test_another_conversation_rereads_everything(
    fake: _FakeRedis, executor: AsyncMock, monkeypatch: pytest.MonkeyPatch
) -> None:
    rounds = plan_turn(_REQUEST, ChatTierContext(requested_mode="approfondi")).tool_rounds
    await _turn(monkeypatch, [*_rounds(rounds), _resp("end_turn", [_text("Tranche.")])])
    before = executor.await_count
    await _turn(monkeypatch, [*_rounds(2), _resp("end_turn", [_text("Autre fil.")])], conversation_id="c2")
    assert executor.await_count - before == 2


@pytest.mark.asyncio
async def test_a_clean_or_non_approfondi_turn_keeps_nothing(
    fake: _FakeRedis, executor: AsyncMock, monkeypatch: pytest.MonkeyPatch
) -> None:
    await _turn(monkeypatch, [*_rounds(2), _resp("end_turn", [_text("Fini.")])])
    rounds = plan_turn(_REQUEST, ChatTierContext(requested_mode="verifie")).tool_rounds
    await _turn(monkeypatch, [*_rounds(rounds), _resp("end_turn", [_text("Tranche.")])], mode="verifie")
    assert fake.store == {}


@pytest.mark.asyncio
async def test_without_a_conversation_id_the_turn_is_unchanged(
    fake: _FakeRedis, executor: AsyncMock, monkeypatch: pytest.MonkeyPatch
) -> None:
    rounds = plan_turn(_REQUEST, ChatTierContext(requested_mode="approfondi")).tool_rounds
    await _turn(monkeypatch, [*_rounds(rounds), _resp("end_turn", [_text("Tranche.")])], conversation_id=None)
    assert fake.store == {}
