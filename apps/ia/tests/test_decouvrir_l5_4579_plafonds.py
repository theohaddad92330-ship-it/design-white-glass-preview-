"""#4579 / #4519 (lot L5) — les écritures d'annonce complétées (nuxt, spring…) et des budgets de termes SÉPARÉS.

Une expertise remplacée par ses métiers consommait les 6 places à elle seule : la compétence tapée à côté ne
partait plus. Les métiers d'une expertise et les compétences tapées ont maintenant chacun un plafond NOMMÉ."""

from __future__ import annotations

import re
from pathlib import Path

from app.services import discover_skill_offers as skill
from app.services.criteria_referential import expertise_trade_terms, skill_written_forms

EXPERTISE = "Data & Intelligence Artificielle"


def test_vue_part_aussi_sous_nuxt() -> None:
    forms = skill_written_forms("vue")
    assert {"nuxt", "nuxt.js"} <= set(forms)
    assert "vue.js" in forms  # l'existant reste


def test_java_part_aussi_sous_spring() -> None:
    forms = skill_written_forms("java")
    assert {"spring", "spring boot", "jakarta ee"} <= set(forms)
    assert {"java 17", "j2ee", "jee"} <= set(forms)


def test_les_formes_partent_vraiment_aux_sources() -> None:
    _typed, written = skill.searched_forms("vue")
    assert "nuxt" in written
    _typed, written = skill.searched_forms("java")
    assert "spring boot" in written


def test_une_competence_inconnue_reste_telle_quelle() -> None:
    assert skill_written_forms("zorglub") == []


def test_expertise_plus_competence_tapee_garde_les_deux() -> None:
    trades = expertise_trade_terms(EXPERTISE)
    assert trades and len(trades) >= 2
    terms = skill.harvest_terms([EXPERTISE, "Vue"])
    assert "Vue" in terms
    assert len([t for t in terms if t in trades]) >= 2


def test_la_competence_tapee_apres_l_expertise_garde_sa_place_meme_nombreuse() -> None:
    typed = ["Vue", "Java", "Go", "Rust", "PHP"]
    terms = skill.harvest_terms([EXPERTISE, *typed])
    assert all(t in terms for t in typed)
    assert len([t for t in terms if t in (expertise_trade_terms(EXPERTISE) or [])]) >= 2


def test_les_budgets_sont_nommes_et_separes() -> None:
    assert skill.SKILL_MAX_TERMS >= 5
    assert skill.HARVEST_MAX_TYPED_TERMS == skill.SKILL_MAX_TERMS
    assert skill.HARVEST_MAX_TRADE_TERMS >= 4
    assert skill.HARVEST_MAX_TERMS == skill.HARVEST_MAX_TYPED_TERMS + skill.HARVEST_MAX_TRADE_TERMS


def test_les_plafonds_se_declarent_a_un_seul_endroit() -> None:
    """GA-26 : une redéclaration (ou un littéral) des plafonds échoue ; le test sait dire NON sur une copie."""
    app = Path(skill.__file__).resolve().parents[1]
    pattern = re.compile(r"^(SKILL_MAX_TERMS|HARVEST_MAX_TYPED_TERMS|HARVEST_MAX_TRADE_TERMS|HARVEST_MAX_TERMS)\s*=", re.M)
    found = [p.relative_to(app).as_posix() for p in app.rglob("*.py") if pattern.search(p.read_text("utf-8"))]
    assert found == ["services/discover_skill_offers.py"]
    assert len(pattern.findall(Path(skill.__file__).read_text("utf-8"))) == 4
    # la garde lit vraiment : sur une copie fautive elle compte deux déclarations
    assert len(pattern.findall("SKILL_MAX_TERMS = 5\nSKILL_MAX_TERMS = 3\n")) == 2
