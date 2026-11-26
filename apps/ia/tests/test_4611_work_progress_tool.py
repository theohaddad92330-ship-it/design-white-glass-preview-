"""#4611 — Laura DIT où en est le travail lancé, au lieu de le raconter sans donnée.

Les trois REFUS qui comptent, dans l'ordre où ils protègent :
  .8  un lot d'un AUTRE espace rend « inconnu », jamais ses chiffres ;
  .5  un chiffre non mesuré ne devient JAMAIS « 0 » ;
  .10 une réponse sur l'avancement ne part PAS sans résultat d'outil.
Puis la forme : lecture seule (.1/.2), carte (.3), compteur jamais déduit (.4), raison d'échec (.6),
amont injoignable (.7).
"""

from __future__ import annotations

import pytest

from app.models.reply_blocks import validate_reply_block
from app.services import bellum_api, chat_tools
from app.services.work_progress_tool import (
    GET_WORK_PROGRESS_TOOL,
    GET_WORK_PROGRESS_TOOL_NAME,
    asks_work_progress,
    progress_answer_gate,
    progress_block_from_output,
)

USER = "22222222-2222-4222-8222-222222222222"
LOT = "33333333-3333-4333-8333-333333333333"


def _m(value: int) -> dict:
    return {"measured": True, "value": value}


_LABELS = {"read_failed": "la lecture a échoué", "no_run_ledger": "aucun journal par espace ne tient ce suivi"}


def _n(reason: str = "read_failed") -> dict:
    return {"measured": False, "reason": reason, "reasonLabel": _LABELS[reason]}


def _family(family: str, launched: dict, done: dict, failed: dict, running: dict, **extra: object) -> dict:
    return {
        "family": family,
        "counters": {"launched": launched, "done": done, "failed": failed, "running": running},
        "since": extra.pop("since", "2026-10-26T09:00:00.000Z"),
        "lastActivityAt": extra.pop("lastActivityAt", "2026-10-28T09:30:00.000Z"),
        "failures": extra.pop("failures", []),
    }


def _bridge_payload() -> dict:
    return {
        "kind": "progress",
        "readAt": "2026-10-28T10:00:00.000Z",
        "windowDays": 7,
        "families": [
            _family(
                "analysis",
                _m(15),
                _m(10),
                _m(2),
                _m(3),
                failures=[{"label": "Thales", "reason": "launch_error", "at": "2026-10-28T08:00:00.000Z"}],
            ),
            _family("import", _m(2), _m(2), _m(0), _m(0)),
            _family("enrichment", _n(), _n(), _n(), _n(), since=None, lastActivityAt=None),
            _family("crm_sync", _m(0), _m(0), _m(0), _m(0), since=None, lastActivityAt=None),
            _family(
                "catch_up",
                _n("no_run_ledger"),
                _n("no_run_ledger"),
                _n("no_run_ledger"),
                _n("no_run_ledger"),
                since=None,
                lastActivityAt=None,
            ),
        ],
    }


@pytest.fixture(autouse=True)
def _configured(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)


def _bridge(monkeypatch: pytest.MonkeyPatch, result: tuple[dict | None, str | None]) -> list[tuple[str, str | None]]:
    calls: list[tuple[str, str | None]] = []

    async def fake(user_id: str, *, lot_id: str | None = None) -> tuple[dict | None, str | None]:
        calls.append((user_id, lot_id))
        return result

    monkeypatch.setattr(bellum_api, "work_progress", fake)
    return calls


async def _run(payload: dict | None = None) -> dict:
    return await chat_tools.execute_chat_tool(
        GET_WORK_PROGRESS_TOOL_NAME, payload or {}, user_id=USER, profile_data=None
    )


# ── Le catalogue ─────────────────────────────────────────────────────────────


def test_the_tool_is_declared_at_the_end_and_reads_only() -> None:
    names = [str(tool["name"]) for tool in chat_tools.CHAT_TOOLS]
    assert GET_WORK_PROGRESS_TOOL_NAME in names
    assert GET_WORK_PROGRESS_TOOL_NAME not in chat_tools.WRITE_TOOL_NAMES
    description = str(GET_WORK_PROGRESS_TOOL["description"])
    assert "carte" in description
    # Elle LIT : ni relance, ni rejeu, ni probabilité.
    assert "probabilité" in description and "relance" in description


# ── .8 — le REFUS : un lot d'un autre espace ─────────────────────────────────


@pytest.mark.asyncio
async def test_a_lot_of_another_workspace_is_unknown_never_its_figures(monkeypatch: pytest.MonkeyPatch) -> None:
    calls = _bridge(monkeypatch, ({"kind": "lot_unknown", "lotId": LOT}, None))
    result = await _run({"lot_id": LOT})
    assert calls == [(USER, LOT)]
    assert result["status"] == "lot_unknown"
    assert "families" not in result and "counters" not in str(result)
    assert progress_block_from_output(result) is None


