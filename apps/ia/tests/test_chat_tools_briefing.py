"""Copilote tool `get_account_briefing` (restitution V2 §12-14, tool-calling).

Locks the pure projection: present-only, surfaces the methodology outputs
(recommendedMovement / nextActions) and never invents a missing field. The
tool registry stays flag-gated (CHAT_TOOLS_ENABLED) — these tests exercise the
pure projector + registry membership, no network.
"""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi import HTTPException

from app.services.chat_tools import CHAT_TOOLS, build_account_briefing, execute_chat_tool

USER = "44444444-4444-4444-8444-444444444444"


def test_registry_exposes_the_briefing_tool():
    names = {t["name"] for t in CHAT_TOOLS}
    assert "get_account_briefing" in names
    assert "compare_accounts" in names


def test_briefing_projects_score_verdict_pains_and_methodology_outputs():
    account = {
        "id": "acc-1",
        "company_name": "TF1",
        "priority_score": 18,
        "raw_analysis": {
            "pains": [
                {"pain": "Migration cloud à mener"},
                {"pain": "Dette technique legacy"},
                {"pain": "Cybersécurité à renforcer"},
                {"pain": "4e douleur ignorée"},
            ],
            "plan": {
                "evaluation": {"verdict": "GO"},
                "recommendedMovement": {
                    "movement": "top_down",
                    "sequence": "sponsor → délégation",
                    "rationale": "relation forte",
                },
                "nextActions": [
                    {"id": "enrichir_p1", "chantier": "contacts", "label": "Enrichir", "why": "manquant"},
                ],
            },
        },
    }
    b = build_account_briefing(account)
    assert b["account_id"] == "acc-1"
    assert b["company_name"] == "TF1"
    assert b["score"] == 18
    assert b["verdict"] == "AGIR MAINTENANT"
    assert b["top_pains"] == ["Migration cloud à mener", "Dette technique legacy", "Cybersécurité à renforcer"]
    assert b["recommended_movement"]["movement"] == "top_down"
    assert len(b["next_actions"]) == 1


# #2304.16 (épopée #2932) — le branchement laissé de côté par la première
# tranche (#5e533cdd) : `build_account_briefing` lisait un `verdict` qui
# n'existait nulle part côté pipeline (`plan.commercial_score`, jamais écrit
# en snake_case ; `raw.verdict`/`plan.verdict`, jamais écrits non plus — seul
# `plan.evaluation.verdict`, GO/PRUDENT/STOP/EXPLORER, l'est réellement). Ce
# fallback rendait donc TOUJOURS l'ancien test artificiel, jamais une vraie
# analyse — `named_verdict` est la même projection déterministe que le reste
# de #2304.12-.16.
def test_briefing_projects_the_named_verdict_from_the_real_evaluation_field():
    account = {
        "id": "acc-verdict",
        "company_name": "Capgemini",
        "raw_analysis": {"plan": {"evaluation": {"verdict": "PRUDENT"}}},
    }
    b = build_account_briefing(account)
    assert b["verdict"] == "RÉSERVE"


def test_briefing_names_the_stop_verdict_mettre_en_veille_when_a_no_go_trigger_exists():
    account = {
        "id": "acc-veille",
        "company_name": "Orange",
        "raw_analysis": {
            "plan": {
                "evaluation": {
                    "verdict": "STOP",
                    "dossier_read": {"no_go": {"trigger": "Renouvellement du marché en 2027"}},
                }
            }
        },
    }
    b = build_account_briefing(account)
    assert b["verdict"] == "METTRE EN VEILLE"


# #3178.3b (#3227) — le résolveur d'entité (#2284) tranche déjà group/
# parent_company/subsidiary/business_unit/brand au moment de l'analyse
# (entity_resolution.py::resolve_account_entity) ; rien ne le portait jusqu'à
# get_account_briefing, le seul tool que Laura appelle pour un compte précis.


def test_briefing_projects_the_resolved_entity_kind_and_parent_names():
    account = {
        "id": "acc-bb",
        "company_name": "BoursoBank",
        "raw_analysis": {
            "entity_resolution": {
                "state": "resolved",
                "kind": "subsidiary",
                "commercial_name": "BoursoBank",
                "sources": ["legal_identifier", "group_graph"],
                "parent_names": ["Groupe Société Générale"],
                "resolved_at": "2026-09-28T00:00:00Z",
            }
        },
    }
    b = build_account_briefing(account)
    assert b["entity_kind"] == "subsidiary"
    assert b["parent_names"] == ["Groupe Société Générale"]


