"""#5012 / #5013 / #5008 — ce que Laura DIT d'une liste de comptes : le signal cité, jamais « sans service
achats » deviné ; la classe d'accès avec sa raison ; le siège et les implantations de la zone."""

from __future__ import annotations

from app.prompts.bellum_advisor import build_system_prompt


def _prompt() -> str:
    return build_system_prompt({}, {}, "", "")


def test_le_bloc_signal_achat_prestation_est_dans_le_prompt() -> None:
    prompt = _prompt()
    assert "QUI PREND DES CONSULTANTS" in prompt
    assert "je n'ai pas de signal établi" in prompt


def test_le_bloc_interdit_de_deduire_sans_service_achats() -> None:
    prompt = _prompt()
    assert "sans service achats" in prompt
    assert "jamais déduit" in prompt


def test_le_bloc_dit_la_classe_et_la_zone() -> None:
    prompt = _prompt()
    assert "`access_class`" in prompt and "`access_reason`" in prompt
    assert "`location`" in prompt


def test_le_bloc_n_apparait_qu_une_fois() -> None:
    assert _prompt().count("QUI PREND DES CONSULTANTS") == 1
