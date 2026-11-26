"""Théo O onboarding-couverture (22/10/2026) — les 26 clés neuves de la V23 sont LUES par le profiler.

`first_name` voyageait déjà (prénom du compte) : la V23 y met le prénom que la personne choisit pour Laura, sans champ
neuf. Les 25 autres sont des champs d'`OnboardingAnswers`, rendus seulement s'ils sont répondus — un profil qui n'en
porte aucune produit le prompt d'avant, à l'octet près, et une absence n'arrive jamais au modèle comme une valeur.
"""

from __future__ import annotations

import pytest

from app.prompts.bellum_profiler import _COMPLEMENT_SECTIONS, build_profiler_user_prompt
from app.routers.profiler import OnboardingAnswers

_LISTS = (
    "target_nature",
    "target_size",
    "language_capabilities",
    "priority_expertise",
    "skill_technos",
    "activity_nature",
    "data_sources",
    "tools",
    "delivery_frictions",
    "recruiting_priorities",
    "country_scope",
)
_TEXTS = (
    "account_access",
    "horizon",
    "success_target",
    "offer_pitch",
    "workflow_pain",
    "autonomy",
    "context_policy",
    "commercial_limits",
    "currency",
    "scope_level",
    "scope_unit",
    "bench_status",
    "geography_detail",
    "no_go",
)
_KEYS = _LISTS + _TEXTS


def _rendered_keys() -> set[str]:
    return {key for _title, keys in _COMPLEMENT_SECTIONS for key in keys}


def test_corpus_is_the_twenty_five_new_keys() -> None:
    assert len(_KEYS) == 25 and len(set(_KEYS)) == 25


@pytest.mark.parametrize("key", _KEYS)
def test_key_is_declared_on_the_request_model(key: str) -> None:
    assert key in OnboardingAnswers.model_fields


@pytest.mark.parametrize("key", _KEYS)
def test_key_is_rendered_when_answered(key: str) -> None:
    assert key in _rendered_keys()
    base: dict[str, object] = {k: ([] if k in _LISTS else None) for k in _KEYS}
    answered = {**base, key: ["Valeur de test V23"] if key in _LISTS else "Valeur de test V23"}
    assert build_profiler_user_prompt(base) != build_profiler_user_prompt(answered)


def test_a_profile_without_any_of_them_keeps_the_previous_prompt() -> None:
    legacy = {"esn_name": "Acme", "expertise_areas": ["Data"]}
    empty_v23 = {**legacy, **{k: ([] if k in _LISTS else None) for k in _KEYS}}
    assert build_profiler_user_prompt(legacy) == build_profiler_user_prompt(empty_v23)


def test_an_absent_answer_is_never_rendered_as_zero_or_none() -> None:
    prompt = build_profiler_user_prompt({k: ([] if k in _LISTS else None) for k in _KEYS})
    for key in _KEYS:
        assert key not in prompt
