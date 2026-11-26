"""GD-08 — chaque source déclare ce qu'elle fait en panne (tome 2 §23, §27)."""

from __future__ import annotations

import pathlib

from app.services.source_registry import SOURCE_REGISTRY, SourceDeclaration

DATA_SOURCES = pathlib.Path(__file__).resolve().parents[1] / "app" / "services" / "data_sources"


def _modules() -> set[str]:
    return {p.stem for p in DATA_SOURCES.glob("*.py") if p.stem != "__init__"}


def test_every_source_module_declares_its_failure_behaviour() -> None:
    """Une source ajoutée sans entrée ici fait échouer la CI, avec la bonne
    question : « que voit l'utilisateur quand elle ne répond pas ? »"""
    missing = sorted(_modules() - set(SOURCE_REGISTRY))
    assert missing == [], f"sources sans comportement de panne déclaré : {missing}"


def test_the_registry_never_describes_a_module_that_no_longer_exists() -> None:
    """Un registre qui décrit un module supprimé se lit comme une source vivante."""
    ghosts = sorted(set(SOURCE_REGISTRY) - _modules())
    assert ghosts == [], f"déclarées mais disparues : {ghosts}"


def test_what_is_lost_is_written_in_plain_french_never_left_empty() -> None:
    for name, declaration in SOURCE_REGISTRY.items():
        assert isinstance(declaration, SourceDeclaration)
        assert declaration.loses.strip(), name
        # « Erreur » ou « KO » ne dit rien à celui qui lit l'écran.
        assert len(declaration.loses) > 15, name


def test_the_structuring_sources_are_the_ones_that_raise() -> None:
    """Une source d'APPOINT rend `[]` ; une source qui porte l'écran lève, pour
    que Découvrir dise « la source n'a pas répondu » au lieu d'afficher une
    liste courte qui se lirait « il ne se passe rien dans ce département »."""
    raising = {name for name, d in SOURCE_REGISTRY.items() if d.behaviour == "raises_unavailable"}
    # #3941.5 — `bodacc_capital` porte SEULE la famille « capital » du mode Signaux : sa panne se dit, elle lève.
    # #4732.1 — `bodacc_takeover` porte SEULE la famille « rachat ou fusion » : même règle, elle lève.
    assert raising == {"france_travail", "public_tenders", "decp", "bodacc_capital", "bodacc_takeover"}
