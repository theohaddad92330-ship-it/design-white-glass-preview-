"""Curated ESN knowledge (harvested from the old data/ RAG seed) — sector
playbooks + competitor battlecards injected into the plan prompt."""

from __future__ import annotations

from app.knowledge import (
    competitor_intel_block,
    match_sector,
    objection_library,
    sector_playbook_block,
)


def test_all_nine_sectors_load_and_match():
    for key, raw in [
        ("banque", "Banque de détail et financement"),
        ("assurance", "Assurance vie et prévoyance"),
        ("sante", "Santé / pharmaceutique"),
        ("energie", "Énergie et utilities"),
        ("telecom", "Opérateur télécom"),
        ("transport", "Transport ferroviaire et logistique"),
        ("industrie", "Industrie automobile"),
        ("retail", "Grande distribution / retail"),
        ("public", "Secteur public / administration"),
    ]:
        assert match_sector(raw) == key


def test_matches_raw_insee_naf_labels_and_descriptions():
    # The pipeline emits INSEE/NAF labels, not clean sector names — must still match.
    assert match_sector("Autres intermédiations monétaires") == "banque"  # SG, Crédit Mutuel
    assert match_sector("Crédit-bail") == "banque"
    # And when the NAF label is a useless holding code, the businessDescription saves it.
    assert match_sector("Activités des sièges sociaux — Société Générale est une banque de détail") == "banque"


def test_unknown_sector_returns_none_and_empty_block():
    assert match_sector("Cabinet d'avocats") is None
    assert match_sector("") is None
    assert match_sector(None) is None
    assert sector_playbook_block("Cabinet d'avocats") == ""


def test_sector_block_is_compact_and_grounded():
    block = sector_playbook_block("Banque de financement et d'investissement")
    assert "PLAYBOOK SECTEUR — BANQUE" in block
    assert "Chaîne de décision" in block
    # DORA is a real banking regulation from the curated intel.
    assert "DORA" in block
    # Compact: a ground block, not a dump.
    assert len(block) < 2500


def test_competitor_block_matches_known_incumbent():
    block = competitor_intel_block(["Capgemini", "UnknownESN SARL"])
    assert "Capgemini" in block
    assert "se différencier" in block
    assert "UnknownESN" not in block


def test_competitor_block_empty_when_no_known_match():
    assert competitor_intel_block(["Random Local ESN"]) == ""
    assert competitor_intel_block([]) == ""
    assert competitor_intel_block(None) == ""


def test_objection_library_loads():
    objs = objection_library()
    # 20 objections de prospection CLIENT + 13 de prospection inversée, côté
    # CONSULTANT (item 33 du Recovery Pack). Le compte est asserté pour que la
    # garde tombe si quelqu'un vide le fichier, pas pour figer un chiffre.
    assert len(objs) == 33
    assert sum(1 for o in objs if o.get("side") == "consultant") == 13
    assert {"objection", "response"} <= set(objs[0])
