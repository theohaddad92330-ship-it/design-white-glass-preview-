"""#4995.1 — le prompt de stratégie n'impose plus un pilote « livrable en 6 semaines » à chaque play,
et vise le rôle le plus proche de l'offre ; le C-level (CDO) reste un relais VISIBLE (#4923.14)."""

from __future__ import annotations

from app.prompts import bellum_strategy
from tests.test_prompts_new import SAMPLE_PROFILE


def _strategy() -> str:
    return bellum_strategy.build_system_prompt(SAMPLE_PROFILE)


def test_le_pilote_en_six_semaines_nest_plus_impose() -> None:
    assert "livrable en 6 semaines" not in _strategy()


def test_le_message_vise_le_role_le_plus_proche_de_loffre() -> None:
    text = _strategy().lower()
    assert "role le plus proche de l'offre" in text


def test_le_c_level_reste_visible_comme_relais_sans_etre_la_cible_du_pilote() -> None:
    text = _strategy()
    assert "STRATEGIE SANDWICH" in text
    assert "relais" in text.lower()
    assert "CDO" in text
