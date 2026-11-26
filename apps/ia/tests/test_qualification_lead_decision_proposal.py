"""#3345.2 (LAU-FINAL-255, moitié écriture) — Laura PROPOSE d'écarter ou de
mettre en veille une piste à qualifier, jamais ne l'exécute.

Le retour de Louis : une piste reconnue périmée ou non prouvée doit cesser
d'être « opportunité active » sur les écrans. Le pont de Laura est lecture
seule par conception (`bellum_api.py`, règle 2) : l'écriture est donc le CLIC
de l'utilisateur sur la MÊME route que l'écran Opportunités. Cet outil ne rend
qu'une proposition (`_proposal()`), après avoir relu les décisions déjà prises.
"""

from __future__ import annotations

import pytest

from app.services import bellum_api
from app.services.chat_tools import CHAT_TOOLS, WRITE_TOOL_NAMES, execute_chat_tool

USER = "11111111-1111-4111-8111-111111111111"
ACCOUNT = "22222222-2222-4222-8222-222222222222"
LEAD = "33333333-3333-4333-8333-333333333333"
NAME = "propose_qualification_lead_decision"


@pytest.fixture(autouse=True)
def _configured(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)

    async def _none_yet(*_a: object, **_k: object) -> dict:
        return {"decisions": []}

    monkeypatch.setattr(bellum_api, "qualification_lead_decisions", _none_yet)


async def _run(tool_input: dict) -> dict:
    return await execute_chat_tool(NAME, tool_input, user_id=USER, profile_data=None)


def test_registered_last_but_before_push_profile_and_is_a_write_tool() -> None:
    names = [tool["name"] for tool in CHAT_TOOLS]
    assert names.index("get_qualification_lead_decisions") < names.index(NAME) < names.index("push_profile")
    assert NAME in WRITE_TOOL_NAMES


@pytest.mark.asyncio
async def test_dismissal_with_a_reason_is_a_proposal_never_an_effect() -> None:
    result = await _run(
        {
            "account_id": ACCOUNT,
            "account_name": "Decathlon",
            "lead_key": LEAD,
            "lead_label": "Refonte data",
            "decision": "dismissed",
            "reason": "no_real_demand",
        }
    )
    assert result["status"] == "pending_confirmation"
    assert result["proposal"] == {
        "action": "decide_qualification_lead",
        "account_id": ACCOUNT,
        "account_name": "Decathlon",
        "lead_key": LEAD,
        "lead_label": "Refonte data",
        "decision": "dismissed",
        "reason": "no_real_demand",
        "note": None,
        "snoozed_until": None,
        "cost_credits": 0,
    }


@pytest.mark.asyncio
async def test_snooze_needs_a_future_date_and_no_reason() -> None:
    ok = await _run(
        {"account_id": ACCOUNT, "lead_key": LEAD, "decision": "snoozed", "snoozed_until": "2999-01-01"}
    )
    assert ok["proposal"]["snoozed_until"] == "2999-01-01"
    assert ok["proposal"]["reason"] is None
    assert ok["proposal"]["lead_label"] is None  # jamais deviné

    for bad in (
        {"decision": "snoozed"},
        {"decision": "snoozed", "snoozed_until": "demain"},
        {"decision": "snoozed", "snoozed_until": "2020-01-01"},
        {"decision": "snoozed", "snoozed_until": "2999-01-01", "reason": "bad_timing"},
    ):
        result = await _run({"account_id": ACCOUNT, "lead_key": LEAD, **bad})
        assert "error" in result and "proposal" not in result


@pytest.mark.asyncio
async def test_dismissal_without_or_with_invented_reason_is_refused() -> None:
    for extra in ({}, {"reason": "inventé"}, {"reason": "bad_timing", "snoozed_until": "2999-01-01"}):
        result = await _run({"account_id": ACCOUNT, "lead_key": LEAD, "decision": "dismissed", **extra})
        assert "error" in result and "proposal" not in result


@pytest.mark.asyncio
async def test_account_and_lead_are_required() -> None:
    assert "error" in await _run({"lead_key": LEAD, "decision": "dismissed", "reason": "other"})
    assert "error" in await _run({"account_id": ACCOUNT, "decision": "dismissed", "reason": "other"})


