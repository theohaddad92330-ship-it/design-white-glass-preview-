"""#3235.4 (r40) — « Pourquoi le verdict a changé ? » : un seul run a conservé son verdict → « même verdict depuis ».

Le pont NestJS porte `onlyOneRunCarriesVerdict` ; la consigne de l'outil dit au modèle quoi en faire.
"""

from __future__ import annotations

from app.services.chat_tools import GET_ACCOUNT_BRIEFING_TOOL, _named_verdict_payload


def test_the_tool_tells_the_model_how_to_read_a_single_run_verdict() -> None:
    description = GET_ACCOUNT_BRIEFING_TOOL["description"]
    assert "onlyOneRunCarriesVerdict" in description
    assert "même verdict depuis le" in description


def test_the_flag_and_the_date_travel_through_the_named_payload() -> None:
    payload = {
        "status": "unchanged",
        "previousVerdict": "PRUDENT",
        "newVerdict": "PRUDENT",
        "unchangedSince": "2026-09-11T00:00:00.000Z",
        "onlyOneRunCarriesVerdict": True,
        "causes": [],
    }
    out = _named_verdict_payload(payload, has_objective=True)
    assert out["onlyOneRunCarriesVerdict"] is True
    assert out["unchangedSince"] == "2026-09-11T00:00:00.000Z"
    assert out["newVerdictCode"] == "PRUDENT"
