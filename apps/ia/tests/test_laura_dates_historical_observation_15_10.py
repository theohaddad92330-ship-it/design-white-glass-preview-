"""#4068.7 (R17 15/10) — quand Laura cite une observation historique, elle la date.
La consigne vit dans la description de l'outil qui lui livre ces signaux (la seule chose que le modèle relit)."""

from __future__ import annotations

from app.services.chat_tools import GET_ACCOUNT_SIGNALS_TOOL


def test_la_description_exige_la_date_d_une_observation_ancienne() -> None:
    text = GET_ACCOUNT_SIGNALS_TOOL["description"]
    assert "DATE-LA" in text
    assert "90 jours" in text
    assert "jamais au présent" in text


def test_la_consigne_ne_nomme_aucune_source() -> None:
    text = GET_ACCOUNT_SIGNALS_TOOL["description"].lower()
    for forbidden in ("dataforge", "market memory", "signal_history"):
        assert forbidden not in text
