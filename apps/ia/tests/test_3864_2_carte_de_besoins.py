"""#3864.2 (recette prod 08/10, Q #3899) — « trouve-moi des besoins » citait 16
besoins en TEXTE libre au lieu de la carte `file_export` que `find_needs`
demande déjà, et le cas liste vide n'était jamais distingué d'une carte sans
ligne.

Deux lacunes mesurées sur `origin/main` avant ce lot :
- `need_discovery_block` (déclenché exactement sur cette demande) ne répétait
  jamais la consigne de carte posée par ailleurs dans la description de
  `find_needs` — un seul rappel, facile à perdre dans un tour à plusieurs
  outils.
- `chat_tools.py` ne recopiait jamais `contract_kind` depuis la ligne API,
  alors que CE MÊME bloc dit au modèle de le LIRE (jamais de le deviner) pour
  distinguer un recrutement salarié d'une mission — un champ promis, jamais
  servi.
"""

from __future__ import annotations

import pytest

from app.prompts.intent_route import need_discovery_block


@pytest.mark.parametrize("language", ["fr", "en"])
def test_3864_2_le_bloc_exige_la_carte_jamais_le_texte_libre(language: str) -> None:
    block = need_discovery_block("Trouve-moi des besoins", language)
    assert block
    if language == "fr":
        assert "file_export" in block
        assert "jamais une liste à puces" in block
        assert "jamais une carte vide" in block
    else:
        assert "file_export" in block
        assert "never a bullet list" in block
        assert "never an empty card" in block


@pytest.mark.parametrize("language", ["fr", "en"])
def test_3864_2_le_cas_vide_reste_en_texte_jamais_une_carte_sans_ligne(language: str) -> None:
    block = need_discovery_block("Trouve-moi des besoins", language)
    if language == "fr":
        assert "EN TEXTE" in block
    else:
        assert "IN TEXT" in block
