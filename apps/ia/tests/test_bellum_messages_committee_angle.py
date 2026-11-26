"""BEL-SC-235 (#3264.22/.24/.27) — l'angle de comité (champion/sponsor/
partenaire) atteint réellement le prompt utilisateur des messages, pour les
contacts que le levier hiérarchique ne couvre pas."""

from __future__ import annotations

from app.prompts import bellum_messages


def _build(contacts: list[dict]) -> str:
    return bellum_messages.build_user_prompt("Acme", "contexte", contacts)


def test_champion_contact_carries_its_message_angle() -> None:
    prompt = _build([{"fullName": "Jean Dupont", "title": "Directeur Général", "hierarchyLevel": "c_level"}])
    assert "champion" in prompt
    assert "apprentissage et capacité d'action" in prompt


def test_partner_contact_carries_its_message_angle() -> None:
    prompt = _build([{"fullName": "Léa Martin", "title": "Alliance Manager", "hierarchyLevel": "management"}])
    assert "partner" in prompt
    assert "valeur mutuelle et règles" in prompt


def test_economic_buyer_contact_carries_the_sponsor_angle() -> None:
    prompt = _build([{"fullName": "Marc Petit", "title": "Directeur Financier", "hierarchyLevel": "direction"}])
    assert "economic_buyer" in prompt
    assert "impact et coût du statu quo" in prompt


def test_operational_contact_has_no_committee_angle_line() -> None:
    # Un profil déjà couvert par le levier hiérarchique (persona `operationnel`)
    # ne reçoit PAS de second angle — une seule consigne par contact.
    prompt = _build([{"fullName": "Ana Silva", "title": "Développeuse", "hierarchyLevel": "operationnel"}])
    assert "· angle " not in prompt
