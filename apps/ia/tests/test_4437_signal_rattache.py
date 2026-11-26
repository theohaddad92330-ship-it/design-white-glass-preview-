"""#4437 (épopée #4433) — un signal dont le libellé n'est pas au référentiel ne disparaît pas : il est RATTACHÉ
au plus proche (tender / award / hiring) et le rattachement se DIT ; ce qui n'a pas de voisin est NOMMÉ."""

from __future__ import annotations

from app.services.signal_attach import attach_signals

ALLOWED = ("tender", "award", "hiring")


def test_known_values_pass_untouched():
    out = attach_signals(["hiring", "tender"], ALLOWED)
    assert out.signals == ["tender", "hiring"] or out.signals == ["hiring", "tender"]
    assert out.attached == [] and out.unmatched == []


def test_free_label_is_attached_to_the_nearest_and_said():
    out = attach_signals(["Recrutement React", "projet data en cours"], ALLOWED)
    assert "hiring" in out.signals
    asked = {a["asked"]: a["attachedTo"] for a in out.attached}
    assert asked["Recrutement React"] == "hiring"
    assert out.line and "Recrutement React" in out.line
    assert out.unmatched == ["projet data en cours"]


def test_award_and_tender_wordings():
    out = attach_signals(["marché public attribué", "appel d'offres IT", "consultation"], ALLOWED)
    asked = {a["asked"]: a["attachedTo"] for a in out.attached}
    assert asked["marché public attribué"] == "award"
    assert asked["appel d'offres IT"] == "tender"
    assert asked["consultation"] == "tender"


def test_no_neighbour_is_named_never_invented():
    out = attach_signals(["météo favorable"], ALLOWED)
    assert out.signals == [] and out.attached == []
    assert out.unmatched == ["météo favorable"]


def test_none_and_non_strings_are_safe():
    out = attach_signals(None, ALLOWED)
    assert out.signals == [] and out.line is None
    assert attach_signals([3, None, ""], ALLOWED).unmatched == []


# ── câblage dans les deux outils de recherche de comptes ─────────────────────

import pytest  # noqa: E402

from app.services.chat_tools import execute_chat_tool  # noqa: E402
from tests.test_run_account_search_tool import _candidate, _Response, _stub_registry  # noqa: E402


@pytest.mark.asyncio
async def test_run_account_search_attaches_a_free_signal_and_says_so(monkeypatch: pytest.MonkeyPatch):
    _stub_registry(monkeypatch, _Response([_candidate()]))
    out = await execute_chat_tool(
        "run_account_search",
        {"department": "75", "signals": ["recrutement React", "météo favorable"]},
        user_id="u-1",
        profile_data=None,
    )
    assert out["signals_attached"] == [{"asked": "recrutement React", "attachedTo": "hiring"}]
    assert "recrutement React" in out["signals_attached_line"]
    assert out["signals_unmatched"] == ["météo favorable"]


@pytest.mark.asyncio
async def test_run_account_search_without_free_signal_adds_nothing(monkeypatch: pytest.MonkeyPatch):
    _stub_registry(monkeypatch, _Response([_candidate()]))
    out = await execute_chat_tool("run_account_search", {"department": "75"}, user_id="u-1", profile_data=None)
    assert "signals_attached" not in out and "signals_unmatched" not in out
