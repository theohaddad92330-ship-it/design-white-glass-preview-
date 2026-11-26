"""Angle persona/offer/deal-size : la sortie stratégie émet du camelCase, mais le
modèle Angle n'avait pas d'alias → persona/offre/deal-size silencieusement perdus.
Capturé en entrée (camelCase), sérialisé en snake_case (contrat wire + web)."""

from __future__ import annotations

from app.models.outputs.research import Angle, ResearchOutput, ResearchStrategy


def test_angle_captures_camelcase_input_serialises_snake_case():
    a = Angle.model_validate(
        {"title": "Usine DevOps", "entryContactPersona": "Directeur Études", "specificOffer": "Audit SI", "estimatedDealSize": "150K"},
    )
    assert a.entry_contact_persona == "Directeur Études"
    assert a.specific_offer == "Audit SI"
    assert a.estimated_deal_size == "150K"
    dumped = a.model_dump(by_alias=True)
    # snake_case wire shape (matches attackAngleSchema + the web reader).
    assert dumped["entry_contact_persona"] == "Directeur Études"
    assert dumped["specific_offer"] == "Audit SI"
    assert "entryContactPersona" not in dumped


def test_snake_case_input_still_accepted():
    a = Angle.model_validate({"title": "X", "entry_contact_persona": "DSI"})
    assert a.entry_contact_persona == "DSI"


def test_persona_survives_end_to_end_through_research_output():
    merged = ResearchStrategy.model_validate(
        {"angles": [{"title": "A", "entryContactPersona": "DSI BU Logistique"}]},
    ).model_dump(by_alias=True)
    out = ResearchOutput(**merged).model_dump(by_alias=True)
    assert out["angles"][0]["entry_contact_persona"] == "DSI BU Logistique"
