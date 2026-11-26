"""Logique Axians : détecter que l'ESN appartient au groupe cible → complément,
jamais frontal (Théo point #4)."""

from __future__ import annotations

from app.services.group_relationship import detect_insider, insider_directive


def _vinci() -> dict:
    return {
        "company_name": "VINCI",
        "meaningfulSubsidiaries": [{"name": "VINCI Energies"}, {"name": "Axians Communication"}, {"name": "VINCI Construction"}],
    }


def test_insider_detected_when_esn_is_a_group_entity():
    insider = detect_insider({"companyName": "Axians"}, _vinci())
    assert insider is not None
    assert insider["isInsider"] is True
    assert insider["group"] == "VINCI"
    assert insider["matchedEntity"] == "Axians Communication"


def test_match_is_accent_and_case_blind_whole_word():
    insider = detect_insider({"companyName": "axians"}, {"subsidiaries": [{"name": "AXIANS Énergies"}]})
    assert insider is not None and insider["isInsider"] is True


def test_unrelated_esn_is_not_insider():
    assert detect_insider({"companyName": "Ippon Technologies"}, _vinci()) is None


def test_short_or_empty_esn_name_is_ignored():
    assert detect_insider({"companyName": "SG"}, _vinci()) is None
    assert detect_insider({}, _vinci()) is None


def test_self_analysis_is_not_insider():
    # ESN name == target group name → not an insider-ESN relationship.
    assert detect_insider({"companyName": "VINCI"}, _vinci()) is None


def test_no_false_positive_on_substring():
    # "Axi" must not match "Axians" as a whole word (guards acronym collisions).
    assert detect_insider({"companyName": "Axi"}, _vinci()) is None


def test_directive_names_complement_logic():
    d = insider_directive(detect_insider({"companyName": "Axians"}, _vinci()))
    assert "COMPLÉMENT" in d
    assert "Axians" in d and "VINCI" in d
    assert "frontal" in d.lower()


def test_directive_empty_when_not_insider():
    assert insider_directive(None) == ""
    assert insider_directive({"isInsider": False}) == ""


def test_generic_word_esn_name_needs_an_exact_match():
    # Review fix: a common one-word ESN name ("Data","Sud") must NOT whole-word
    # match an unrelated group entity → no false insider / bogus "complément".
    target = {"company_name": "VINCI", "meaningfulSubsidiaries": [{"name": "VINCI Sud"}, {"name": "Data Center Services"}]}
    assert detect_insider({"companyName": "Sud"}, target) is None
    assert detect_insider({"companyName": "Data"}, target) is None
    # But an EXACT entity match still counts, even for a generic word.
    exact = {"company_name": "VINCI", "meaningfulSubsidiaries": [{"name": "Data"}]}
    assert detect_insider({"companyName": "Data"}, exact) is not None
    # A distinctive name still matches whole-word inside an entity.
    assert detect_insider({"companyName": "Axians"}, {"subsidiaries": [{"name": "Axians Sud"}]}) is not None
