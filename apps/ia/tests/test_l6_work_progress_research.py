"""Lot L6 — #4611 « tout le travail en cours » et #4967 « question pendant un run ».

Pendant qu'une recherche de Laura tourne côté serveur, une question posée à côté (« où en est ma
recherche ? ») est un tour SÉPARÉ qui LIT l'état du travail : les jobs de Laura et les recherches en
cours sont deux familles de ``get_work_progress``. Les refus : « en cours » mesuré seul ne fabrique ni
lancées ni rendues (cases vides, jamais « 0 ») ; une raison d'échec qui finit par un point ne fait pas
« .. » dans la carte (recette prod 31/10, « Relancez-la.. »).
"""

from __future__ import annotations

import pytest

from app.services import bellum_api, chat_tools
from app.services.work_progress_tool import (
    FAMILIES,
    GET_WORK_PROGRESS_TOOL_NAME,
    asks_work_progress,
    progress_block_from_output,
)

USER = "22222222-2222-4222-8222-222222222222"
_NO_LEDGER = {"measured": False, "reason": "no_run_ledger", "reasonLabel": "aucun journal par espace ne tient ce suivi"}


def _m(value: int) -> dict:
    return {"measured": True, "value": value}


def _family(family: str, counters: dict, **extra: object) -> dict:
    return {
        "family": family,
        "counters": counters,
        "since": extra.get("since"),
        "lastActivityAt": extra.get("since"),
        "failures": extra.get("failures", []),
    }


def _payload() -> dict:
    return {
        "kind": "progress",
        "readAt": "2026-11-01T10:00:00.000Z",
        "windowDays": 7,
        "families": [
            _family(
                "crm_sync",
                {"launched": _m(1), "done": _m(0), "failed": _m(1), "running": _m(0)},
                since="2026-10-31T08:00:00.000Z",
                failures=[
                    {
                        "label": "pipedrive",
                        "reason": "La synchronisation a été interrompue (redémarrage du serveur). Relancez-la.",
                        "at": None,
                    }
                ],
            ),
            _family(
                "laura_job",
                {"launched": _m(2), "done": _m(1), "failed": _m(0), "running": _m(1)},
                since="2026-10-31T09:00:00.000Z",
            ),
            _family(
                "chat_research",
                {"launched": _NO_LEDGER, "done": _NO_LEDGER, "failed": _NO_LEDGER, "running": _m(1)},
                since="2026-11-01T09:58:00.000Z",
            ),
        ],
    }


@pytest.fixture(autouse=True)
def _bridge(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)

    async def fake(user_id: str, *, lot_id: str | None = None) -> tuple[dict | None, str | None]:
        return _payload(), None

    monkeypatch.setattr(bellum_api, "work_progress", fake)


async def _read() -> dict:
    return await chat_tools.execute_chat_tool(GET_WORK_PROGRESS_TOOL_NAME, {}, user_id=USER, profile_data=None)


def test_the_two_new_families_are_mirrored_at_the_end() -> None:
    assert FAMILIES[:5] == ("analysis", "import", "enrichment", "crm_sync", "catch_up")
    assert FAMILIES[5:] == ("laura_job", "chat_research")


@pytest.mark.asyncio
async def test_a_running_research_is_read_and_shown_as_running() -> None:
    result = await _read()
    names = [family["family"] for family in result["families"]]
    assert names == ["crm_sync", "laura_job", "chat_research"]
    block = progress_block_from_output(result)
    assert block is not None
    labels = [row["label"] for row in block["rows"]]
    assert any(label.startswith("Recherches en conversation") for label in labels)
    assert any(label.startswith("Jobs en plusieurs étapes") for label in labels)
    research = next(row for row in block["rows"] if row["label"].startswith("Recherches en conversation"))
    # Lancées, Rendues, En erreur : NON mesurées → cases vides ; En cours : 1.
    assert research["cells"] == [None, None, None, "1"]


@pytest.mark.asyncio
async def test_no_double_period_after_a_reason_that_ends_with_one() -> None:
    block = progress_block_from_output(await _read())
    assert block is not None
    note = block.get("note") or ""
    assert "Relancez-la" in note
    assert ".." not in note


@pytest.mark.parametrize(
    "message",
    ["où en est ma recherche ?", "où en est la recherche de Laura ?", "elle avance, ma recherche ?"],
)
def test_a_question_about_the_running_research_is_a_progress_question(message: str) -> None:
    assert asks_work_progress(message)


def test_a_new_search_request_is_not_a_progress_question() -> None:
    assert not asks_work_progress("lance une recherche sur Thales")
