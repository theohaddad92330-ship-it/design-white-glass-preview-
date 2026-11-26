"""#4977 — Préparer l'appel : le script part de l'OFFRE d'emploi déclencheuse.

- Canal « phone » + un fait coché qui est une offre : l'ouverture doit citer cette offre (poste, ville), angle prestation.
- Canal « phone » sans offre cochée : le prompt dit que le script reste général — il n'invente aucune offre.
- Autres canaux : le bloc d'avant (#4524.2), à l'octet près.
"""

from __future__ import annotations

from app.services.message_grounding import MessageGrounding, apply_grounding

_OFFER = {
    "kind": "account_signal",
    "label": "Expert OpenShift à Toulouse",
    "proof": "2026-10-20",
    "topic": "job_offer",
}
_OTHER = {"kind": "account_signal", "label": "Cession de la filiale", "proof": None}


def _block(facts: list[dict], channel: str | None) -> str:
    grounding = MessageGrounding(mode="facts", facts=facts)
    return apply_grounding({}, [], grounding, channel=channel)[2]


def test_phone_with_checked_offer_asks_to_cite_it_in_the_opening() -> None:
    block = _block([_OFFER, _OTHER], "phone")
    assert "OFFRE D'EMPLOI" in block
    assert "Expert OpenShift à Toulouse" in block
    assert "ouverture" in block.lower()
    assert "poste" in block and "ville" in block
    assert "prestation" in block


def test_phone_without_offer_says_script_stays_general() -> None:
    block = _block([_OTHER], "phone")
    assert "aucune offre" in block.lower()
    assert "général" in block


def test_phone_free_angle_says_script_stays_general() -> None:
    block = apply_grounding({}, [], MessageGrounding(mode="free_angle"), channel="phone")[2]
    assert "aucune offre" in block.lower()


def test_other_channels_unchanged() -> None:
    assert _block([_OFFER], "email") == _block([_OFFER], None)
    assert "OFFRE D'EMPLOI" not in _block([_OFFER], "email")
    assert "aucune offre" not in _block([_OTHER], "linkedin").lower()


def test_offer_topic_is_rejected_on_unknown_values() -> None:
    import pytest

    with pytest.raises(ValueError):
        MessageGrounding(mode="facts", facts=[{**_OFFER, "topic": "autre"}])


def test_phone_opening_STARTS_from_the_offer_with_post_city_and_date() -> None:
    """#4977.1 — la consigne dit de PARTIR de l'offre (première phrase), pas seulement de la citer ; rien d'inventé."""
    block = _block([_OFFER], "phone")
    assert "PART de cette offre" in block
    assert "première phrase" in block
    assert "2026-10-20" in block  # la date voyage comme preuve
    assert "persona" in block.lower() or "niveau de langage" in block.lower()
    assert "n'invente" in block.lower()
