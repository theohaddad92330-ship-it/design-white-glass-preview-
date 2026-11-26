"""#2852.6-53 (Chat : contrat de résultat d'outil, épopée #2429/#2282) —
l'enveloppe canonique d'une réponse d'OUTIL, distincte de l'enveloppe de
RÉPONSE (`chat-reply-envelope.ts`, #2429.2, déjà livrée) : celle-ci nomme ce
qu'un OUTIL a trouvé (statut, portée, sources), pas ce que Laura ÉCRIT.

Aujourd'hui, un outil qui ne trouve rien renvoie `{"error": "texte en
français"}` — un texte non structuré comme SEUL signal (#2282, « AUCUN TEXTE
NON STRUCTURÉ COMME SEULE SORTIE »), et deux causes différentes (une liste
vide réellement cherchée, un pont éteint) se lisent pareil. Ce module nomme
dix statuts distincts (#2282 « STATUTS ») pour que « vide » et « non couvert »
ne se confondent jamais (le NO-GO explicite de #2282).
"""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.models.tool_result_envelope import (
    ToolResultEnvelope,
    ToolResultStatus,
    coverage_from_degraded,
    db_read_envelope,
    error_envelope,
)


def test_ten_canonical_statuses_are_named() -> None:
    # #2282 STATUTS — dix, ni plus ni moins ; « success »/« empty » ne se
    # confondent jamais avec « not_covered » (le NO-GO).
    assert {status.value for status in ToolResultStatus} == {
        "success",
        "partial",
        "empty",
        "not_covered",
        "permission_denied",
        "ambiguous",
        "timeout",
        "provider_error",
        "invalid_input",
        "cancelled",
    }


def test_envelope_requires_a_result_type() -> None:
    with pytest.raises(ValidationError):
        ToolResultEnvelope(status=ToolResultStatus.SUCCESS, result_type="")


def test_to_wire_never_invents_a_measured_zero() -> None:
    """`total_found` absent (jamais mesuré) reste ABSENT du fil — jamais 0."""
    envelope = ToolResultEnvelope(status=ToolResultStatus.SUCCESS, result_type="contact_list")
    wire = envelope.to_wire()
    assert "total_found" not in wire
    assert wire["status"] == "success"
    assert wire["result_type"] == "contact_list"


def test_to_wire_omits_empty_lists_rather_than_sending_them_empty() -> None:
    envelope = ToolResultEnvelope(status=ToolResultStatus.EMPTY, result_type="contact_list")
    wire = envelope.to_wire()
    assert "sources_consulted" not in wire
    assert "caveats" not in wire
    assert "unknowns" not in wire


def test_db_read_envelope_is_empty_when_nothing_found() -> None:
    """Une source à un seul fournisseur (notre propre base) — un statut
    `empty` MESURÉ, jamais `not_covered` : la base a été interrogée avec succès
    et n'a rien rendu, ce n'est pas qu'elle ne sait pas répondre."""
    wire = db_read_envelope(
        result_type="contact_list", items_count=0, total_found=0, truncated=False, source="bellum_workspace"
    ).to_wire()
    assert wire["status"] == "empty"
    assert wire["sources_consulted"] == ["bellum_workspace"]
    assert wire["sources_succeeded"] == ["bellum_workspace"]
    assert "sources_failed" not in wire
    assert wire["returned_count"] == 0
    assert wire["total_found"] == 0


def test_db_read_envelope_is_partial_when_truncated() -> None:
    wire = db_read_envelope(
        result_type="contact_list", items_count=25, total_found=57, truncated=True, source="bellum_workspace"
    ).to_wire()
    assert wire["status"] == "partial"
    assert wire["partial_reason"]
    assert wire["returned_count"] == 25
    assert wire["total_found"] == 57


def test_db_read_envelope_is_success_when_complete() -> None:
    wire = db_read_envelope(
        result_type="contact_list", items_count=2, total_found=2, truncated=False, source="bellum_workspace"
    ).to_wire()
    assert wire["status"] == "success"
    assert "partial_reason" not in wire