@pytest.mark.asyncio
async def test_a_lead_already_decided_the_same_way_is_not_proposed_again(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _decided(*_a: object, **_k: object) -> dict:
        return {"decisions": [{"lead_key": LEAD, "decision": "dismissed", "reason": "bad_timing"}]}

    monkeypatch.setattr(bellum_api, "qualification_lead_decisions", _decided)
    result = await _run({"account_id": ACCOUNT, "lead_key": LEAD, "decision": "dismissed", "reason": "other"})
    assert "error" in result and "proposal" not in result


@pytest.mark.asyncio
async def test_a_dead_bridge_says_so(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _down(*_a: object, **_k: object) -> None:
        return None

    monkeypatch.setattr(bellum_api, "qualification_lead_decisions", _down)
    result = await _run({"account_id": ACCOUNT, "lead_key": LEAD, "decision": "dismissed", "reason": "other"})
    assert "error" in result and "proposal" not in result


# ── #3345 (recette prod 03/10) — la piste se retrouve par son LIBELLÉ ─────────
# L'utilisateur nomme « piste ACTIA Group » ; Laura demandait l'identifiant
# interne et ne rendait aucune carte. Le serveur résout le libellé ; un humain
# ne reçoit JAMAIS la demande d'un identifiant.

_OTHER_LEAD = "44444444-4444-4444-8444-444444444444"


def _resolver(monkeypatch: pytest.MonkeyPatch, matches: list[dict], matched_on: str = "label") -> list[dict]:
    calls: list[dict] = []

    async def _resolve(_user: str, *, label: str, account_id: str | None = None) -> dict:
        calls.append({"label": label, "account_id": account_id})
        return {"matched_on": matched_on if matches else "none", "matches": matches}

    monkeypatch.setattr(bellum_api, "resolve_qualification_lead", _resolve, raising=False)
    return calls


def _lead(key: str, label: str) -> dict:
    return {"lead_key": key, "label": label, "account_id": ACCOUNT, "company_name": "ACTIA Group"}


@pytest.mark.asyncio
async def test_a_unique_label_match_gives_the_dismissal_card_without_asking_for_an_id(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    calls = _resolver(monkeypatch, [_lead(LEAD, "Risque de ralentissement du time-to-market")])
    result = await _run(
        {"lead_label": "piste ACTIA Group", "decision": "dismissed", "reason": "bad_timing"}
    )
    assert calls == [{"label": "piste ACTIA Group", "account_id": None}]
    assert result["status"] == "pending_confirmation"
    proposal = result["proposal"]
    assert proposal["lead_key"] == LEAD
    assert proposal["account_id"] == ACCOUNT
    assert proposal["account_name"] == "ACTIA Group"
    assert proposal["lead_label"] == "Risque de ralentissement du time-to-market"
    assert proposal["reason"] == "bad_timing"


@pytest.mark.asyncio
async def test_several_matches_give_a_list_to_choose_from_never_a_guess(monkeypatch: pytest.MonkeyPatch) -> None:
    _resolver(monkeypatch, [_lead(LEAD, "Risque time-to-market"), _lead(_OTHER_LEAD, "Refonte SI")], "account")
    result = await _run({"lead_label": "piste ACTIA Group", "decision": "dismissed", "reason": "bad_timing"})
    assert "proposal" not in result
    assert result["status"] == "needs_choice"
    assert [c["label"] for c in result["candidates"]] == ["Risque time-to-market", "Refonte SI"]
    # L'utilisateur choisit par LIBELLÉ : aucun identifiant n'est exposé à l'humain.
    assert all("lead_key" not in c for c in result["candidates"])
    assert "identifiant" not in result["instruction"].lower().replace("jamais d'identifiant", "")


@pytest.mark.asyncio
async def test_no_match_says_so_and_never_asks_the_human_for_an_id(monkeypatch: pytest.MonkeyPatch) -> None:
    _resolver(monkeypatch, [])
    result = await _run({"lead_label": "piste Inconnue SA", "decision": "dismissed", "reason": "bad_timing"})
    assert "proposal" not in result
    assert "aucune piste" in result["error"].lower()
    assert "identifiant" not in result["error"].lower()


@pytest.mark.asyncio
async def test_a_dead_bridge_is_an_error_not_a_guess(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _down(*_a: object, **_k: object) -> None:
        return None

    monkeypatch.setattr(bellum_api, "resolve_qualification_lead", _down, raising=False)
    result = await _run({"lead_label": "piste ACTIA Group", "decision": "dismissed", "reason": "bad_timing"})
    assert "proposal" not in result
    assert "error" in result


@pytest.mark.asyncio
async def test_neither_key_nor_label_is_refused() -> None:
    result = await _run({"decision": "dismissed", "reason": "bad_timing"})
    assert "error" in result and "proposal" not in result


def test_the_schema_no_longer_requires_the_internal_identifiers() -> None:
    tool = next(t for t in CHAT_TOOLS if t["name"] == NAME)
    assert tool["input_schema"]["required"] == ["decision"]
    assert "libellé" in tool["description"].lower()
