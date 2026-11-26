"""#3198 (LAU-FINAL-204) — le vocabulaire de la TRACE structurée du raisonnement
commercial de Laura, et la vue support qui en dérive.

Garde de COMPTE, même patron que `test_chat_hard_failures.py` /
`test_chat_corpus_sources.py` : elle lit les valeurs RÉELLES de l'enum,
jamais un nombre recopié à la main.
"""

from __future__ import annotations

import pytest

from app.eval.chat_reasoning_trace import (
    MAX_FIELD_CHARS,
    SUPPORT_VISIBLE_FIELDS,
    ReasoningTrace,
    ReasoningTraceField,
    post_turn_diagnostic_fields,
    pre_turn_diagnostic_fields,
    support_view,
    validate_trace,
)

#: L'ordre GA-08 du corps de l'issue #3198 — figé, un ajout va en FIN.
_EXPECTED_ORDER = (
    ReasoningTraceField.DETECTED_INTENT,
    ReasoningTraceField.UNDERLYING_DECISION,
    ReasoningTraceField.SOURCE_PLAN,
    ReasoningTraceField.ENTITY_SCOPE,
    ReasoningTraceField.PROFILE_VERSION,
    ReasoningTraceField.METHOD_RULES_USED,
    ReasoningTraceField.TOOLS_CALLED,
    ReasoningTraceField.ACCOUNT_VERDICT,
    ReasoningTraceField.DOMINANT_FACTORS,
    ReasoningTraceField.BLOCKING_FACTORS,
    ReasoningTraceField.UNKNOWNS,
    ReasoningTraceField.CHALLENGE_LEVEL,
    ReasoningTraceField.ALTERNATIVES_GENERATED,
    ReasoningTraceField.FACETS_PRESERVED,
    ReasoningTraceField.VERIFIER_STATUS,
    ReasoningTraceField.FINAL_ACTION,
)


def _sample_trace(**overrides) -> ReasoningTrace:
    base = dict(
        detected_intent="qualifier_compte",
        underlying_decision="proposer un GO conditionnel",
        source_plan=("marché interne", "recherche publique"),
        entity_scope="Société Générale — périmètre CIB",
        profile_version="profil-2026-09-20",
        method_rules_used=("regle_reference_bancaire", "regle_relation_interne"),
        tools_called=("find_accounts", "get_pipeline"),
        account_verdict="GO conditionnel",
        dominant_factors=("référence bancaire existante",),
        blocking_factors=(),
        unknowns=("organigramme partiel",),
        challenge_level="contre-conseil applique",
        alternatives_generated=("filiale voisine",),
        facets_preserved=("perimetre France entiere",),
        verifier_status="conforme",
        final_action="proposer_plan",
    )
    base.update(overrides)
    return ReasoningTrace(**base)


def test_sixteen_fields_in_the_frozen_order() -> None:
    assert tuple(ReasoningTraceField) == _EXPECTED_ORDER
    assert len(ReasoningTraceField) == 16


def test_a_well_formed_trace_has_no_defects() -> None:
    assert validate_trace(_sample_trace()) == ()


def test_a_short_text_field_over_the_length_cap_is_rejected_as_a_free_chain_of_thought() -> None:
    # Ne pas stocker une chaîne de pensée libre (#3198) : un champ court qui
    # déborde le plafond est traité comme un raisonnement libre déguisé.
    trace = _sample_trace(underlying_decision="x" * (MAX_FIELD_CHARS + 1))
    problems = validate_trace(trace)
    assert any("underlying_decision" in p for p in problems)


def test_a_list_field_item_over_the_length_cap_is_rejected() -> None:
    trace = _sample_trace(dominant_factors=("y" * (MAX_FIELD_CHARS + 1),))
    problems = validate_trace(trace)
    assert any("dominant_factors" in p for p in problems)


def test_tools_called_must_be_a_tuple_not_a_bare_string() -> None:
    # Un piège fréquent : une chaîne passée où un tuple est attendu s'itère
    # caractère par caractère sans lever — la garde doit le détecter.
    trace = _sample_trace(tools_called="find_accounts")
    problems = validate_trace(trace)
    assert any("tools_called" in p for p in problems)


def test_unknowns_absent_is_distinct_from_unknowns_verified_empty() -> None:
    # Doctrine : « non mesuré » n'est jamais confondu avec une absence
    # positive. `None` = jamais vérifié ; `()` = vérifié, rien d'inconnu.
    verified_empty = _sample_trace(unknowns=())
    never_checked = _sample_trace(unknowns=None)
    assert validate_trace(verified_empty) == ()
    assert validate_trace(never_checked) == ()
    assert verified_empty.unknowns == ()
    assert never_checked.unknowns is None


def test_support_view_excludes_the_commercial_judgment_fields() -> None:
    trace = _sample_trace()
    view = support_view(trace)
    assert set(view.keys()) == {f.value for f in SUPPORT_VISIBLE_FIELDS}
    for excluded in (
        ReasoningTraceField.UNDERLYING_DECISION,
        ReasoningTraceField.ACCOUNT_VERDICT,
        ReasoningTraceField.DOMINANT_FACTORS,
        ReasoningTraceField.BLOCKING_FACTORS,
        ReasoningTraceField.CHALLENGE_LEVEL,
        ReasoningTraceField.ALTERNATIVES_GENERATED,
        ReasoningTraceField.FACETS_PRESERVED,
    ):
        assert excluded.value not in view


