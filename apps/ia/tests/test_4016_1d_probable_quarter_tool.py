"""#4016.1d — Laura CITE la probabilité calibrée (jamais un chiffre nu).

Le pont rend l'enveloppe calibrée (`closing_probability`) et le CA probable du
trimestre ; l'outil la relaie TELLE QUELLE et ajoute des libellés DÉJÀ
formatés (`probability_label`, `calibration_label`, `*_eur`) pour que le modèle
ne refasse aucun calcul. Un `value` nul est « non mesuré », jamais 0 %.
"""

from __future__ import annotations

import pytest

from app.services import bellum_api
from app.services.chat_tools import CHAT_TOOLS, execute_chat_tool

USER = "22222222-2222-4222-8222-222222222222"


@pytest.fixture(autouse=True)
def _configured(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)


def _axes() -> list[dict]:
    return [
        {"key": "stage", "evaluable": True, "reason": "negotiation", "won": None, "lost": None, "weight": None},
        {"key": "workspace_history", "evaluable": True, "reason": "decided_deals", "won": 4, "lost": 1, "weight": None},
        {
            "key": "shared_base",
            "evaluable": False,
            "reason": "not_enough_shared_data",
            "won": None,
            "lost": None,
            "weight": None,
        },
    ]


def _deal(opportunity_id: str, value: float | None, label: str = "Supervision 24/7") -> dict:
    measured = value is not None
    return {
        "opportunity_id": opportunity_id,
        "label": label,
        "stage": "negotiation",
        "amount_cents": 10_000_000,
        "currency": "EUR",
        "expected_close_on": "2026-11-15",
        "closing_probability": {
            "method": "beta_binomial_stage_v1",
            "value": value,
            "interval": {"level": 0.8, "low": 0.55, "high": 0.84} if measured else None,
            "observations": 5,
            "axes": _axes(),
            "unevaluable_axes": ["shared_base"],
            "not_measured_reason": None if measured else "insufficient_history",
        },
    }


def _payload() -> dict:
    return {
        "method": "beta_binomial_stage_v1",
        "quarter": {"from": "2026-10-11", "until": "2027-01-11"},
        "revenue": {
            "totals": [
                {
                    "currency": "EUR",
                    "expected_cents": 7_142_857,
                    "low_cents": 5_000_000,
                    "high_cents": 9_000_000,
                    "deals": 1,
                }
            ],
            "without_amount": 0,
            "without_probability": 1,
        },
        "calibration": {
            "method": "leave_one_out_v1",
            "evaluated": 12,
            "brier": 0.2,
            "baseline_brier": 0.22,
            "bins": [],
            "not_measured_reason": None,
        },
        "deals": [_deal("o-1", 0.714), _deal("o-2", None, "Data lake")],
    }


async def _run(tool_input: dict | None = None) -> dict:
    return await execute_chat_tool("get_probable_quarter", tool_input or {}, user_id=USER, profile_data=None)


def test_tool_is_in_the_catalogue_and_names_its_guard_rails() -> None:
    tool = next(t for t in CHAT_TOOLS if t["name"] == "get_probable_quarter")
    description = tool["description"]
    for word in ("intervalle", "méthode", "non mesuré", "axes"):
        assert word in description
    assert tool["input_schema"]["required"] == []


@pytest.mark.asyncio
async def test_relays_the_calibrated_envelope_with_ready_made_labels(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _probable(user_id: str) -> dict:
        assert user_id == USER
        return _payload()

    monkeypatch.setattr(bellum_api, "probable_quarter", _probable, raising=False)
    result = await _run()
    first, second = result["deals"]
    assert first["closing_probability"]["method"] == "beta_binomial_stage_v1"
    assert first["probability_label"] == "71 % (entre 55 % et 84 %)"
    # Un chiffre non mesuré n'est JAMAIS 0 % : la raison est dite.
    assert "0 %" not in second["probability_label"]
    assert "non mesuré" in second["probability_label"].lower()
    assert result["revenue"]["totals"][0]["expected_eur"] == "71 429 €"
    assert "rétro-test" in result["calibration_label"]
    assert "0,20" in result["calibration_label"] and "0,22" in result["calibration_label"]


@pytest.mark.asyncio
async def test_unmeasured_calibration_is_said_not_zero(monkeypatch: pytest.MonkeyPatch) -> None:
    payload = _payload()
    payload["calibration"] = {
        "method": "leave_one_out_v1",
        "evaluated": 2,
        "brier": None,
        "baseline_brier": None,
        "bins": [],
        "not_measured_reason": "insufficient_history",
    }

    async def _probable(_user_id: str) -> dict:
        return payload

    monkeypatch.setattr(bellum_api, "probable_quarter", _probable, raising=False)
    result = await _run()
    assert "non mesuré" in result["calibration_label"].lower()


@pytest.mark.asyncio
async def test_forbidden_is_a_permission_denied_never_zero(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _probable(_user_id: str) -> dict:
        return {"error": "finance_forbidden"}

    monkeypatch.setattr(bellum_api, "probable_quarter", _probable, raising=False)
    result = await _run()
    assert "error" in result
    assert result.get("status") == "permission_denied"
    assert "deals" not in result


@pytest.mark.asyncio
async def test_bridge_down_is_an_error_not_an_empty_quarter(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _probable(_user_id: str) -> None:
        return None

    monkeypatch.setattr(bellum_api, "probable_quarter", _probable, raising=False)
    result = await _run()
    assert "error" in result
    assert "deals" not in result


@pytest.mark.asyncio
async def test_a_long_deal_list_is_capped_and_says_so(monkeypatch: pytest.MonkeyPatch) -> None:
    payload = _payload()
    payload["deals"] = [_deal(f"o-{i}", 0.5) for i in range(30)]

    async def _probable(_user_id: str) -> dict:
        return payload

    monkeypatch.setattr(bellum_api, "probable_quarter", _probable, raising=False)
    result = await _run()
    assert len(result["deals"]) == 20
    assert result["deals_total"] == 30
    assert result["truncated"] is True
