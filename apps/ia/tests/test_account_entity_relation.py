"""#219.6 (épopée #3231, reste du 30/09) — CLIENT INTERNE : une filiale
DÉCLARÉE se reconnaît, jamais une ressemblance de texte devinée."""

from __future__ import annotations

from app.services.account_entity_relation import classify_entity_relation_to_account


def test_a_declared_subsidiary_is_classified_filiale() -> None:
    assert classify_entity_relation_to_account("SNCF Solutions", ["SNCF Solutions", "SNCF Voyageurs"]) == "filiale"


def test_matching_is_normalized_case_and_accents_insensitive() -> None:
    assert classify_entity_relation_to_account("sncf   solutions", ["SNCF Solutions"]) == "filiale"


def test_an_entity_not_in_the_declared_list_is_never_guessed_as_a_subsidiary() -> None:
    assert classify_entity_relation_to_account("Décathlon", ["SNCF Solutions"]) is None


def test_no_declared_subsidiaries_never_classifies_anything() -> None:
    assert classify_entity_relation_to_account("SNCF Solutions", []) is None
    assert classify_entity_relation_to_account("SNCF Solutions", None) is None


def test_a_blank_name_is_never_classified() -> None:
    assert classify_entity_relation_to_account("", ["SNCF Solutions"]) is None
    assert classify_entity_relation_to_account(None, ["SNCF Solutions"]) is None
