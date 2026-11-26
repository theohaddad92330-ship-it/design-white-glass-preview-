"""#3197 (LAU-FINAL-203) — le vocabulaire des quinze mesures de l'eval suite
d'intelligence commerciale, et leur section dans le tableau de pilotage.

Garde de COMPTE, même patron que `test_chat_hard_failures.py` /
`test_chat_corpus_sources.py`.
"""

from __future__ import annotations

import pytest

from app.eval.chat_commercial_measures import MEASURE_SPECS, ChatCommercialMeasure, measure_spec

#: L'ordre GA-08 du corps de l'issue #3197 (section MESURES) — figé, un ajout
#: va en FIN.
_EXPECTED_ORDER = (
    ChatCommercialMeasure.INTENT_ACCURACY,
    ChatCommercialMeasure.SOURCE_ROUTING_ACCURACY,
    ChatCommercialMeasure.INTERNAL_SOURCE_USAGE,
    ChatCommercialMeasure.FACET_RETENTION,
    ChatCommercialMeasure.ENTITY_RESOLUTION,
    ChatCommercialMeasure.ACCOUNT_VERDICT_QUALITY,
    ChatCommercialMeasure.COUNTER_ADVICE_QUALITY,
    ChatCommercialMeasure.ALTERNATIVE_RELEVANCE,
    ChatCommercialMeasure.SPECIALIST_ROLE_PRECISION,
    ChatCommercialMeasure.UNSUPPORTED_CLAIM_RATE,
    ChatCommercialMeasure.CURRENT_VS_HISTORICAL_ACCURACY,
    ChatCommercialMeasure.CORRECTION_RERUN_SUCCESS,
    ChatCommercialMeasure.NEXT_ACTION_QUALITY,
    ChatCommercialMeasure.STYLE_TEMPLATE_RATE,
    ChatCommercialMeasure.RESPONSE_DENSITY_FIT,
)


def test_exactly_fifteen_measures_in_the_frozen_order() -> None:
    assert tuple(ChatCommercialMeasure) == _EXPECTED_ORDER
    assert len(ChatCommercialMeasure) == 15


def test_every_measure_has_a_bilingual_spec() -> None:
    assert set(MEASURE_SPECS.keys()) == set(ChatCommercialMeasure)
    for measure, spec in MEASURE_SPECS.items():
        assert spec.label.fr.strip(), f"{measure} sans libellé FR"
        assert spec.label.en.strip(), f"{measure} sans libellé EN"
        assert spec.what_it_measures.strip(), f"{measure} sans définition"


def test_every_measure_not_computable_today_names_a_concrete_reason() -> None:
    # Doctrine : un axe non évaluable est NOMMÉ, jamais un silence, jamais
    # deviné comme calculable pour faire nombre.
    for measure, spec in MEASURE_SPECS.items():
        if not spec.computable_today:
            assert spec.reason.strip(), f"{measure} : non calculable sans raison écrite"
            assert len(spec.reason) > 15, f"{measure} : raison trop courte pour être concrète"


def test_style_never_compensates_relevance_is_not_silently_computable() -> None:
    # NO-GO de #3197 : une amélioration de style ne doit jamais compenser une
    # régression de pertinence commerciale — deux axes qui ne se moyennent
    # jamais l'un dans l'autre.
    style = MEASURE_SPECS[ChatCommercialMeasure.STYLE_TEMPLATE_RATE]
    relevance = MEASURE_SPECS[ChatCommercialMeasure.ACCOUNT_VERDICT_QUALITY]
    assert style.label.fr != relevance.label.fr


def test_measure_spec_raises_on_an_unknown_value_rather_than_guessing() -> None:
    with pytest.raises(KeyError):
        measure_spec("not_a_real_measure")  # type: ignore[arg-type]


def test_values_are_stable_strings_never_renumbered() -> None:
    assert ChatCommercialMeasure.INTENT_ACCURACY.value == "intent_accuracy"
    assert ChatCommercialMeasure.RESPONSE_DENSITY_FIT.value == "response_density_fit"