def test_support_view_keeps_the_diagnostic_fields_named_by_the_no_go() -> None:
    # NO-GO de #3198 : pouvoir dire si la cause vient du routage, de la
    # donnée, du modèle ou du prompt — sans le verdict commercial lui-même.
    trace = _sample_trace()
    view = support_view(trace)
    for kept in (
        ReasoningTraceField.SOURCE_PLAN,
        ReasoningTraceField.ENTITY_SCOPE,
        ReasoningTraceField.PROFILE_VERSION,
        ReasoningTraceField.METHOD_RULES_USED,
        ReasoningTraceField.TOOLS_CALLED,
        ReasoningTraceField.VERIFIER_STATUS,
    ):
        assert kept.value in view


def test_support_view_never_carries_a_field_longer_than_the_chain_of_thought_cap() -> None:
    trace = _sample_trace()
    view = support_view(trace)
    for value in view.values():
        items = value if isinstance(value, tuple) else (value,)
        for item in items:
            if item is not None:
                assert len(str(item)) <= MAX_FIELD_CHARS


def test_validate_trace_raises_on_an_unknown_field_name_rather_than_guessing() -> None:
    with pytest.raises(TypeError):
        ReasoningTrace(**{"not_a_real_field": "x"})  # type: ignore[arg-type]


# ── Branchement live (épopée #3223) — la tranche PRE-TOUR, prouvable ─────────
#
# `route_chat_intent` (#2321) et le Facet Ledger (#3178) sont désormais réels
# sur `main` : quatre des sept champs SUPPORT_VISIBLE se dérivent d'un vrai
# tour, AVANT l'appel modèle, sans deviner. Les trois autres
# (`tools_called` RÉELLEMENT exécutés, `verifier_status`, `profile_version`)
# ne sont connus qu'APRÈS la boucle d'outils — voir `post_turn_diagnostic_
# fields` plus bas, qui couvre les sept au complet.


def test_pre_turn_diagnostic_fields_names_only_the_four_derivable_fields() -> None:
    fields = pre_turn_diagnostic_fields(
        detected_intent="qualifier_compte",
        source_plan=("collecter_donnees", "qualifier"),
        entity_scope="Société Générale — périmètre groupe",
        method_rules_used=("regle_reference_bancaire",),
    )
    assert set(fields) == {
        ReasoningTraceField.DETECTED_INTENT.value,
        ReasoningTraceField.SOURCE_PLAN.value,
        ReasoningTraceField.ENTITY_SCOPE.value,
        ReasoningTraceField.METHOD_RULES_USED.value,
    }
    assert fields[ReasoningTraceField.DETECTED_INTENT.value] == "qualifier_compte"


def test_pre_turn_diagnostic_fields_rejects_a_free_chain_of_thought_like_the_full_trace() -> None:
    # Même garde que `validate_trace` — une tranche plus petite ne veut pas
    # dire une discipline plus faible.
    with pytest.raises(ValueError, match="entity_scope"):
        pre_turn_diagnostic_fields(
            detected_intent="qualifier_compte",
            source_plan=(),
            entity_scope="x" * (MAX_FIELD_CHARS + 1),
            method_rules_used=(),
        )


def test_pre_turn_diagnostic_fields_rejects_a_bare_string_where_a_tuple_is_expected() -> None:
    with pytest.raises(ValueError, match="source_plan"):
        pre_turn_diagnostic_fields(
            detected_intent="qualifier_compte",
            source_plan="collecter_donnees",  # type: ignore[arg-type]
            entity_scope="",
            method_rules_used=(),
        )


# ── Branchement live (épopée #3223) — la tranche POST-TOUR, prouvable ───────
#
# `actions` (déjà renvoyé par `run_chat_with_tools`), `verifier_status_sink`
# (rempli par référence par `_commercial_verify`, même patron que
# `observability_sink` #3196.6) et `versioning.profile_version` (déjà relayé
# par l'outil `get_account_briefing`, #3212.3(b) — fusionné dans `main` par
# l'intégration E après le premier diagnostic « bloqué ») rendent les TROIS
# derniers champs support-visibles dérivables SANS changer le contrat
# `(reply, actions)`. Avec la tranche pré-tour, les SEPT champs support sont
# maintenant tous couverts sur un vrai tour.


def test_post_turn_diagnostic_fields_names_only_the_three_derivable_fields() -> None:
    fields = post_turn_diagnostic_fields(
        tools_called=("account_ranking", "find_contacts"),
        verifier_status="pass",
        profile_version="esn:1/context:1",
    )
    assert set(fields) == {
        ReasoningTraceField.TOOLS_CALLED.value,
        ReasoningTraceField.VERIFIER_STATUS.value,
        ReasoningTraceField.PROFILE_VERSION.value,
    }
    assert fields[ReasoningTraceField.TOOLS_CALLED.value] == ("account_ranking", "find_contacts")
    assert fields[ReasoningTraceField.VERIFIER_STATUS.value] == "pass"
    assert fields[ReasoningTraceField.PROFILE_VERSION.value] == "esn:1/context:1"


def test_post_turn_diagnostic_fields_rejects_a_free_chain_of_thought_like_the_full_trace() -> None:
    with pytest.raises(ValueError, match="verifier_status"):
        post_turn_diagnostic_fields(
            tools_called=(),
            verifier_status="x" * (MAX_FIELD_CHARS + 1),
            profile_version="esn:1/context:1",
        )


def test_post_turn_diagnostic_fields_rejects_a_bare_string_where_a_tuple_is_expected() -> None:
    with pytest.raises(ValueError, match="tools_called"):
        post_turn_diagnostic_fields(
            tools_called="account_ranking",  # type: ignore[arg-type]
            verifier_status="pass",
            profile_version="esn:1/context:1",
        )