@pytest.mark.asyncio
async def test_a_malformed_lot_id_never_leaves_the_service(monkeypatch: pytest.MonkeyPatch) -> None:
    calls = _bridge(monkeypatch, (_bridge_payload(), None))
    result = await _run({"lot_id": "x'; drop table"})
    assert calls == []
    assert "error" in result


# ── .5 — le REFUS : non mesuré ne devient jamais « 0 » ───────────────────────


@pytest.mark.asyncio
async def test_an_unmeasured_figure_stays_named_in_the_output_and_never_becomes_zero(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _bridge(monkeypatch, (_bridge_payload(), None))
    result = await _run()
    enrichment = next(f for f in result["families"] if f["family"] == "enrichment")
    assert enrichment["counters"]["launched"] is None
    assert enrichment["unmeasured"] == {
        "launched": "la lecture a échoué",
        "done": "la lecture a échoué",
        "failed": "la lecture a échoué",
        "running": "la lecture a échoué",
    }
    catch_up = next(f for f in result["families"] if f["family"] == "catch_up")
    assert catch_up["unmeasured"]["launched"] == "aucun journal par espace ne tient ce suivi"
    # …et un vrai zéro mesuré reste un zéro : la seule source de « 0 ».
    crm = next(f for f in result["families"] if f["family"] == "crm_sync")
    assert crm["counters"]["launched"] == 0


@pytest.mark.asyncio
async def test_the_card_leaves_an_unmeasured_cell_empty_never_zero(monkeypatch: pytest.MonkeyPatch) -> None:
    _bridge(monkeypatch, (_bridge_payload(), None))
    block = progress_block_from_output(await _run())
    assert block is not None
    rows = {row["label"].split(" · ")[0]: row["cells"] for row in block["rows"]}
    assert rows["Enrichissements"] == [None, None, None, None]
    assert rows["Rattrapages"] == [None, None, None, None]
    assert rows["Analyses"] == ["15", "10", "2", "3"]
    validate_reply_block(block)  # un bloc que le contrat accepte


@pytest.mark.asyncio
async def test_a_counter_is_never_deduced_by_subtraction(monkeypatch: pytest.MonkeyPatch) -> None:
    """#4611.4 — 15 lancées, 10 rendues, « en cours » non mesuré : la carte ne rend pas 5."""
    payload = _bridge_payload()
    payload["families"][0]["counters"]["running"] = _n()
    payload["families"][0]["counters"]["failed"] = _n()
    _bridge(monkeypatch, (payload, None))
    block = progress_block_from_output(await _run())
    assert block is not None
    analyses = next(row for row in block["rows"] if row["label"].startswith("Analyses"))
    assert analyses["cells"] == ["15", "10", None, None]


@pytest.mark.asyncio
async def test_a_family_with_nothing_launched_makes_no_row_but_is_named(monkeypatch: pytest.MonkeyPatch) -> None:
    """« On n'affiche pas ce qu'on n'a pas » : pas de ligne de zéros, l'absence se nomme dans la note."""
    _bridge(monkeypatch, (_bridge_payload(), None))
    block = progress_block_from_output(await _run())
    assert block is not None
    assert not any(row["label"].startswith("Synchros") for row in block["rows"])
    assert "Synchros CRM" in (block.get("note") or "")


# ── .6 — l'échec est nommé avec sa raison ────────────────────────────────────


@pytest.mark.asyncio
async def test_a_failure_carries_the_reason_the_source_gave(monkeypatch: pytest.MonkeyPatch) -> None:
    _bridge(monkeypatch, (_bridge_payload(), None))
    result = await _run()
    analysis = result["families"][0]
    assert analysis["failures"] == [{"label": "Thales", "reason": "launch_error", "at": "2026-10-28T08:00:00.000Z"}]
    block = progress_block_from_output(result)
    assert block is not None and "Thales" in (block.get("note") or "") and "launch_error" in (block.get("note") or "")


@pytest.mark.asyncio
async def test_a_failure_without_a_reason_says_so_instead_of_inventing_one(monkeypatch: pytest.MonkeyPatch) -> None:
    payload = _bridge_payload()
    payload["families"][0]["failures"] = [{"label": "Airbus", "reason": None, "at": None}]
    _bridge(monkeypatch, (payload, None))
    result = await _run()
    assert result["families"][0]["failures"][0]["reason"] is None
    block = progress_block_from_output(result)
    assert block is not None and "raison non fournie" in (block.get("note") or "")


# ── .7 — amont injoignable : erreur claire ; timeout : « unknown », pas de reprise ──


@pytest.mark.asyncio
async def test_unreachable_upstream_is_a_clear_error_never_an_invented_figure(monkeypatch: pytest.MonkeyPatch) -> None:
    _bridge(monkeypatch, (None, "unreachable"))
    result = await _run()
    assert "error" in result and "families" not in result
    assert progress_block_from_output(result) is None


@pytest.mark.asyncio
async def test_a_timeout_is_unknown_not_a_failure_and_stops_the_retry(monkeypatch: pytest.MonkeyPatch) -> None:
    _bridge(monkeypatch, (None, "timeout"))
    result = await _run()
    assert result["outcome"] == "unknown"
    assert result["retryable"] is False
    assert "families" not in result


@pytest.mark.asyncio
async def test_unconfigured_bridge_refuses_rather_than_answering(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(bellum_api, "is_configured", lambda: False)
    result = await _run()
    assert "error" in result


# ── .10 — le REFUS : pas de réponse d'avancement sans résultat d'outil ───────

ASKS = [
    "où en est la carte ?",
    "j'aimerais que tu me dises où en sont les 15 analyses lancées",
    "comment avance l'ensemble ?",
    "Où en est mon import ?",
    "l'avancement de mes enrichissements",
]
NOT_ASKS = [
    "où en est ce compte ?",
    "où en est le deal Thales ?",
    "lance l'analyse de Thales",
    "quel est le chiffre d'affaires ?",
    # « à l'avance » n'est pas un point d'avancement, même à côté d'un mot de travail.
    "prépare l'analyse de Thales à l'avance",
    "",
]


@pytest.mark.parametrize("message", ASKS)
def test_progress_questions_are_recognised(message: str) -> None:
    assert asks_work_progress(message)


@pytest.mark.parametrize("message", NOT_ASKS)
def test_other_questions_are_not_taken_for_progress(message: str) -> None:
    assert not asks_work_progress(message)


def test_the_answer_does_not_leave_without_a_tool_result() -> None:
    refusal = progress_answer_gate("où en est la carte ?", read=None)
    assert refusal is not None
    assert "pas pu lire" in refusal
    # Elle ne raconte rien : ni chiffre, ni état.
    assert not any(ch.isdigit() for ch in refusal)


def test_a_failed_read_is_a_refusal_too() -> None:
    assert progress_answer_gate("où en est la carte ?", read={"error": "Je n'ai pas pu lire."}) is not None


def test_a_timeout_says_unknown_and_does_not_tell_to_retry() -> None:
    text = progress_answer_gate(
        "où en est la carte ?", read={"error": "délai", "outcome": "unknown", "retryable": False}
    )
    assert text is not None
    assert "ne sais pas" in text
    assert "réessaie" not in text.lower() and "relance" not in text.lower()


def test_a_real_read_lets_the_answer_through_and_so_does_another_question() -> None:
    assert progress_answer_gate("où en est la carte ?", read={"kind": "progress", "families": []}) is None
    assert progress_answer_gate("lance l'analyse de Thales", read=None) is None
    assert progress_answer_gate("où en est la carte ?", read={"status": "lot_unknown"}) is None


# ── .7 — la couche HTTP : un délai dépassé n'est pas un échec, et seul CET appel le distingue ──


def _http(monkeypatch: pytest.MonkeyPatch, outcome: Exception | dict) -> None:
    import httpx

    class _Response:
        status_code = 200

        def json(self) -> dict:
            assert isinstance(outcome, dict)
            return outcome

    class _Client:
        def __init__(self, **_kw: object) -> None: ...

        async def __aenter__(self) -> _Client:
            return self

        async def __aexit__(self, *_a: object) -> bool:
            return False

        async def post(self, *_a: object, **_kw: object) -> _Response:
            if isinstance(outcome, Exception):
                raise outcome
            return _Response()

    monkeypatch.setenv("API_INTERNAL_URL", "http://api.internal")
    monkeypatch.setenv("INTERNAL_API_SECRET", "test-secret-value")
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)
    monkeypatch.setattr(httpx, "AsyncClient", _Client)


@pytest.mark.asyncio
async def test_a_read_timeout_is_reported_as_timeout_by_the_progress_call(monkeypatch: pytest.MonkeyPatch) -> None:
    import httpx

    _http(monkeypatch, httpx.ReadTimeout("slow"))
    assert await bellum_api.work_progress(USER) == (None, "timeout")


@pytest.mark.asyncio
async def test_a_connection_failure_stays_unreachable(monkeypatch: pytest.MonkeyPatch) -> None:
    import httpx

    _http(monkeypatch, httpx.ConnectError("down"))
    assert await bellum_api.work_progress(USER) == (None, "unreachable")


@pytest.mark.asyncio
async def test_other_bridge_calls_keep_their_old_failure_vocabulary(monkeypatch: pytest.MonkeyPatch) -> None:
    """Le défaut est byte-identique : sans la demande explicite, un délai reste ``unreachable``."""
    import httpx

    _http(monkeypatch, httpx.ReadTimeout("slow"))
    assert await bellum_api._post_explained("/internal/copilot/pipeline/health", {}) == (None, "unreachable", None)


@pytest.mark.asyncio
async def test_the_progress_call_sends_the_lot_and_never_anything_else(monkeypatch: pytest.MonkeyPatch) -> None:
    sent: list[tuple[str, dict]] = []

    async def fake_post(path: str, payload: dict, **_kw: object) -> tuple[dict, None, None]:
        sent.append((path, payload))
        return {"kind": "progress"}, None, None

    monkeypatch.setattr(bellum_api, "_post_explained", fake_post)
    await bellum_api.work_progress(USER, lot_id=LOT)
    assert sent == [("/internal/copilot/work-progress", {"userId": USER, "lotId": LOT})]
