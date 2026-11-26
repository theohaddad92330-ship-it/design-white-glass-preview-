"""Intelligence concurrentielle ESN + awareness réglementaire (Drive #11 + #14).

Two curated, deterministic knowledge datasets injected ADDITIVELY into the plan
prompt: (1) positioning angles vs the big ESN competitors, sector-matched, and
(2) a sector → regulation map used as a compliance / buy-signal angle. No LLM
call — pure data + string assembly, so these tests fully cover the behaviour.
"""

from __future__ import annotations

from app.knowledge import (
    esn_positioning_block,
    knowledge_assets_summary,
    regulatory_awareness_block,
)

# The seven big ESN competitors the feature must cover (Drive #11).
_BIG_ESN = [
    "Capgemini",
    "Sopra Steria",
    "Atos",
    "Alten",
    "Devoteam",
    "CGI",
    "Accenture",
]


def test_all_big_esn_competitors_are_covered():
    # General pack (no sector) must expose every named big ESN somewhere.
    summary = knowledge_assets_summary()
    names = " ".join(summary["esn_competitor_positioning"]["names"])
    for esn in _BIG_ESN:
        assert esn in names, f"{esn} missing from the positioning dataset"


def test_positioning_block_matches_sector_and_has_entry_angle():
    block = esn_positioning_block("Banque de financement et d'investissement")
    assert "POSITIONNEMENT" in block
    # Big ESNs strong in banking must surface.
    assert "Capgemini" in block
    assert "Sopra Steria" in block
    # Crisp entry angle in the requested "… on entre par …" format.
    assert "on entre" in block.lower()
    # Compact ground block, not a dump.
    assert len(block) < 3500


def test_positioning_block_general_pack_when_sector_unknown():
    block = esn_positioning_block("Cabinet d'avocats")
    assert block != ""
    assert "POSITIONNEMENT" in block
    # Falls back to the general pack -> at least one big ESN present.
    assert any(esn in block for esn in _BIG_ESN)


def test_positioning_block_prioritises_detected_incumbent():
    # A detected incumbent must appear even outside its strongest sector.
    block = esn_positioning_block("Cabinet d'avocats", ["Atos"])
    assert "Atos" in block


def test_positioning_block_empty_inputs_still_general_pack():
    assert esn_positioning_block(None) != ""
    assert esn_positioning_block("") != ""


def test_regulatory_block_banque_has_dora():
    block = regulatory_awareness_block("Banque de détail")
    assert "VEILLE RÉGLEMENTAIRE" in block
    assert "DORA" in block
    # Cross-sector NIS2 is always injected as a buy-signal.
    assert "NIS2" in block
    # Sales angle present.
    assert "Angle" in block or "signal" in block.lower()


def test_regulatory_block_sante_has_hds():
    block = regulatory_awareness_block("Santé / hôpital")
    assert "HDS" in block


def test_regulatory_block_cross_sector_when_sector_unknown():
    # Unknown sector still surfaces the cross-sector regs (NIS2 / RGPD).
    block = regulatory_awareness_block("Cabinet d'avocats")
    assert "NIS2" in block


def test_knowledge_summary_includes_new_datasets():
    summary = knowledge_assets_summary()
    assert summary["esn_competitor_positioning"]["count"] >= 7
    assert summary["sector_regulations"]["count"] >= 3
