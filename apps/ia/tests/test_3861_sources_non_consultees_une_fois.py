"""#3861 — réponse « Approfondi » : le corps répétait en prose la liste des sources non
consultées déjà nommées dans le badge. Une seule fois : le badge. Le bloc des sources
non disponibles dit donc au modèle de ne pas les énumérer ; sans source, aucun bloc."""

from __future__ import annotations

from app.prompts.bellum_advisor import _format_not_consulted


def test_not_consulted_block_tells_the_model_not_to_list_them_in_the_body() -> None:
    block = _format_not_consulted(["HubSpot", "LinkedIn"])
    assert "- HubSpot" in block and "- LinkedIn" in block
    assert "ne les ÉNUMÈRE PAS" in block
    assert "badge" in block


def test_block_forbids_copying_its_own_heading_as_an_intertitle() -> None:
    # #3861 (recette MZ 10/10) — le modèle recopiait un intertitre « SOURCES QUI N'ONT PAS ÉTÉ
    # CONSULTÉES… : » dans la prose, orphelin (le badge porte déjà les noms).
    block = _format_not_consulted(["HubSpot"])
    assert "intertitre" in block
    assert "SOURCES NON DISPONIBLES" in block.split("intertitre", 1)[1]


def test_no_unconsulted_source_means_no_block() -> None:
    assert _format_not_consulted([]) == ""
    assert _format_not_consulted(None) == ""
