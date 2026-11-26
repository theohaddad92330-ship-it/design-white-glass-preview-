"""#3384.2 — Laura voit la capacité de delivery, comme le plan d'action.

`bellum_plan` recevait déjà « Consultants en mission » et « Vivier actif » ; le
chat n'en rendait que la marge et la capacité de démarrage. Un seul contexte
(#3384.1) : mêmes déclarations, mêmes libellés de valeurs, jamais inventées.
"""

from __future__ import annotations

from app.prompts.bellum_advisor import build_system_prompt


def _prompt(profile: dict) -> str:
    return build_system_prompt(profile, {}, "", "")


def test_declared_delivery_capacity_reaches_laura() -> None:
    out = _prompt(
        {
            "consultantsOnMission": "42 consultants",
            "consultantsInPipe": "15 profils",
            "availableConsultantsBand": "quelques-uns",
        }
    )
    assert "Consultants en mission : 42 consultants" in out
    assert "Vivier actif : 15 profils" in out
    assert "Intercontrat déclaré : quelques-uns" in out


def test_undeclared_delivery_capacity_is_absent_not_zero() -> None:
    out = _prompt({"targetMargin": "18 %"})
    assert "Consultants en mission" not in out
    assert "Vivier actif" not in out
    assert "Intercontrat déclaré" not in out
    assert "Marge cible : 18 %" in out


def test_laura_is_told_to_name_the_declared_capacity_by_label() -> None:
    """#3384 (recette prod 02/10) — Laura citait les chiffres (« 11 consultants dispo,
    intercontrat 55 % ») sans dire d'où ils viennent : ni « consultants en mission »
    ni « vivier actif » n'étaient nommés. La consigne vit AVEC les lignes déclarées."""
    out = _prompt({"consultantsOnMission": "42 consultants", "consultantsInPipe": "15 profils"})
    assert "consultants en mission" in out.split("CADRE ÉCONOMIQUE")[1].lower()
    assert "NOMME" in out.split("CADRE ÉCONOMIQUE")[1]
    assert "déclaré" in out.split("CADRE ÉCONOMIQUE")[1].lower()


def test_no_capacity_instruction_without_a_declared_capacity() -> None:
    """NON : sans déclaration de capacité, la consigne n'apparaît pas (prompt inchangé)."""
    out = _prompt({"targetMargin": "18 %"})
    assert "NOMME" not in out.split("CADRE ÉCONOMIQUE")[1].split("\n\n")[0]