# #2852.12 (lot V22, suite) — la PORTÉE effectivement appliquée (les critères
# retenus par l'outil), jamais un résumé : #2852.6-53 la nomme déjà sur le
# champ `scope` du contrat, mais aucun des trois premiers outils câblés ne le
# posait encore.
def test_db_read_envelope_carries_the_effective_scope_when_given() -> None:
    wire = db_read_envelope(
        result_type="contact_list",
        items_count=1,
        total_found=1,
        truncated=False,
        source="bellum_workspace",
        scope={"company": "Acme"},
    ).to_wire()
    assert wire["scope"] == {"company": "Acme"}


def test_db_read_envelope_omits_scope_when_not_given() -> None:
    wire = db_read_envelope(
        result_type="contact_list", items_count=0, total_found=0, truncated=False, source="bellum_workspace"
    ).to_wire()
    assert "scope" not in wire


def test_error_envelope_names_a_stable_code_and_a_next_step() -> None:
    wire = error_envelope(
        status=ToolResultStatus.INVALID_INPUT,
        result_type="contact_list",
        error_code="missing_search_criteria",
        suggested_next_step="Ajoute un critère.",
    ).to_wire()
    assert wire == {
        "status": "invalid_input",
        "result_type": "contact_list",
        "error_code": "missing_search_criteria",
        "suggested_next_step": "Ajoute un critère.",
    }


def test_envelope_never_carries_a_probability() -> None:
    """Doctrine — aucune probabilité affichée : le contrat n'a NI champ
    `confidence` numérique NI `probability`, contrairement à la demande brute
    de #2282 (« confidence ») — refusée ici, comme six fois avant elle."""
    fields = set(ToolResultEnvelope.model_fields.keys())
    assert "confidence" not in fields
    assert "probability" not in fields


# ── #2852.11 — `coverage` UNIFIÉ multi-sources ────────────────────────────
#
# Jamais le NOM d'une source (doctrine : nos fournisseurs ne se nomment
# jamais, `_degraded_without_vendors`, déjà en place sur `run_account_search`)
# et jamais un DÉNOMINATEUR total (aucune source du catalogue ne sait dire
# combien de fournisseurs existent au total) — seulement ce qu'on SAIT :
# combien ont répondu avec une limite de capacité, combien ont répondu sans
# rien trouver, combien sont en échec réel (aucun `kind` — panne/clé absente).


def test_coverage_from_degraded_is_none_when_nothing_degraded() -> None:
    assert coverage_from_degraded([]) is None


def test_coverage_from_degraded_counts_by_kind_never_by_source_name() -> None:
    coverage = coverage_from_degraded(
        [
            {"reason": "unsupported_filters", "kind": "capability"},
            {"reason": "unsupported_filters", "kind": "capability"},
            {"reason": "no_match", "kind": "no-match"},
            {"reason": "unavailable"},  # pas de `kind` = panne réelle
        ]
    )
    assert coverage == {"capability_gap": 2, "no_match": 1, "failed": 1}
    assert "source" not in str(coverage)


def test_coverage_from_degraded_omits_zero_buckets() -> None:
    coverage = coverage_from_degraded([{"reason": "unsupported_filters", "kind": "capability"}])
    assert coverage == {"capability_gap": 1}


def test_envelope_carries_coverage_and_duration_when_given() -> None:
    wire = ToolResultEnvelope(
        status=ToolResultStatus.SUCCESS,
        result_type="account_list",
        coverage={"capability_gap": 1},
        duration_ms=420,
    ).to_wire()
    assert wire["coverage"] == {"capability_gap": 1}
    assert wire["duration_ms"] == 420


def test_envelope_omits_coverage_and_duration_when_not_measured() -> None:
    """Non mesuré n'est jamais 0 ni `{}` — absent, comme le reste du contrat."""
    wire = ToolResultEnvelope(status=ToolResultStatus.SUCCESS, result_type="account_list").to_wire()
    assert "coverage" not in wire
    assert "duration_ms" not in wire