def test_briefing_omits_parent_names_when_the_resolution_names_none():
    """Une entité SANS filiation (un ESN, un client final) ne porte pas de
    `parent_names` — jamais une liste vide qui se lirait « aucun parent »."""
    account = {
        "id": "acc-esn",
        "company_name": "Capgemini",
        "raw_analysis": {"entity_resolution": {"state": "resolved", "kind": "esn", "commercial_name": "Capgemini"}},
    }
    b = build_account_briefing(account)
    assert b["entity_kind"] == "esn"
    assert "parent_names" not in b


def test_briefing_names_no_kind_when_the_resolution_is_unresolved_or_ambiguous():
    """Un kind n'est JAMAIS posé par le résolveur hors des états ancrés
    (resolved/manual_override/inactive) — sa seule PRÉSENCE suffit ici, sans
    relire `state` séparément (voir le docblock de build_account_briefing)."""
    account = {
        "id": "acc-amb",
        "company_name": "Générale",
        "raw_analysis": {"entity_resolution": {"state": "ambiguous", "commercial_name": "Générale"}},
    }
    b = build_account_briefing(account)
    assert "entity_kind" not in b
    assert "parent_names" not in b


def test_briefing_names_no_kind_when_no_resolution_exists_at_all():
    """Une analyse d'AVANT #2284, ou en échec de résolution : pas de clé,
    jamais un kind deviné."""
    account = {"id": "acc-old", "company_name": "Ancien compte", "raw_analysis": {}}
    b = build_account_briefing(account)
    assert "entity_kind" not in b
    assert "parent_names" not in b


def test_briefing_names_the_stop_verdict_ecarter_when_no_trigger_is_identified():
    account = {
        "id": "acc-ecarte",
        "company_name": "Veolia",
        "raw_analysis": {"plan": {"evaluation": {"verdict": "STOP"}}},
    }
    b = build_account_briefing(account)
    assert b["verdict"] == "ÉCARTER POUR CET OBJECTIF"


def test_briefing_omits_verdict_when_no_evaluation_ran_yet():
    account = {"id": "acc-sans-eval", "company_name": "ACME3", "raw_analysis": {"plan": {}}}
    b = build_account_briefing(account)
    assert "verdict" not in b


def test_briefing_omits_missing_fields_never_invents():
    account = {"id": "acc-2", "company_name": "ACME", "raw_analysis": {}}
    b = build_account_briefing(account)
    assert b == {"account_id": "acc-2", "company_name": "ACME", "href": "/accounts/acc-2"}
    assert "score" not in b and "top_pains" not in b and "recommended_movement" not in b


def test_briefing_tolerates_a_null_raw_analysis():
    b = build_account_briefing({"id": "acc-3", "company_name": "X", "raw_analysis": None})
    assert b == {"account_id": "acc-3", "company_name": "X", "href": "/accounts/acc-3"}


# #2271.16 — la fiche de compte est une SORTIE, pas du texte.
#
# Mesuré en recette écran le 18/09/2026 : « Présente-moi le compte THALES »
# rendait une simple liste à puces, jamais la carte `account_card`, alors que
# ses deux voisins du même trio (`timeline`, `file_export`) rendaient bien
# leur carte. Cause : `reply-blocks.ts` déclare `href` OBLIGATOIRE sur
# `account_card` (contrairement à `timeline`, où `account.href` est
# optionnel) et le system prompt interdit d'inventer un chemin (« sans fiche
# connue, pas de carte ») — mais `build_account_briefing` ne fournissait
# aucun `href`. Le modèle n'avait donc AUCUN moyen légitime de remplir le
# champ requis, et retombait systématiquement sur du texte. Sans ce test,
# un champ requis par le contrat mais absent de la projection ne fait
# rougir ni le zod, ni le pydantic, ni le rendu web — seule cette carte-là
# la voit manquer.
def test_briefing_carries_the_account_card_href_the_model_cannot_invent():
    account = {"id": "acc-thales", "company_name": "THALES", "raw_analysis": {}}
    b = build_account_briefing(account)
    assert b["href"] == "/accounts/acc-thales"


# #2306.10 — l'interface décompose déjà le score en sept axes
# (`DossierReadBlocks`/`dossierReadViewData.ts`) ; Laura répondait en doctrine
# générale sans jamais lire CES axes. `build_account_briefing` est le SEUL
# projecteur du tool `get_account_briefing` (pur, sans I/O) : c'est lui qui
# relie le chat au bloc `dossier_read` déjà écrit par phase 4.
def test_briefing_exposes_the_seven_score_axes_when_the_dossier_read_block_exists():
    account = {
        "id": "acc-4",
        "company_name": "SNCF",
        "raw_analysis": {
            "plan": {
                "evaluation": {
                    "dossier_read": {
                        "axes": [
                            {"key": "adequation_offre", "state": "measured", "value": 4, "impact": "Fort"},
                            {"key": "accessibilite", "state": "unknown", "value": None, "impact": None},
                        ]
                    }
                }
            }
        },
    }
    b = build_account_briefing(account)
    assert b["score_axes"] == [
        {"key": "adequation_offre", "state": "measured", "value": 4, "impact": "Fort"},
        {"key": "accessibilite", "state": "unknown"},
    ]


