"""#213.2 (#3207, #3228) — LE CONTRAT DE COMPTAGE, QUINZE CHAMPS.

Voir le docblock de `app/services/count_contract.py` pour le POURQUOI. Ce
fichier vérifie : la construction (les quinze champs, tels quels sur le
fil) ; le refus d'un `object_type`/`current_or_historical` hors taxonomie
(jamais deviné) ; « non mesuré » n'est jamais 0 (`deduplicated_count`/
`resolved_count` restent `None` quand l'appelant ne les fournit pas, jamais
recopiés depuis `raw_count`) ; le verdict de suppression des petits volumes
(#213.6) ; et la garde jumelle avec les UNITÉS #213.3 déjà livrées.
"""

from __future__ import annotations

import pytest

from app.services.chat_turn_plan import _UNIT_WORDS
from app.services.count_contract import (
    CURRENT_OR_HISTORICAL,
    OBJECT_TYPES,
    build_count_contract,
    is_below_suppression_threshold,
)


def _contract(**overrides: object) -> object:
    fields = {
        "metric_name": "parcours_observes",
        "object_type": "parcours",
        "unique_key": "market_memory:thales",
        "scope": "entreprise",
        "entity_scope": "Thales",
        "current_or_historical": "historical",
        "source_layers": ["market_memory"],
        "raw_count": 41,
    }
    fields.update(overrides)
    return build_count_contract(**fields)


# ── Construction : les quinze champs, tels quels ────────────────────────────


def test_the_contract_carries_all_fifteen_fields_on_the_wire() -> None:
    contract = _contract(
        period="2019-2025",
        deduplicated_count=28,
        resolved_count=28,
        confidence=70,
        coverage="partielle",
        suppression_threshold=3,
        caveats=["trace du passé, pas une photographie du présent"],
    )

    wire = contract.to_wire()

    assert set(wire) == {
        "metric_name",
        "object_type",
        "unique_key",
        "scope",
        "entity_scope",
        "period",
        "current_or_historical",
        "source_layers",
        "raw_count",
        "deduplicated_count",
        "resolved_count",
        "confidence",
        "coverage",
        "suppression_threshold",
        "caveats",
    }
    assert wire["raw_count"] == 41
    assert wire["deduplicated_count"] == 28
    assert wire["resolved_count"] == 28
    assert wire["period"] == "2019-2025"
    assert wire["suppression_threshold"] == 3


# ── « Non mesuré » n'est jamais 0 ───────────────────────────────────────────


def test_an_unprovided_deduplicated_count_stays_none_never_copied_from_raw() -> None:
    contract = _contract()

    assert contract.raw_count == 41
    assert contract.deduplicated_count is None
    assert contract.resolved_count is None


# ── Refus d'une taxonomie inconnue, jamais devinée ──────────────────────────


def test_an_object_type_outside_the_taxonomy_is_refused() -> None:
    with pytest.raises(ValueError, match="object_type inconnu"):
        _contract(object_type="consultant")


def test_a_current_or_historical_outside_the_taxonomy_is_refused() -> None:
    with pytest.raises(ValueError, match="current_or_historical inconnu"):
        _contract(current_or_historical="peut-etre")


def test_current_or_historical_only_accepts_the_two_named_states() -> None:
    assert CURRENT_OR_HISTORICAL == ("current", "historical")


# ── #213.6 — petits volumes ─────────────────────────────────────────────────


def test_a_count_under_its_threshold_is_below_suppression() -> None:
    assert is_below_suppression_threshold(2, 3) is True


def test_a_count_at_or_above_its_threshold_is_not_below_suppression() -> None:
    assert is_below_suppression_threshold(3, 3) is False
    assert is_below_suppression_threshold(41, 3) is False


def test_no_known_threshold_is_never_read_as_below_suppression() -> None:
    """`None` = aucune règle connue pour cette métrique, jamais `True` deviné."""
    assert is_below_suppression_threshold(0, None) is False


# ── Garde jumelle avec les UNITÉS #213.3 déjà livrées ───────────────────────


#: Une forme (souvent le pluriel) de chaque `object_type`, choisie pour être
#: reconnue par `_UNIT_WORDS` (#213.3) — c'est la garde elle-même qui décide,
#: jamais une lecture de son texte : un remaniement du regex qui garderait le
#: même SENS ne casserait pas ce test, un remaniement qui perdrait un mot le
#: casserait toujours.
_SAMPLE_PLURAL_BY_OBJECT_TYPE: dict[str, str] = {
    "personne": "personnes",
    "parcours": "parcours",
    "mission": "missions",
    "experience": "expériences",
    "observation": "observations",
    "entreprise": "entreprises",
    "filiale": "filiales",
    "projet": "projets",
    "contact": "contacts",
    "signal": "signal",
    "source": "sources",
    "offre": "offres",
    "relation": "relations",
}


def test_object_types_mirror_the_unit_words_guard() -> None:
    """Un `object_type` que `_UNIT_WORDS` (#213.3) ne reconnaîtrait plus
    romprait le miroir GA-26 entre les deux fichiers sans qu'aucun test ne le
    voie — cette garde le voit, en interrogeant le regex lui-même plutôt que
    son texte."""
    assert set(_SAMPLE_PLURAL_BY_OBJECT_TYPE) == set(OBJECT_TYPES)
    unrecognised = {
        object_type
        for object_type, sample in _SAMPLE_PLURAL_BY_OBJECT_TYPE.items()
        if not _UNIT_WORDS.search(sample)
    }
    assert (
        unrecognised == set()
    ), f"object_type sans mot reconnu par _UNIT_WORDS : {unrecognised}"
