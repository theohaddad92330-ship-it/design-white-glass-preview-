"""#2007.14 — LE TEST BLOQUANT : chaque réponse INFLUENCE l'audit.

Pas « le champ existe » — `question-keys-reach-the-model.test.ts` (web) le
prouve déjà pour les dix champs Temps-1, en grattant le nom du champ dans le
texte SOURCE de `bellum_profiler.py`. Ici on va plus loin : on prouve que la
VALEUR change le texte réellement produit par `build_profiler_user_prompt`,
pour CHAQUE clé qui a un lecteur connu (les dix champs Temps-1, toujours
rendus, plus `_COMPLEMENT_SECTIONS`, rendu seulement si répondu) — c'est
exactement l'ensemble que `onboarding-question-consumers.ts` marque `audit`
pour les 114 clés d'`EsnAnswers` (contracts, #2006.12-.21 / #2007.13).

Aucun appel réseau : `build_profiler_user_prompt` est une fonction PURE de son
dict d'entrée. C'est le seul type de preuve qu'on peut tenir sans payer un
appel Claude à chaque exécution de la suite.
"""

from __future__ import annotations

import pytest

from app.prompts.bellum_profiler import _COMPLEMENT_SECTIONS, build_profiler_user_prompt

_TEMPS1_KEYS = (
    "esn_name",
    "consultant_size",
    "sales_team_size",
    "expertise_areas",
    "positioning",
    "staffing_model",
    "target_sectors",
    "target_company_types",
    "geo_zones",
    "main_sales_pain",
)


def _complement_keys() -> list[str]:
    keys: list[str] = []
    for _titre, cles in _COMPLEMENT_SECTIONS:
        keys.extend(cles)
    return keys


ALL_AUDIT_KEYS = sorted(set(_TEMPS1_KEYS) | set(_complement_keys()))

# Champs LIST côté `OnboardingAnswers` (le reste est `str | None`) — déterminé
# une fois, à la main, contre `apps/ia/app/routers/profiler.py` : une liste et
# une chaîne ne se remplissent pas de la même « valeur qui change tout ».
_LIST_FIELDS = {
    # Théo O onboarding-couverture (22/10) — les listes de la V23.
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
    "expertise_areas",
    "target_sectors",
    "target_company_types",
    "geo_zones",
    "offer_domains",
    "decision_maker_personas",
    "client_references",
    "no_go_sectors",
    "go_to_market_channels",
    "sales_routine",
    "sales_blockers",
    "tooling",
    "shared_data_scope",
    "service_types",
    "service_types_proven",
    "service_types_desired",
    "reference_sectors",
    "case_study_results",
    "client_testimonials",
    "expertise_client_reference",
    "expertise_personal_experience",
    "expertise_partner",
    "expertise_talent_pool",
    "staffing_modes",
    "profile_validation_methods",
    "contractual_constraints",
    "ideal_client_size",
    "ideal_client_structure",
    "ideal_client_maturity",
    "ideal_client_territory",
    "ideal_client_referencement_constraints",
    "ideal_client_current_state",
    "entry_channels_dependency",
    "entry_channels_prerequisites",
    "entry_channels_saturation",
    "entry_channels_used",
    "entry_channels_period",
    "entry_channels_measured",
    "entry_channels_last_starts",
    "entry_channels_time_split",
    "activity_measures_tracked",
    "weekly_sales_time_slots",
    "competing_workloads",
    "dossier_continuity_practices",
    "dossier_continuity_breaks",
    "tooling_reference_data",
    "tooling_internal_names",
    "sales_freins",
    "remote_and_travel_scope",
    "zone_capability_status",
}


def _altered_value(key: str) -> object:
    """Une valeur non vide, du bon type Python pour cette clé."""
    return ["Valeur de test #2007.14"] if key in _LIST_FIELDS else "Valeur de test #2007.14"


def _base_answers() -> dict[str, object]:
    """Le dict que `OnboardingAnswers.model_dump()` produit quand RIEN au-delà
    des dix champs Temps-1 n'a de valeur — chaque clé vaut son défaut vide
    (`None` ou `[]`), jamais une valeur inventée."""
    return {key: ([] if key in _LIST_FIELDS else None) for key in ALL_AUDIT_KEYS}


@pytest.mark.parametrize("key", ALL_AUDIT_KEYS)
def test_each_answer_changes_the_prompt_sent_to_the_model(key: str) -> None:
    """#2007.14 — changer CETTE réponse change le texte envoyé au modèle.

    Pas une présence de nom de champ : le texte RENDU diffère bel et bien
    entre une réponse vide et une réponse renseignée.
    """
    base = _base_answers()
    altered = {**base, key: _altered_value(key)}

    before = build_profiler_user_prompt(base)
    after = build_profiler_user_prompt(altered)

    assert before != after, f"la clé « {key} » ne change RIEN au prompt envoyé au modèle"


def test_the_corpus_is_not_empty() -> None:
    """Garde qui LIT quelque chose : le corpus mesuré n'est pas vide."""
    assert len(ALL_AUDIT_KEYS) >= 100


def test_sait_dire_non_une_cle_ignoree_par_le_prompt_ne_passe_pas() -> None:
    """Preuve que le test SAIT dire NON : une fonction de rendu qui ignore une
    clé donnée fait échouer la même assertion que ci-dessus."""

    def _prompt_that_ignores_expertise_areas(answers: dict[str, object]) -> str:
        answers = dict(answers)
        answers.pop("expertise_areas", None)
        return build_profiler_user_prompt(answers)

    base = _base_answers()
    altered = {**base, "expertise_areas": _altered_value("expertise_areas")}

    before = _prompt_that_ignores_expertise_areas(base)
    after = _prompt_that_ignores_expertise_areas(altered)

    assert before == after, "le témoin aurait dû rester identique : la clé est retirée AVANT le rendu"
