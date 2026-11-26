"""Le retournement NAF (tome 4 §20.1, ticket BEL-DATA-003)."""

from __future__ import annotations

import pytest

from app.services.esn_naf import (
    ESN_NAF_PREFIXES,
    entity_type_flags,
    is_ambiguous_naf,
    is_esn_naf_code,
    matches_entity_type,
)


def test_the_prefixes_live_in_one_place() -> None:
    """Le ticket l'exige : « NE PAS coder la liste en dur dans chaque source »."""
    assert ESN_NAF_PREFIXES == ("620", "7022")


@pytest.mark.parametrize("code", ["6202A", "62.02A", "6201Z", "7022Z"])
def test_an_esn_code_reads_as_an_esn(code: str) -> None:
    assert is_esn_naf_code(code) is True


@pytest.mark.parametrize("code", ["4711D", "2313Z", "6820A"])
def test_a_non_esn_code_reads_as_a_client(code: str) -> None:
    assert is_esn_naf_code(code) is False


@pytest.mark.parametrize("code", [None, "", "  ", "Z"])
def test_an_absent_code_is_never_a_verdict(code: object) -> None:
    """« Je ne sais pas » n'est pas « ce n'est pas une ESN »."""
    assert is_esn_naf_code(code) is None


def test_client_plus_esn_covers_all_minus_the_ambiguous_counted_twice() -> None:
    """Le test que le ticket demande, sur un jeu réaliste.

    Il ne peut pas y avoir de trou : une entreprise que ni `client` ni `esn` ne
    garderait disparaîtrait des deux marchés sans que personne ne le voie.
    """
    codes = ["6202A", "4711D", "7022Z", "2313Z", None, "6209Z"]
    clients = [c for c in codes if matches_entity_type(c, "client")]
    esns = [c for c in codes if matches_entity_type(c, "esn")]
    every = [c for c in codes if matches_entity_type(c, "all")]
    doubled = [c for c in codes if is_ambiguous_naf(c) or is_esn_naf_code(c) is None]
    assert len(clients) + len(esns) == len(every) + len(doubled)


def test_an_ambiguous_code_appears_on_both_sides_and_says_so() -> None:
    """70.22Z couvre autant d'ESN que de cabinets qui n'en sont pas. L'écarter
    d'un côté perdrait des cibles ; le ranger d'un seul en inventerait."""
    assert matches_entity_type("7022Z", "esn") is True
    assert matches_entity_type("7022Z", "client") is True
    assert entity_type_flags("7022Z") == {"isEsn": True, "nafAmbiguous": True}


def test_an_unresolved_employer_is_never_silently_dropped() -> None:
    """Un NAF inconnu vient presque toujours d'un employeur qu'on n'a pas su
    résoudre. L'écarter serait perdre une cible pour une raison technique."""
    assert matches_entity_type(None, "client") is True
    assert matches_entity_type(None, "esn") is True
    assert entity_type_flags(None) == {"isEsn": None, "nafAmbiguous": False}
