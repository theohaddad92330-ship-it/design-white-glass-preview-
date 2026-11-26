"""Phase 3 must emit contacts in a stable order.

Batches run in parallel and were collected via ``asyncio.as_completed``, i.e. in
wall-clock completion order. Whichever Haiku call happened to answer first put
its contacts at the top of the list. That order is load-bearing downstream —
``enrich_top_deciders`` takes ``[:CONTACTS_ENRICH_MAX]``, Phase 4 slices the top
contacts for message generation, and plays bind to contacts positionally — so
two identical runs produced a different enriched set and different messages.

These tests force batch 2 to finish before batch 1 and assert the output is
still assembled in batch order.
"""

from __future__ import annotations

import asyncio
from typing import Any

import pytest

from app.models.classify import ClassifyRequest
from app.models.outputs.contacts import ContactsOutput, OrganigrammeOutput
from app.services import classification


def _contact(name: str) -> dict[str, Any]:
    return {"fullName": name, "title": "DSI", "entity": "ACME"}


def _classified(name: str) -> dict[str, Any]:
    return {
        "fullName": name,
        "title": "DSI",
        "entity": "ACME",
        "role": "sponsor",
        "priority": 1,
        "summary": "Décideur IT",
        "whyContact": "Budget",
    }


def _install_staggered_claude(monkeypatch: pytest.MonkeyPatch, *, batch_names: dict[int, list[str]],
                              delays: dict[int, float]) -> None:
    """Patch ``call_claude`` so batch N returns ``batch_names[N]`` after ``delays[N]``."""

    async def fake_call_claude(_system: str, _user: str, **kwargs: Any) -> tuple[Any, None]:
        prompt_name = kwargs.get("prompt_name", "")
        if "organigramme" in prompt_name:
            return OrganigrammeOutput.model_validate({"organigramme": [], "decisionChain": {}}), None
        # prompt_name == "bellum_contacts_batch_{i}_of_{n}"
        idx = int(prompt_name.split("_batch_")[1].split("_of_")[0])
        await asyncio.sleep(delays[idx])
        return (
            ContactsOutput.model_validate(
                {"contacts": [_classified(n) for n in batch_names[idx]]}
            ),
            None,
        )

    monkeypatch.setattr(classification, "call_claude", fake_call_claude)


@pytest.mark.asyncio
async def test_contacts_keep_batch_order_when_batch_two_finishes_first(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(classification, "CONTACTS_BATCH_SIZE", 2)
    first = ["Alice Un", "Bob Deux"]
    second = ["Chloe Trois", "David Quatre"]
    _install_staggered_claude(
        monkeypatch,
        batch_names={1: first, 2: second},
        # Batch 1 is deliberately the slow one — completion order is 2 then 1.
        delays={1: 0.05, 2: 0.0},
    )

    result = await classification.classify_contacts_and_organigramme(
        ClassifyRequest(
            account_id="acc-1",
            contacts=[_contact(n) for n in first + second],
            profile_data={"companyName": "ACME"},
        )
    )

    names = [c["fullName"] for c in result["contacts"]]
    assert names == first + second, "contacts must follow batch order, not completion order"


@pytest.mark.asyncio
async def test_output_identical_across_runs_with_shuffled_latency(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Same input, different completion order → byte-identical contact sequence."""
    monkeypatch.setattr(classification, "CONTACTS_BATCH_SIZE", 2)
    first = ["Alice Un", "Bob Deux"]
    second = ["Chloe Trois", "David Quatre"]
    names_by_batch = {1: first, 2: second}

    async def run(delays: dict[int, float]) -> list[str]:
        _install_staggered_claude(monkeypatch, batch_names=names_by_batch, delays=delays)
        out = await classification.classify_contacts_and_organigramme(
            ClassifyRequest(
                account_id="acc-1",
                contacts=[_contact(n) for n in first + second],
                profile_data={"companyName": "ACME"},
            )
        )
        return [c["fullName"] for c in out["contacts"]]

    run_a = await run({1: 0.05, 2: 0.0})
    run_b = await run({1: 0.0, 2: 0.05})
    assert run_a == run_b


@pytest.mark.asyncio
async def test_failed_batch_is_recorded_as_a_degraded_source(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A batch that raises returns [] — the run must SAY it lost those contacts
    instead of just reporting a smaller list."""
    monkeypatch.setattr(classification, "CONTACTS_BATCH_SIZE", 2)
    recorded: list[dict[str, str]] = []
    monkeypatch.setattr(
        classification,
        "record_degradation",
        lambda cid, *, source, reason: recorded.append({"source": source, "reason": reason}),
    )

    async def fake_call_claude(_system: str, _user: str, **kwargs: Any) -> tuple[Any, None]:
        prompt_name = kwargs.get("prompt_name", "")
        if "organigramme" in prompt_name:
            return OrganigrammeOutput.model_validate({"organigramme": [], "decisionChain": {}}), None
        if "_batch_2_" in prompt_name:
            raise RuntimeError("Haiku 529 overloaded")
        return ContactsOutput.model_validate({"contacts": [_classified("Alice Un")]}), None

    monkeypatch.setattr(classification, "call_claude", fake_call_claude)

    result = await classification.classify_contacts_and_organigramme(
        ClassifyRequest(
            account_id="acc-1",
            contacts=[_contact(n) for n in ["Alice Un", "Bob Deux", "Chloe Trois", "David Quatre"]],
            profile_data={"companyName": "ACME"},
        )
    )

    assert len(result["contacts"]) == 1
    assert recorded and recorded[0]["source"] == "classify_batch"
