"""#2450.5 / #2450.6 / #2448.7 / #2448.16 (épopée #2882) — `research_mode_block`
donne à chaque mode explicite une CONSIGNE réellement différente, au-delà du
seul palier de modèle : avant ce fichier, `verifie` et `approfondi` forçaient
le même palier et rien d'autre, ce que le NO-GO de #2448 interdit
explicitement.
"""

from __future__ import annotations

import pytest

from app.prompts.research_mode import RESEARCH_MODE_BLOCKS, research_mode_block


def test_sans_mode_ou_auto_le_bloc_est_vide():
    # Chemin BYTE-IDENTIQUE à avant ce fichier tant que rien n'est choisi.
    assert research_mode_block(None) == ""
    assert research_mode_block("auto") == ""


def test_un_mode_inconnu_ne_casse_rien():
    assert research_mode_block("ce-mode-nexiste-pas") == ""


@pytest.mark.parametrize("mode", ["rapide", "verifie", "approfondi"])
def test_chaque_mode_explicite_a_un_bloc_non_vide(mode):
    block = research_mode_block(mode)
    assert block.strip()
    assert block.startswith("\n\n")


def test_les_trois_blocs_sont_reellement_differents():
    # Le NO-GO de #2448 : les modes ne se distinguent pas QUE par leur nom.
    blocks = [RESEARCH_MODE_BLOCKS[m] for m in ("rapide", "verifie", "approfondi")]
    assert len(set(blocks)) == 3


def test_verifie_demande_source_et_date():
    block = research_mode_block("verifie")
    assert "source" in block.lower()
    assert "date" in block.lower()


def test_approfondi_demande_de_signaler_les_contradictions():
    block = research_mode_block("approfondi")
    assert "contredis" in block.lower()


def test_rapide_distingue_connu_et_non_verifie():
    block = research_mode_block("rapide")
    assert "DÉJÀ CONNU" in block
    assert "N'EST PAS VÉRIFIÉ AUJOURD'HUI" in block


def test_aucun_nom_de_fournisseur_ni_de_modele():
    # Doctrine : nos fournisseurs ne se nomment jamais, y compris dans une
    # consigne interne au modèle.
    banned = ("anthropic", "claude", "openai", "gpt", "haiku", "opus", "sonnet", "brave")
    for block in RESEARCH_MODE_BLOCKS.values():
        lowered = block.lower()
        for word in banned:
            assert word not in lowered, (word, block)
