"""Brief commercial : réparation déterministe des énumérations avant validation.

Prouvé en prod (journaux IA 15/10/2026 19:54-20:02) : 100 % des briefs rejetés
en 502 ``commercial_brief_off_contract`` — ``sites.N.kind`` et ``people.N.role``
hors énumération, une fois « (racine) » — après 2-5 min d'appel modèle payé.
"""

from __future__ import annotations

import json
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from app.prompts.bellum_commercial_brief import build_system_prompt
from app.routers.commercial_brief import repair_brief
from tests.test_commercial_brief import _brief, _payload

_PATCH = "app.routers.commercial_brief.call_claude"
_USAGE = SimpleNamespace(input_tokens=1, output_tokens=1, cost_usd=0.1)


def _site(kind: str) -> dict:
    return {"name": "S", "city": "Paris", "country": "FR", "kind": kind}


def test_site_kinds_close_to_the_enum_are_normalised() -> None:
    brief = {
        "sites": [_site("Headquarters"), _site("Siège social"), _site("SECONDARY"), _site("Usine"), _site("industriel")]
    }
    repair_brief(brief)
    assert [s["kind"] for s in brief["sites"]] == [
        "headquarters",
        "headquarters",
        "secondary",
        "industrial",
        "industrial",
    ]


def test_unmappable_site_kind_falls_to_the_schema_neutral_other() -> None:
    brief = {"sites": [_site("data center galactique")]}
    report = repair_brief(brief)
    assert brief["sites"][0]["kind"] == "other"
    # Les clés obligatoires omises sont aussi complétées « (omise) » (brief-fix 16/10) : on ne garde que la réparation d'enum.
    assert [path for path in report.repaired if not path.endswith("(omise)")] == ["sites.0.kind"]


def test_person_roles_are_normalised_and_unmappable_role_is_dropped_not_invented() -> None:
    brief = {
        "people": [
            {"name": "A", "role": "Decision Maker"},
            {"name": "B", "role": "Décideur"},
            {"name": "C", "role": "chief vibes"},
        ]
    }
    report = repair_brief(brief)
    assert [p.get("role") for p in brief["people"]] == ["decision_maker", "decision_maker", None]
    assert len(brief["people"]) == 3
    assert "people.2.role" in report.repaired


def test_extra_root_properties_are_removed_and_reported_by_path_only() -> None:
    brief = {"mystery": {"secret": "valeur-du-client"}, "sites": []}
    report = repair_brief(brief)
    assert "mystery" not in brief
    assert report.removed == ["mystery"]
    assert "valeur-du-client" not in repr(report)


def test_extra_properties_inside_site_and_person_are_removed() -> None:
    brief = {"sites": [{**_site("other"), "latitude": 1}], "people": [{"name": "A", "age": 40}]}
    repair_brief(brief)
    assert "latitude" not in brief["sites"][0]
    assert "age" not in brief["people"][0]


def test_endpoint_returns_200_with_off_enum_values_and_logs_paths_only(
    client: TestClient, monkeypatch: pytest.MonkeyPatch, caplog: pytest.LogCaptureFixture
) -> None:
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-test")
    brief = _brief()
    brief["sites"] = [_site("Siège"), _site("warehouse-xyz")]
    brief["people"] = [{"name": "A", "role": "Manager"}, {"name": "B", "role": "wizard-zzz"}]
    brief["unknown_root_key"] = 1
    with caplog.at_level("INFO"), patch(_PATCH, new_callable=AsyncMock, return_value=(json.dumps(brief), _USAGE)):
        res = client.post("/commercial-brief", json=_payload())
    assert res.status_code == 200, res.text
    out = res.json()["data"]["brief"]
    assert [s["kind"] for s in out["sites"]] == ["headquarters", "other"]
    assert out["people"][0]["role"] == "manager" and "role" not in out["people"][1]
    assert "unknown_root_key" not in out
    logged = " ".join(r.getMessage() for r in caplog.records)
    assert "wizard-zzz" not in logged and "warehouse-xyz" not in logged
    assert "sites.1.kind" in logged


def test_missing_required_field_still_fails_502(client: TestClient, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-test")
    brief = _brief()
    del brief["guardrails"]
    with patch(_PATCH, new_callable=AsyncMock, return_value=(json.dumps(brief), _USAGE)):
        res = client.post("/commercial-brief", json=_payload())
    assert res.status_code == 502
    assert res.json()["detail"] == "commercial_brief_off_contract"


def test_system_prompt_lists_the_allowed_kind_and_role_values() -> None:
    prompt = build_system_prompt()
    for value in (
        "headquarters",
        "secondary",
        "industrial",
        "other",
        "decision_maker",
        "manager",
        "contact",
        "external",
        "alumni",
    ):
        assert f'"{value}"' in prompt
