"""Decider psychology on contacts (#Drive/ORION) — careerLevers + implicitFears.

Prompt asks for them, the model carries them (alias round-trip). Semantic quality
is left to a live run / judge — these are LLM-generated, not deterministic."""

from __future__ import annotations

from app.models.outputs.contacts import EnrichedContact
from app.prompts.bellum_contacts import build_user_prompt


def test_prompt_requests_career_levers_and_fears():
    prompt = build_user_prompt("Société Générale", "", "", "", "")
    assert "careerLevers" in prompt
    assert "implicitFears" in prompt


def test_model_round_trips_psychology_fields():
    c = EnrichedContact.model_validate(
        {"fullName": "Jean Dupont", "careerLevers": ["visible au COMEX sur l'IA"],
         "implicitFears": ["incident sécurité médiatisé", "audit DORA"]},
    )
    assert c.career_levers == ["visible au COMEX sur l'IA"]
    assert c.implicit_fears == ["incident sécurité médiatisé", "audit DORA"]
    dumped = c.model_dump(by_alias=True)
    assert dumped["careerLevers"] == ["visible au COMEX sur l'IA"]
    assert dumped["implicitFears"] == ["incident sécurité médiatisé", "audit DORA"]


def test_psychology_defaults_empty():
    c = EnrichedContact(fullName="Jane Doe")
    assert c.career_levers == []
    assert c.implicit_fears == []