def test_briefing_never_invents_a_value_on_an_axis_it_cannot_measure():
    account = {
        "id": "acc-5",
        "company_name": "EDF",
        "raw_analysis": {
            "plan": {"evaluation": {"dossier_read": {"axes": [{"key": "concurrence", "state": "unknown"}]}}}
        },
    }
    b = build_account_briefing(account)
    assert b["score_axes"] == [{"key": "concurrence", "state": "unknown"}]
    assert "value" not in b["score_axes"][0]


def test_briefing_omits_score_axes_when_there_is_no_dossier_read_block():
    account = {"id": "acc-6", "company_name": "ACME", "raw_analysis": {"plan": {"evaluation": {}}}}
    b = build_account_briefing(account)
    assert "score_axes" not in b


# #2292.28 (épopée #2929) — « route déconseillée » : le dossier écrit déjà
# `dossier_read.anti_advice` (`{what, why}`, normalisé par phase 4), lu par
# l'onglet Synthèse (`DossierReadBlocks.tsx`) mais jamais projeté vers le chat.
# Laura répondait donc sur un compte connu sans jamais nommer la route à
# éviter — même lecture seule, même source, aucun second calcul.
def test_briefing_exposes_the_route_to_avoid_when_the_dossier_read_block_has_it():
    account = {
        "id": "acc-7",
        "company_name": "Orange",
        "raw_analysis": {
            "plan": {
                "evaluation": {
                    "dossier_read": {
                        "anti_advice": {
                            "what": "Ne pas viser le siège directement",
                            "why": "Aucun sponsor identifié au comité exécutif",
                        }
                    }
                }
            }
        },
    }
    b = build_account_briefing(account)
    assert b["route_to_avoid"] == {
        "what": "Ne pas viser le siège directement",
        "why": "Aucun sponsor identifié au comité exécutif",
    }


def test_briefing_omits_route_to_avoid_when_there_is_no_dossier_read_block():
    account = {"id": "acc-8", "company_name": "ACME2", "raw_analysis": {"plan": {"evaluation": {}}}}
    b = build_account_briefing(account)
    assert "route_to_avoid" not in b


# #2852.6-53 (lot V22, suite) — même enveloppe canonique, câblée ici sur un
# outil qui rend UN dossier, jamais une liste : `result_type`/`status`
# s'appliquent tout autant à une lecture à un seul enregistrement.
class TestToolResultEnvelope:
    @pytest.mark.asyncio
    async def test_missing_account_id_names_invalid_input(self) -> None:
        result = await execute_chat_tool("get_account_briefing", {}, user_id=USER, profile_data=None)
        assert result["status"] == "invalid_input"
        assert result["error_code"] == "missing_account_id"
        assert result["suggested_next_step"]

    @pytest.mark.asyncio
    async def test_foreign_or_missing_account_names_empty_never_a_distinct_permission_code(
        self, monkeypatch: pytest.MonkeyPatch
    ) -> None:
        monkeypatch.setattr("app.services.supabase_client.get_supabase", MagicMock(return_value=MagicMock()))
        monkeypatch.setattr(
            "app.services.ownership.fetch_owned_account",
            AsyncMock(side_effect=HTTPException(status_code=404)),
        )
        result = await execute_chat_tool(
            "get_account_briefing", {"account_id": "acc-x"}, user_id=USER, profile_data=None
        )
        assert result["status"] == "empty"
        assert "error_code" not in result

    @pytest.mark.asyncio
    async def test_a_resolved_account_names_success_with_its_source(self, monkeypatch: pytest.MonkeyPatch) -> None:
        async def _fetch_owned_account(*_a: object, **_k: object) -> dict:
            return {"id": "acc-1", "company_name": "Client Test"}

        monkeypatch.setattr("app.services.supabase_client.get_supabase", MagicMock(return_value=MagicMock()))
        monkeypatch.setattr("app.services.ownership.fetch_owned_account", AsyncMock(side_effect=_fetch_owned_account))
        result = await execute_chat_tool(
            "get_account_briefing", {"account_id": "acc-1"}, user_id=USER, profile_data=None
        )
        assert result["status"] == "success"
        assert result["result_type"] == "account_briefing"
        assert result["sources_consulted"] == ["bellum_workspace"]
        assert result["account_id"] == "acc-1"
