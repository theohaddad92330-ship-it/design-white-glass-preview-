"""#4732 (arbitré Louis 29/10/2026) — un rachat / une fusion est un FAIT FORT sur la carte Découvrir,
comme sur la fiche compte (`dated_signals` : acte légal qui nomme fusion/absorption/rachat/cession → `acquisition`).
Ce que la grille ne fait PAS : une modification administrative, un dépôt de comptes, une procédure collective."""

from __future__ import annotations

import pytest

from app.services.discover_signal_grid import CONTEXT, STRONG, arrange_signals, decide_signal


def sig(type_: str, label: str, date: str = "2026-10-01", **extra) -> dict:
    return {"type": type_, "label": label, "date": date, **extra}


@pytest.mark.parametrize(
    "label",
    [
        "Vente et cession — cession de fonds de commerce",
        "Modification — fusion absorption de la société Atelier Rail Services",
        "Modification — scission de la société",
        "Modification — apport partiel d'actif",
        "Cession de fonds de commerce — rachat de la société Atelier Rail Services (exemple)",
    ],
)
def test_legal_act_naming_a_takeover_is_strong(label: str) -> None:
    decision = decide_signal(sig("legal", label))
    assert decision.keep is True
    assert decision.tier == STRONG


@pytest.mark.parametrize(
    "label",
    [
        "Modification — changement de siège social",
        "Modification diverses",
        "Procédure collective — redressement judiciaire — risque, pas une opportunité",
        "Création d'établissement",
    ],
)
def test_other_legal_acts_stay_context(label: str) -> None:
    decision = decide_signal(sig("legal", label))
    assert decision.keep is True
    assert decision.tier == CONTEXT


@pytest.mark.parametrize(
    "label",
    ["Le groupe X rachète la société Y", "Acquisition de Y par X", "Fusion de X et de Y"],
)
def test_press_naming_a_takeover_is_strong(label: str) -> None:
    assert decide_signal(sig("business", label)).tier == STRONG


def test_takeover_without_date_is_still_rejected() -> None:
    assert decide_signal({"type": "legal", "label": "Cession de fonds de commerce"}).keep is False


def test_takeover_dated_by_detection_stays_context() -> None:
    assert decide_signal(sig("legal", "Cession de fonds", dateIsDetection=True)).tier == CONTEXT


def test_takeover_is_placed_strong_in_the_arrangement() -> None:
    out = arrange_signals([sig("legal", "Vente et cession — cession de fonds de commerce")])
    assert [s["tier"] for s in out] == [STRONG]
