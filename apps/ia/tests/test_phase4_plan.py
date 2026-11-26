from __future__ import annotations

from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from app.routers.phase4_plan import (
    ACTION_PLAN_META_MAX_TOKENS,
    ACTION_PLAN_PHASE_MAX_TOKENS,
    _apply_quality_cap,
    _executive_summary,
    _next_best_action,
    _normalize_plan_scores,
    _plays,
    _trim_account_data,
)
from app.services.claude_service import ClaudeIncompleteOutputError
from app.services.claude_service import TokenUsage as ClaudeTokenUsage
from app.services.recommendation_specificity import registry_from_inputs


def _claude_return(payload: dict) -> tuple[dict, ClaudeTokenUsage]:
    return (
        payload,
        ClaudeTokenUsage(input_tokens=100, output_tokens=200, model="claude-sonnet-4-6", cost_usd=0.01),
    )


# Per-axis breakdowns the model would emit — the verdict is recomputed from them.
def _breakdown(**points: int) -> list[dict]:
    return [{"axis": k, "points": v} for k, v in points.items()]


# Annexe méthodo 5 axes (p25). Sums to 20 → GO (≥20). fit_offre first so the
# axis0 assertion (backfilled max/label) stays stable.
GO_BREAKDOWN = _breakdown(fit_offre=5, timing=5, accessibilite=5, concurrence=3, capacite=2)
# Sums to 6 → STOP (<14).
STOP_BREAKDOWN = _breakdown(fit_offre=1, timing=2, accessibilite=1, concurrence=1, capacite=1)


# action_plan is split into a meta call + one call per temporal phase, so the
# six logical sections fan out to 11 Claude calls that run concurrently — plus
# one ``bellum_messages`` call that writes the ready-to-send contact messages =
# 12. Tests that assert on actionPlan must dispatch by ``prompt_name`` rather
# than rely on a single blanket return value.
PLAN_CALL_COUNT = 12

# Self-consistency A1 (ON par défaut) : la 2e passe ajoute des appels au-delà des
# 12 de génération. Dans les fixtures de ce fichier : évaluation (le score /25
# existe toujours) + contacts (un contact nommé) = 2 ; la re-dérivation des plays
# ne tire PAS (aucun priorityPerimeters → plays passe 1 vides → « non mesurée »).
SC_EXTRA_CALLS = 2


def _plan_dispatch(overrides: dict | None = None):
    base: dict[str, dict] = {
        "action_plan_meta": {"strategy": "S", "justification": "J"},
        "action_plan_phase_0": {"phase": {"name": "IMMEDIAT", "title": "t0", "objective": "o", "actions": []}},
        "action_plan_phase_1": {"phase": {"name": "MOIS 1", "title": "t1", "objective": "o", "actions": []}},
        "action_plan_phase_2": {"phase": {"name": "MOIS 2-3", "title": "t2", "objective": "o", "actions": []}},
        "action_plan_phase_3": {"phase": {"name": "MOIS 3-6", "title": "t3", "objective": "o", "actions": []}},
        "action_plan_phase_4": {"phase": {"name": "MOIS 6-12", "title": "t4", "objective": "o", "actions": []}},
        "offers": {"offersToPropose": []},
        "quick_wins": {"quick_wins": []},
        "if_no_response": {"if_no_response": {}},
        "evaluation": {"evaluation": {"scoreBreakdown": GO_BREAKDOWN, "justification": "ok", "risks": []}},
        "competitive_strategy": {"competitiveStrategy": {"positioningStatement": "ps", "vsCompetitors": []}},
        # Self-consistency A1 — la 2e passe re-dérive avec ses propres prompt_names.
        # Par défaut elle CONFIRME la passe 1 (accord → confiance haute).
        "self_consistency_evaluation": {
            "evaluation": {"scoreBreakdown": GO_BREAKDOWN, "justification": "ok", "risks": []}
        },
        "self_consistency_contacts": {"contacts": [{"name": "Jean Dupont", "role": "décideur"}]},
        "self_consistency_plays": {"plays": []},
        # #O8 — un message vide malgré des contacts déclenche une reprise : la fixture rend un message.
        "bellum_messages": {"messages": [{"contact_name": "Jean Dupont", "email_message": "Bonjour"}]},
    }
    if overrides:
        base.update(overrides)

    async def dispatch(*_args, **kwargs):
        key = str(kwargs.get("prompt_name", "")).removeprefix("bellum_plan_")
        return _claude_return(base.get(key, {}))

    return dispatch


MOCK_PLAN_RESPONSE = {
    "actionPlan": {
        "strategy": "Multi-thread",
        "justification": "Approche multi-interlocuteurs pour maximiser les chances",
        "phases": [],
    },
    "offersToPropose": [],
    "evaluation": {
        "scoreBreakdown": GO_BREAKDOWN,
        "justification": "Bon potentiel avec signaux positifs",
        "risks": [],
        "quickWins": [],
    },
    "prioritySubAccounts": [],
}


def test_phase4_plan_calls_claude(client: TestClient) -> None:
    """Mock call_claude, verify it returns action plan."""
    with patch(
        "app.routers.phase4_plan.call_claude",
        new_callable=AsyncMock,
        side_effect=_plan_dispatch(),
    ) as mock_claude:
        res = client.post(
            "/phase/4/plan",
            json={
                "account_id": "abc-123",
                # Sourced facts (tags PUBLIC) + angles so the Quality-Judge gate is
                # a no-op here (this test asserts score FORMAT, not the gate — a
                # thin/unsourced dossier would legitimately degrade below GO).
                "account_data": {
                    "sector": "Transport",
                    "revenue": "1B€",
                    "sources": {"tags": {"sector": "PUBLIC", "revenue": "PUBLIC"}},
                    "angles": [{"angle": "Modernisation SI"}],
                },
                "contacts": [{"fullName": "Jean Dupont", "title": "DSI"}],
                "profile_data": {
                    "companyName": "MonESN",
                    "size": "50",
                    "offers": ["Cloud", "Data"],
                    "sectors": ["Transport"],
                    "personas": ["DSI", "CTO"],
                    "geoZone": "France",
                    "avgTJM": "650",
                    "salesCycle": "6 mois",
                    "salesTeamSize": "5",
                    "mainChallenge": "Grands comptes",
                    "references": ["SNCF", "RATP"],
                },
            },
        )

        assert res.status_code == 200
        body = res.json()
        assert body["status"] in ("success", "partial_success")
        assert body["data"]["actionPlan"]["strategy"] == "S"
        # Verdict is the deterministic band on the /25 score (GO_BREAKDOWN → 20 → GO).
        assert body["data"]["evaluation"]["verdict"] == "GO"
        assert body["data"]["evaluation"]["score"] == 20
        assert body["data"]["evaluation"]["goNoGo"] == "GO"  # legacy still populated
        assert mock_claude.call_count == PLAN_CALL_COUNT + SC_EXTRA_CALLS
        # Inspect the meta call (first) — it uses the BELLUM plan system prompt;
        # the last call is now bellum_messages with its own (non-BELLUM) prompt.
        call_args = mock_claude.call_args_list[0]
        assert "BELLUM" in call_args[0][0]
        assert "MonESN" in call_args[0][1]
        # Buying committee (Knowledge Pack v2) injected into the cached system
        # prompt so the plan targets the right member — the DSI contact surfaces as
        # a decider to convince.
        assert "COMITÉ D'ACHAT" in call_args[0][0]
        assert "Jean Dupont" in call_args[0][0]


def test_phase4_plan_names_the_target_decision_structure_from_its_naf(client: TestClient) -> None:
    """#3202.6 (épopée #3226) — l'archétype de la CIBLE (sur son NAF, même pont
    que `_search_item`/`chat_tools.py`, GA-26) influence désormais le plan :
    78.10Z (agence de placement, `intermediation.py`) résout CABINET_RECRUTEMENT,
    dont le mode de décision est DIRECT — nommé dans le prompt système, jamais
    fusionné avec le calibrage taille/secteur existant."""
    with patch(
        "app.routers.phase4_plan.call_claude",
        new_callable=AsyncMock,
        side_effect=_plan_dispatch(),
    ) as mock_claude:
        res = client.post(
            "/phase/4/plan",
            json={
                "account_id": "abc-123",
                "account_data": {
                    "sector": "Recrutement",
                    "nafCode": "78.10Z",
                    "sources": {"tags": {"sector": "PUBLIC"}},
                    "angles": [{"angle": "Modernisation SI"}],
                },
                "contacts": [{"fullName": "Jean Dupont", "title": "DSI"}],
                "profile_data": {"companyName": "Chasseurs de Talents", "size": "50"},
            },
        )

        assert res.status_code == 200
        call_args = mock_claude.call_args_list[0]
        system_prompt = call_args[0][0]
        assert "3202.6" in system_prompt
        assert "cabinet de recrutement" in system_prompt
        assert "directe" in system_prompt


def test_phase4_plan_names_no_decision_structure_without_a_naf(client: TestClient) -> None:
    """Sans NAF connu sur le compte, le bloc #3202.6 reste absent — jamais un
    mode de décision deviné pour combler la case."""
    with patch(
        "app.routers.phase4_plan.call_claude",
        new_callable=AsyncMock,
        side_effect=_plan_dispatch(),
    ) as mock_claude:
        res = client.post(
            "/phase/4/plan",
            json={
                "account_id": "abc-123",
                "account_data": {
                    "sector": "Transport",
                    "sources": {"tags": {"sector": "PUBLIC"}},
                    "angles": [{"angle": "Modernisation SI"}],
                },
                "contacts": [{"fullName": "Jean Dupont", "title": "DSI"}],
                "profile_data": {"companyName": "MonESN", "size": "50"},
            },
        )

        assert res.status_code == 200
        call_args = mock_claude.call_args_list[0]
        assert "3202.6" not in call_args[0][0]


def test_phase4_plan_lit_la_memoire_marche_angle_seulement(client: TestClient) -> None:
    """#1611.4 / #1611.5 — le plan ET les messages reçoivent l'angle renforcé
    par la mémoire marché, jamais le fait de mémoire marché lui-même (nom d'ESN
    observée, comptage de parcours)."""
    with (
        patch(
            "app.routers.phase4_plan.call_claude",
            new_callable=AsyncMock,
            side_effect=_plan_dispatch(),
        ) as mock_claude,
        patch(
            "app.routers.phase4_plan.bellum_api.market_memory_context_for",
            new_callable=AsyncMock,
            return_value={
                "status": "ok",
                "coverage": {
                    "covered": True,
                    "marketPaths": 12,
                    # Un nom d'ESN observée + un comptage de parcours, VOLONTAIREMENT
                    # présents dans la charge utile brute — pour prouver qu'ils
                    # n'atteignent NULLE PART un prompt.
                    "esnObserved": [{"esnName": "Sopra Steria", "persons": 8, "certainty": "forte"}],
                    "observedStack": ["java", "cloud"],
                    "roleFamilies": [{"family": "Data / IA", "persons": 6}],
                    "exEsnPresent": None,
                },
            },
        ),
    ):
        res = client.post(
            "/phase/4/plan",
            json={
                "account_id": "abc-123",
                "account_data": {
                    "sector": "Transport",
                    "sources": {"tags": {}},
                    "angles": [{"angle": "Modernisation SI"}],
                },
                "contacts": [{"fullName": "Jean Dupont", "title": "DSI"}],
                "profile_data": {
                    "companyName": "MonESN",
                    "offers": ["Cloud & Infrastructure"],
                },
            },
        )
        assert res.status_code == 200

        # Le prompt système du plan (1er appel) porte le bloc — l'angle nommé,
        # jamais le fait de mémoire marché.
        plan_system_prompt = mock_claude.call_args_list[0][0][0]
        assert "ENVIRONNEMENT TECHNIQUE OBSERVÉ" in plan_system_prompt
        assert "Cloud & Infrastructure" in plan_system_prompt
        assert "Sopra Steria" not in plan_system_prompt
        assert "Data / IA" not in plan_system_prompt

        # Le prompt des messages porte le MÊME angle, avec l'interdiction
        # absolue et le repli — jamais le fait brut. Retrouvé par son
        # `prompt_name` (l'ordre des appels concurrents n'est pas garanti).
        messages_call = next(
            call for call in mock_claude.call_args_list if call.kwargs.get("prompt_name") == "bellum_messages"
        )
        messages_user_prompt = messages_call[0][1]
        assert "SIGNAL STRUCTUREL" in messages_user_prompt
        assert "Cloud & Infrastructure" in messages_user_prompt
        assert "Contexte intéressant mais insuffisant" in messages_user_prompt
        assert "Sopra Steria" not in messages_user_prompt
        assert "Data / IA" not in messages_user_prompt


def test_phase4_plan_sans_corroboration_reste_byte_identique(client: TestClient) -> None:
    """Sans offre déclarée qui recoupe (ou sans couverture), le plan et les
    messages ne changent RIEN — aucun appel réseau n'est même tenté."""
    with (
        patch(
            "app.routers.phase4_plan.call_claude",
            new_callable=AsyncMock,
            side_effect=_plan_dispatch(),
        ) as mock_claude,
        patch(
            "app.routers.phase4_plan.bellum_api.market_memory_context_for",
            new_callable=AsyncMock,
        ) as market_memory_mock,
    ):
        res = client.post(
            "/phase/4/plan",
            json={
                "account_id": "abc-123",
                "account_data": {"sector": "Transport", "sources": {"tags": {}}},
                "contacts": [{"fullName": "Jean Dupont", "title": "DSI"}],
                "profile_data": {"companyName": "MonESN"},
            },
        )
        assert res.status_code == 200
        market_memory_mock.assert_not_called()
        plan_system_prompt = mock_claude.call_args_list[0][0][0]
        assert "ENVIRONNEMENT TECHNIQUE OBSERVÉ" not in plan_system_prompt


def test_action_plan_meta_gets_the_budget_its_answer_actually_needs(client: TestClient) -> None:
    """L'en-tête du plan ne doit pas être coupé en plein JSON.

    Mesuré en production le 16/08/2026 : à 1500 tokens,
    ``bellum_plan_action_plan_meta`` tronquait, l'appel était facturé puis jeté,
    et la reprise au budget doublé portait la phase 4 à 72 s au lieu de ~20 s.
    Le plafond retenu est celui qui a RÉUSSI cette reprise.
    """
    with patch(
        "app.routers.phase4_plan.call_claude",
        new_callable=AsyncMock,
        side_effect=_plan_dispatch(),
    ) as mock_claude:
        res = client.post(
            "/phase/4/plan",
            json={
                "account_id": "abc-123",
                "account_data": {
                    "sector": "Transport",
                    "sources": {"tags": {"sector": "PUBLIC"}},
                    "angles": [{"angle": "Modernisation SI"}],
                },
                "contacts": [{"fullName": "Jean Dupont", "title": "DSI"}],
                "profile_data": {"companyName": "MonESN", "offers": ["Cloud"]},
            },
        )

        assert res.status_code == 200
        budgets = {
            call.kwargs["prompt_name"]: call.kwargs["max_tokens"]
            for call in mock_claude.call_args_list
            if "prompt_name" in call.kwargs
        }
        assert budgets["bellum_plan_action_plan_meta"] == ACTION_PLAN_META_MAX_TOKENS
        # La valeur, pas seulement la constante : une constante qu'on rebaisserait
        # à 1500 rejouerait exactement la troncature qu'on vient de payer.
        assert ACTION_PLAN_META_MAX_TOKENS >= 3000
        assert budgets["bellum_plan_action_plan_phase_0"] == ACTION_PLAN_PHASE_MAX_TOKENS


_TRUNCATION_ACCOUNT_PAYLOAD = {
    "account_id": "abc-123",
    "account_data": {
        "sector": "Transport",
        "sources": {"tags": {"sector": "PUBLIC"}},
        "angles": [{"angle": "Modernisation SI"}],
    },
    "contacts": [{"fullName": "Jean Dupont", "title": "DSI"}],
    "profile_data": {"companyName": "MonESN", "offers": ["Cloud"]},
}


def test_action_plan_meta_truncation_degrades_to_partial_success(client: TestClient) -> None:
    """#2501 — l'en-tête du plan tronque encore et encore : la production a
    montré (17/09) que le correctif du 16/08 (1500→3000 tokens) ne suffit pas
    toujours, et qu'une troncature qui survit au doublement automatique de
    ``claude_service`` (jusqu'à ``TRUNCATION_RETRY_CAP``) faisait échouer
    TOUTE l'analyse avec le texte brut d'``InstructorRetryException`` en
    bandeau — alors que recherche/contacts/classify avaient déjà réussi.

    Prouve : (a) UNE reprise, jamais une boucle ; (b) succès partiel nommé
    (le dossier part quand même) ; (c) le message montré est la phrase
    FRANÇAISE écrite pour l'humain, jamais le texte brut de l'exception.
    """
    meta_calls = {"n": 0}
    base_dispatch = _plan_dispatch()

    async def dispatch(*args, **kwargs):
        if kwargs.get("prompt_name") == "bellum_plan_action_plan_meta":
            meta_calls["n"] += 1
            raise ClaudeIncompleteOutputError(
                prompt_name="bellum_plan_action_plan_meta",
                model="claude-sonnet-5",
                max_tokens=3000,
            )
        return await base_dispatch(*args, **kwargs)

    with patch(
        "app.routers.phase4_plan.call_claude",
        new_callable=AsyncMock,
        side_effect=dispatch,
    ):
        res = client.post("/phase/4/plan", json=_TRUNCATION_ACCOUNT_PAYLOAD)

    assert res.status_code == 200
    body = res.json()
    # (a) reprise UNIQUE : exactement 2 tentatives sur cette section (l'appel
    # initial + LA reprise), jamais une boucle qui redoublerait indéfiniment.
    assert meta_calls["n"] == 2
    # (b) succès partiel NOMMÉ : le dossier part quand même, jamais un run
    # marqué en échec parce qu'une seule section a tronqué deux fois.
    assert body["status"] == "partial_success"
    assert body["data"]["actionPlan"]["strategy"] == ""
    # (c) message TRADUIT — jamais le texte brut vu par Louis en production.
    warnings = body["meta"]["warnings"]
    assert len(warnings) == 1
    assert warnings[0]["code"] == "PLAN_SECTION_TRUNCATED"
    assert "tronqu" in warnings[0]["message"].lower()
    assert "InstructorRetryException" not in warnings[0]["message"]
    assert "incomplete due to a max_tokens" not in warnings[0]["message"]


def test_action_plan_meta_truncation_recovers_on_the_single_retry(client: TestClient) -> None:
    """Quand la reprise concise réussit, aucune trace de dégradation ne
    reste — seule une troncature qui PERSISTE déclenche le succès partiel."""
    meta_calls = {"n": 0}
    base_dispatch = _plan_dispatch()

    async def dispatch(*args, **kwargs):
        if kwargs.get("prompt_name") == "bellum_plan_action_plan_meta":
            meta_calls["n"] += 1
            if meta_calls["n"] == 1:
                raise ClaudeIncompleteOutputError(
                    prompt_name="bellum_plan_action_plan_meta",
                    model="claude-sonnet-5",
                    max_tokens=3000,
                )
        return await base_dispatch(*args, **kwargs)

    with patch(
        "app.routers.phase4_plan.call_claude",
        new_callable=AsyncMock,
        side_effect=dispatch,
    ):
        res = client.post("/phase/4/plan", json=_TRUNCATION_ACCOUNT_PAYLOAD)

    assert res.status_code == 200
    body = res.json()
    assert meta_calls["n"] == 2
    assert body["status"] == "success"
    assert body["data"]["actionPlan"]["strategy"] == "S"
    assert body["meta"].get("warnings") is None


def test_phase4_plan_returns_terminal_failure_on_claude_error(client: TestClient) -> None:
    """An unexpected error surfaces as a terminal_failure envelope (HTTP 500)."""
    with patch(
        "app.routers.phase4_plan.call_claude",
        new_callable=AsyncMock,
        side_effect=ValueError("Claude API error: status=500"),
    ):
        res = client.post(
            "/phase/4/plan",
            json={
                "account_id": "abc-123",
                "account_data": {"sector": "Transport"},
                "contacts": [],
                "profile_data": {"companyName": "MonESN"},
            },
        )

        assert res.status_code == 500
        body = res.json()
        assert body["status"] == "terminal_failure"
        assert "Claude API error" in body["error"]["debug_message"]


def test_phase4_plan_with_empty_contacts(client: TestClient) -> None:
    mock_result = {
        "actionPlan": {"strategy": "Prospection", "justification": "No contacts", "phases": []},
        "offersToPropose": [],
        "evaluation": {"scoreBreakdown": STOP_BREAKDOWN},
        "prioritySubAccounts": [],
    }
    with patch("app.routers.phase4_plan.call_claude", new_callable=AsyncMock, return_value=_claude_return(mock_result)):
        res = client.post(
            "/phase/4/plan",
            json={"account_id": "abc", "account_data": {"sector": "Transport"}, "contacts": []},
        )
    assert res.status_code == 200
    ev = res.json()["data"]["evaluation"]
    assert ev["verdict"] == "STOP"  # STOP_BREAKDOWN → 6 → STOP
    assert ev["goNoGo"] == "NO-GO"  # legacy


def test_phase4_plan_evaluation_format(client: TestClient) -> None:
    mock_result = {
        "actionPlan": {"strategy": "Multi-thread"},
        "offersToPropose": [
            {"title": "Data", "pitch": "...", "targetContact": "Jean", "painAddressed": "Modernisation"}
        ],
        "evaluation": {
            "scoreBreakdown": GO_BREAKDOWN,
            "justification": "Fort potentiel",
            "risks": [{"risk": "Concurrence"}],
            "quickWins": ["Ref call"],
        },
        "prioritySubAccounts": [],
        "messages": [{"contactName": "Jean", "linkedinMessage": "Bonjour Jean"}],
    }
    with patch("app.routers.phase4_plan.call_claude", new_callable=AsyncMock, return_value=_claude_return(mock_result)):
        # contacts + angles + messages = 3 core deliverables, so the Quality-Judge
        # gate is a no-op (this test asserts score FORMAT + reconciliation, not the gate).
        res = client.post(
            "/phase/4/plan",
            json={
                "account_id": "abc",
                "account_data": {"company_name": "SNCF", "angles": [{"angle": "Cloud"}]},
                "contacts": [{"fullName": "Jean Dupont", "title": "DSI"}],
            },
        )
    data = res.json()["data"]
    assert data["evaluation"]["score"] == 20
    assert data["evaluation"]["verdict"] == "GO"
    # Breakdown axes are backfilled with their max + label from the canonical grid.
    axis0 = data["evaluation"]["scoreBreakdown"][0]
    assert axis0["axis"] == "fit_offre" and axis0["points"] == 5 and axis0["max"] == 5
    assert axis0["label"] == "Fit — problèmes et offres compatibles"
    assert len(data["evaluation"]["risks"]) == 1
    assert len(data["offersToPropose"]) == 1
    # Score reconciliation (§1): the canonical /25 (=20, GO floor) drives the /10
    # priorityScore band-faithfully (GO → 7) + mirrors the justification, so the
    # persisted column can't contradict the verdict.
    assert data["priorityScore"] == 7
    assert data["priorityJustification"] == "Fort potentiel"
    # plays (§5) are assembled and present (empty here — no perimeters in input).
    assert "plays" in data


def test_phase4_plan_quality_gate_degrades_thin_dossier(client: TestClient) -> None:
    """End-to-end proof of the gate (Théo §6/§7): a GO /25 breakdown on a dossier
    the Quality-Judge marks trop_faible (no contacts / angles / messages) must NOT
    ship a GO — it degrades to EXPLORER (données manquantes → collecter l'info),
    and the score and persisted priorityScore all degrade with it."""
    mock_result = {
        "actionPlan": {"strategy": "S"},
        "offersToPropose": [],
        "evaluation": {"scoreBreakdown": GO_BREAKDOWN},
        "prioritySubAccounts": [],
    }
    with patch("app.routers.phase4_plan.call_claude", new_callable=AsyncMock, return_value=_claude_return(mock_result)):
        res = client.post(
            "/phase/4/plan", json={"account_id": "abc", "account_data": {"company_name": "SNCF"}, "contacts": []}
        )
    data = res.json()["data"]
    # GO 20 → trop_faible = données manquantes → cap 13 + EXPLORER (potentiel ≥10).
    assert data["evaluation"]["verdict"] == "EXPLORER"
    assert data["evaluation"]["score"] == 13
    assert data["evaluation"]["qualityCapped"] is True
    assert data["evaluation"]["qualityCapReason"] == "trop_faible"
    # The persisted priorityScore band-follows the capped score (13 → 1-4, not 7).
    assert data["priorityScore"] < 5


# #1925 — la même paire de quick wins et le même dossier SNCF servent au test du
# routeur et aux tests de `_next_best_action`.
_GENERIC_QUICK_WIN = {
    "action": "Contacter les décideurs IT avec un message personnalisé.",
    "contact": "",
    "channel": "email",
}
_SPECIFIC_QUICK_WIN = {
    "action": "Écrire à Jean Dupont chez SNCF Voyageurs sur le recrutement de mars 2026.",
    "contact": "Jean Dupont",
    "channel": "linkedin",
}
_SNCF_ACCOUNT_DATA = {
    "company_name": "SNCF",
    "recentSignals": [{"signal": "Recrutement 50 data engineers", "date": "Mars 2026", "source": "France Travail"}],
}
_SNCF_CONTACTS = [{"fullName": "Jean Dupont", "title": "DSI", "entity": "SNCF Voyageurs"}]
_SNCF_REGISTRY = registry_from_inputs(profile={}, research=_SNCF_ACCOUNT_DATA, contacts=_SNCF_CONTACTS)


def test_phase4_plan_next_best_action_is_judged_on_the_request_data(client: TestClient) -> None:
    """#1925 — le validateur est APPELÉ par le routeur, sur les données de la
    requête : la quick win interchangeable en tête cède la place à celle qui cite
    le contact, l'entité et le signal daté du dossier, et le verdict voyage avec."""
    mock_result = {
        "actionPlan": {"strategy": "S"},
        "offersToPropose": [],
        "evaluation": {"scoreBreakdown": GO_BREAKDOWN},
        "prioritySubAccounts": [],
        "quick_wins": [_GENERIC_QUICK_WIN, _SPECIFIC_QUICK_WIN],
    }
    with patch("app.routers.phase4_plan.call_claude", new_callable=AsyncMock, return_value=_claude_return(mock_result)):
        res = client.post(
            "/phase/4/plan",
            json={"account_id": "abc", "account_data": _SNCF_ACCOUNT_DATA, "contacts": _SNCF_CONTACTS},
        )
    nba = res.json()["data"]["nextBestAction"]
    assert nba["contact"] == "Jean Dupont"
    assert nba["specificity"]["status"] == "specifique"


# === Horizons 7/30/60/90 des next-actions (annexe méthodo p27) ===============

_SALES_CONTEXT = {
    "salesContextVersion": 1,
    "esnProfile": {"stage": "etablie"},
    "account": {"archetype": "grand_groupe"},
    "relationship": {"state": "client_actif"},
}


def _plan_with(client: TestClient, account_data: dict) -> dict:
    mock_result = {
        "actionPlan": {"strategy": "S"},
        "offersToPropose": [],
        "evaluation": {"scoreBreakdown": GO_BREAKDOWN},
        "prioritySubAccounts": [],
    }
    with patch("app.routers.phase4_plan.call_claude", new_callable=AsyncMock, return_value=_claude_return(mock_result)):
        res = client.post("/phase/4/plan", json={"account_id": "abc", "account_data": account_data, "contacts": []})
    assert res.status_code == 200
    return res.json()["data"]


def test_next_actions_carry_their_horizon_and_a_grouped_view(client: TestClient) -> None:
    """Le commercial voyait une liste plate : les horizons p27 étaient calculés
    sans consommateur. Chaque action porte désormais son échéance, et le plan
    livre la même liste rangée 7j → 30j → 60j → 90j."""
    data = _plan_with(client, {"company_name": "SNCF", "salesContext": _SALES_CONTEXT})

    actions = data["nextActions"]
    assert actions and all(a["horizon"] in ("7j", "30j", "60j", "90j") for a in actions)

    grouped = data["nextActionsByHorizon"]
    # Ordre des buckets = ordre des échéances, buckets vides omis (pas de section creuse).
    assert list(grouped) == [h for h in ("7j", "30j", "60j", "90j") if h in grouped]
    assert all(bucket for bucket in grouped.values())
    # Aucune action perdue ni inventée par le regroupement.
    assert sum(len(bucket) for bucket in grouped.values()) == len(actions)
    for horizon, bucket in grouped.items():
        assert [a["id"] for a in bucket] == [a["id"] for a in actions if a["horizon"] == horizon]


def test_a_dossier_without_sales_context_emits_no_horizon_view(client: TestClient) -> None:
    """Byte-identité : sans SalesContext (dossier ancien / phase 1 muette), le
    plan ne porte ni actions déterministes ni vue par horizon — comme avant."""
    data = _plan_with(client, {"company_name": "SNCF"})

    assert data["nextActions"] == []
    assert data["nextActionsByHorizon"] == {}


def test_a_positive_rex_names_the_expansion_track_in_the_plan(client: TestClient) -> None:
    """#2424.10 — câblage restant : `hasPositiveRex` était lu depuis
    `salesContext.account`, jamais ÉMIS nulle part, donc toujours faux en
    pratique. Le plan le lit maintenant en LIVE (`bellum_api.has_positive_rex`,
    best-effort) et le nom de la piste d'expansion en dépend vraiment."""
    with patch(
        "app.routers.phase4_plan.bellum_api.has_positive_rex",
        new_callable=AsyncMock,
        return_value=True,
    ):
        data = _plan_with(client, {"company_name": "SNCF", "salesContext": _SALES_CONTEXT})

    ids = [a["id"] for a in data["nextActions"]]
    assert "expansion_rex_positif" in ids
    assert "foisonner_bu" not in ids


def test_without_a_reachable_rex_signal_the_generic_action_still_leads(client: TestClient) -> None:
    """Témoin : une lecture REX indisponible (pont en panne, pas de compte)
    retombe sur le comportement d'AVANT — jamais un signal deviné."""
    with patch(
        "app.routers.phase4_plan.bellum_api.has_positive_rex",
        new_callable=AsyncMock,
        return_value=False,
    ):
        data = _plan_with(client, {"company_name": "SNCF", "salesContext": _SALES_CONTEXT})

    ids = [a["id"] for a in data["nextActions"]]
    assert "expansion_rex_positif" not in ids
    assert "foisonner_bu" in ids


# === _trim_account_data ===


class TestTrimAccountData:
    def test_keeps_whitelisted_keys(self) -> None:
        result = _trim_account_data(
            {
                "sector": "Transport",
                "revenue": "1B€",
                "priorityScore": 8,
                "angles": [{"angle": "Cloud migration"}],
            }
        )
        assert result == {
            "sector": "Transport",
            "revenue": "1B€",
            "priorityScore": 8,
            "angles": [{"angle": "Cloud migration"}],
        }

    def test_drops_non_whitelisted_keys(self) -> None:
        """The full Phase-1 dump carries fields useful only to Phase 2/3
        (LinkedIn keywords, organigramme logic, raw API metrics, etc.).
        They must not leak into BELLUM-PLAN — that's the regression that
        pushed Orange past Claude's 200k input ceiling."""
        result = _trim_account_data(
            {
                "sector": "Transport",
                "linkedinSearchKeywords": {"big": "blob"},
                "organigrammeLogic": "long text…",
                "_api_metrics": {"firecrawl_urls_scraped": ["a"] * 200},
                "sitesFrance": [{"site": s} for s in range(80)],
                "technologyStack": ["a"] * 50,
            }
        )
        assert "sector" in result
        assert "linkedinSearchKeywords" not in result
        assert "organigrammeLogic" not in result
        assert "_api_metrics" not in result
        assert "sitesFrance" not in result
        assert "technologyStack" not in result

    def test_caps_heavy_lists(self) -> None:
        result = _trim_account_data(
            {
                "entitiesExhaustive": [{"i": i} for i in range(50)],
                "recentSignals": [{"i": i} for i in range(50)],
                "peopleMentioned": [{"i": i} for i in range(50)],
            }
        )
        # Tightened caps — this block is re-read ~11× as cache-read, so every
        # dropped item saves ~11× its tokens.
        assert len(result["entitiesExhaustive"]) == 8
        assert len(result["recentSignals"]) == 6
        assert len(result["peopleMentioned"]) == 8
        # Cap preserves the leading items (Phase 1 sorts by relevance).
        assert result["entitiesExhaustive"][0] == {"i": 0}

    def test_priority_perimeters_pass_through_capped(self) -> None:
        # B.1: the plan builds its roadmap on the scored perimeters (max 4 zones).
        result = _trim_account_data({"priorityPerimeters": [{"name": f"BU{i}"} for i in range(6)]})
        assert len(result["priorityPerimeters"]) == 4

    def test_short_lists_pass_through(self) -> None:
        result = _trim_account_data({"competitors": [{"name": "Sopra"}, {"name": "Capgemini"}]})
        assert result["competitors"] == [{"name": "Sopra"}, {"name": "Capgemini"}]

    def test_empty_input(self) -> None:
        assert _trim_account_data({}) == {}


# === _next_best_action (output-contract object) ===


class TestNextBestAction:
    def test_prefers_the_top_quick_win(self) -> None:
        data = {
            "quick_wins": [{"action": "Envoyer LinkedIn à Jean", "contact": "Jean", "channel": "linkedin"}],
            "actionPlan": {"phases": [{"actions": [{"action": "autre"}]}]},
        }
        assert _next_best_action(data) == {
            "action": "Envoyer LinkedIn à Jean",
            "contact": "Jean",
            "channel": "linkedin",
        }

    def test_falls_back_to_first_immediate_action(self) -> None:
        data = {
            "quick_wins": [],
            "actionPlan": {
                "phases": [{"actions": [{"action": "Appeler le DSI", "contact": "DSI", "channel": "phone"}]}]
            },
        }
        assert _next_best_action(data) == {"action": "Appeler le DSI", "contact": "DSI", "channel": "phone"}

    def test_returns_none_when_nothing_actionable(self) -> None:
        assert _next_best_action({}) is None
        assert _next_best_action({"quick_wins": [], "actionPlan": {"phases": []}}) is None

    # #1925 — la prochaine action affichée en tête de dossier ne doit pas être la
    # plus interchangeable des candidates quand une plus spécifique existe.
    def test_prefers_the_first_specific_candidate_over_a_generic_top_quick_win(self) -> None:
        nba = _next_best_action({"quick_wins": [_GENERIC_QUICK_WIN, _SPECIFIC_QUICK_WIN]}, _SNCF_REGISTRY)
        assert nba["contact"] == "Jean Dupont"
        assert nba["specificity"]["status"] == "specifique"
        assert {e["kind"] for e in nba["specificity"]["elements"]} == {
            "dated_signal",
            "precise_entity",
            "precise_contact",
        }

    def test_keeps_the_first_candidate_flagged_when_none_is_specific(self) -> None:
        data = {
            "quick_wins": [{"action": "Contacter les décideurs IT.", "contact": "", "channel": "email"}],
            "actionPlan": {
                "phases": [{"actions": [{"action": "Surveiller l'actualité.", "contact": "", "channel": "content"}]}]
            },
        }
        nba = _next_best_action(data, _SNCF_REGISTRY)
        assert nba["action"] == "Contacter les décideurs IT."
        assert nba["specificity"]["status"] == "generique"

    def test_the_immediate_phase_action_can_win_when_it_is_the_only_specific_one(self) -> None:
        data = {
            "quick_wins": [{"action": "Contacter les décideurs IT.", "contact": "", "channel": "email"}],
            "actionPlan": {
                "phases": [
                    {
                        "actions": [
                            {
                                "action": "Appeler Jean Dupont (SNCF Voyageurs).",
                                "contact": "Jean Dupont",
                                "channel": "phone",
                            }
                        ]
                    }
                ]
            },
        }
        assert _next_best_action(data, _SNCF_REGISTRY)["channel"] == "phone"


class TestExecutiveSummary:
    def test_assembles_decisional_5_liner(self) -> None:
        data = {
            "evaluation": {"verdict": "PRUDENT", "score": 16, "justification": "Bon potentiel, référencement lourd."},
            "nextBestAction": {"action": "Envoyer LinkedIn à Mehdi"},
        }
        account = {"company_name": "Société Générale", "angles": [{"title": "Industrialisation IA/ML"}]}
        contacts = [{"fullName": "Mehdi"}]
        lines = _executive_summary(data, account, contacts)
        assert lines[0] == "Société Générale — verdict PRUDENT (16/25)."
        assert any("Mehdi" in line for line in lines)
        assert any("Industrialisation" in line for line in lines)
        assert len(lines) <= 5

    def test_degrades_gracefully_with_empty_inputs(self) -> None:
        lines = _executive_summary({}, {}, [])
        assert lines and "UNKNOWN" in lines[0]


class TestPlays:
    _PLAY_KEYS = {
        "perimeter",
        "tier",
        "painSignal",
        "esnOffer",
        "targetContact",
        "targetContactRole",
        "angle",
        "firstAction",
        "evidenceLevel",
        "risk",
        # C1 (Théo §3): the play chains through to the ready-to-send message.
        "readyMessage",
        "readyMessageChannel",
        # SalesConnect (roadmap §14): the cited proof + the completeness verdict.
        "preuve",
        "completeness",
    }

    def _account(self) -> dict:
        return {
            "priorityPerimeters": [
                {
                    "name": "VINCI Energies",
                    "tier": "P1",
                    "why": "18/20",
                    "confidence": "medium",
                    "whatToSell": ["DevOps"],
                },
                {"name": "VINCI Construction", "tier": "P1", "why": "18/20", "whatToSell": ["Data chantier"]},
                {"name": "ASF", "tier": "P1", "why": "14/20"},
                {"name": "VINCI", "tier": "P2", "why": "11/20"},  # 4th — must be dropped (max 3)
            ],
            "angles": [
                {"title": "Plateforme SI cross-métiers"},
                {"title": "Usine logicielle DevOps VINCI Construction"},
                {"title": "Data chantier temps réel"},
            ],
            "esn_rules": {"offers": ["DevOps, SRE"]},
            "pains": [{"pain": "SI fragmenté entre 3 métiers"}],
        }

    def _data(self) -> dict:
        return {
            "evaluation": {"risks": [{"risk": "Compte trop grand pour l'ESN"}]},
            "quick_wins": [{"action": "LinkedIn à Remi"}],
            "nextBestAction": {"action": "LinkedIn à Remi"},
        }

    def test_builds_at_most_three_plays_with_all_eight_components(self) -> None:
        # Real IA contact shape: fullName + role (not decisionRole) + priority
        # (1 = best), matched to a perimeter by entity.
        contacts = [
            {"fullName": "Julien", "entity": "VINCI Energies", "role": "technical", "priority": 2},
            {"fullName": "Sophie", "entity": "VINCI Energies", "role": "economic", "priority": 1},
            {"fullName": "Ivan", "entity": "VINCI Construction", "role": "technical", "priority": 1},
        ]
        plays = _plays(self._data(), self._account(), contacts)
        assert len(plays) == 3  # capped at 3 even though 4 perimeters exist (§5)
        for p in plays:
            assert set(p.keys()) >= self._PLAY_KEYS
        energies = next(p for p in plays if p["perimeter"] == "VINCI Energies")
        # Best-PRIORITY contact in the entity wins (Sophie prio 1, not Julien prio 2).
        assert energies["targetContact"] == "Sophie"
        # Role is read from the real `role` field — not the always-null decisionRole.
        assert energies["targetContactRole"] == "economic"
        assert energies["esnOffer"] == "DevOps"
        assert energies["risk"] == "Compte trop grand pour l'ESN"

    def test_contact_is_not_borrowed_from_another_bu(self) -> None:
        # A perimeter with no contact in its own entity must NOT grab a contact
        # from a different BU — that would assert a false target (§8).
        account = {"priorityPerimeters": [{"name": "VINCI Airports", "tier": "P1"}]}
        contacts = [{"fullName": "Ivan", "entity": "VINCI Construction", "role": "technical", "priority": 1}]
        plays = _plays({}, account, contacts)
        assert plays[0]["targetContact"] == "à identifier"
        assert plays[0]["targetContactRole"] is None

    def test_bare_group_name_does_not_grab_every_bu_contact(self) -> None:
        # Perimeter "VINCI" (1 token) must not match "VINCI Energies" contacts.
        account = {"priorityPerimeters": [{"name": "VINCI", "tier": "P2"}]}
        contacts = [{"fullName": "Julien", "entity": "VINCI Energies", "role": "technical", "priority": 1}]
        plays = _plays({}, account, contacts)
        assert plays[0]["targetContact"] == "à identifier"

    def test_accent_insensitive_binding(self) -> None:
        # "VINCI Énergies" (accent) contact must bind the "VINCI Energies" perimeter.
        account = {"priorityPerimeters": [{"name": "VINCI Energies", "tier": "P1"}]}
        contacts = [{"fullName": "Julien", "entity": "VINCI Énergies", "role": "technical", "priority": 1}]
        assert _plays({}, account, contacts)[0]["targetContact"] == "Julien"

    def test_group_level_contact_is_a_fallback(self) -> None:
        # Common case: one group-level Apollo search → contact tagged just "VINCI".
        # It binds the "VINCI Construction" perimeter as a fallback (shared parent),
        # instead of a bogus "à identifier" on a contact-rich dossier.
        account = {"priorityPerimeters": [{"name": "VINCI Construction", "tier": "P1"}]}
        contacts = [{"fullName": "Ivan", "entity": "VINCI", "role": "technical", "priority": 1}]
        assert _plays({}, account, contacts)[0]["targetContact"] == "Ivan"

    def test_missing_pieces_are_explicit_not_fabricated(self) -> None:
        # 70% rule (§6) + no fictional data (§8): unknown components read as
        # "à qualifier"/"à identifier", never invented.
        account = {"priorityPerimeters": [{"name": "BU X", "tier": "P1"}]}
        plays = _plays({}, account, [])
        assert len(plays) == 1
        play = plays[0]
        assert play["targetContact"] == "à identifier"
        assert play["esnOffer"] == "à qualifier"
        assert play["angle"] == "à définir"

    def test_no_perimeters_yields_no_plays(self) -> None:
        assert _plays({}, {}, []) == []

    def test_unsourced_offer_falls_back_to_esn_offer(self) -> None:
        # A homonym entity's whatToSell reads as its own description ("Non
        # identifié dans les sources — …"), not an ESN offer → fall back to the
        # ESN's real offer instead of surfacing the garbage.
        account = {
            "priorityPerimeters": [
                {
                    "name": "VINCI Technologies",
                    "tier": "P1",
                    "whatToSell": ["Non identifié dans les sources — instrumentation"],
                }
            ],
            "esn_rules": {"offers": ["DevOps, SRE & Automatisation"]},
        }
        play = _plays({}, account, [])[0]
        assert play["esnOffer"] == "DevOps, SRE & Automatisation"

    # ── C1 : join the ready-to-send message onto the play (Théo §3 — a play is
    #    coherent end-to-end only if it chains perimeter → signal → contact →
    #    action → MESSAGE. The message the pipeline already generates for the
    #    play's target contact is surfaced ON the play, not left orphaned).
    def test_play_carries_ready_message_for_its_target_contact(self) -> None:
        account = {"priorityPerimeters": [{"name": "VINCI Energies", "tier": "P1", "whatToSell": ["DevOps"]}]}
        contacts = [{"fullName": "Sophie Martin", "entity": "VINCI Energies", "role": "economic", "priority": 1}]
        messages = [
            {
                "contactName": "Sophie Martin",
                "linkedinMessage": "Bonjour Sophie, vu votre…",
                "emailBody": "e",
                "phoneOpener": "p",
            }
        ]
        play = _plays({}, account, contacts, messages)[0]
        assert play["targetContact"] == "Sophie Martin"
        assert play["readyMessage"] == "Bonjour Sophie, vu votre…"
        assert play["readyMessageChannel"] == "linkedin"

    def test_ready_message_matches_contact_name_accent_and_case_blind(self) -> None:
        # Same name-normalisation the API worker uses to bind messages to contacts.
        account = {"priorityPerimeters": [{"name": "VINCI Energies", "tier": "P1"}]}
        contacts = [{"fullName": "Rémi Écho", "entity": "VINCI Energies", "role": "technical", "priority": 1}]
        play = _plays({}, account, contacts, [{"contactName": "remi echo", "emailBody": "Bonjour Rémi"}])[0]
        assert play["readyMessage"] == "Bonjour Rémi"
        assert play["readyMessageChannel"] == "email"

    def test_ready_message_channel_preference_linkedin_email_phone(self) -> None:
        account = {"priorityPerimeters": [{"name": "BU X", "tier": "P1"}]}
        contacts = [{"fullName": "A", "entity": "BU X", "role": "user", "priority": 1}]
        # Only a phone opener present → phone is the fallback channel.
        play = _plays({}, account, contacts, [{"contactName": "A", "linkedinMessage": "", "phoneOpener": "Allô A"}])[0]
        assert play["readyMessage"] == "Allô A"
        assert play["readyMessageChannel"] == "phone"

    def test_ready_message_is_none_not_fabricated(self) -> None:
        # 70% rule (§6) + no fictional data (§8): no target contact, or no message
        # for the bound contact → readyMessage is explicitly None.
        account = {"priorityPerimeters": [{"name": "BU X", "tier": "P1"}]}
        p_no_contact = _plays({}, account, [], [{"contactName": "Ghost", "linkedinMessage": "x"}])[0]
        assert p_no_contact["targetContact"] == "à identifier"
        assert p_no_contact["readyMessage"] is None
        assert p_no_contact["readyMessageChannel"] is None
        contacts = [{"fullName": "A", "entity": "BU X", "role": "user", "priority": 1}]
        p_no_match = _plays({}, account, contacts, [{"contactName": "Other", "linkedinMessage": "x"}])[0]
        assert p_no_match["readyMessage"] is None

    def test_messages_param_is_optional_backward_compatible(self) -> None:
        account = {"priorityPerimeters": [{"name": "BU X", "tier": "P1"}]}
        contacts = [{"fullName": "A", "entity": "BU X", "role": "user", "priority": 1}]
        play = _plays({}, account, contacts)[0]  # no messages argument at all
        assert play["readyMessage"] is None
        assert play["readyMessageChannel"] is None

    # ── C2 : bind signal / action / risk to the perimeter by NAME, not by list
    #    position — a pain that names "Construction" lands on the Construction
    #    play even if it isn't pains[0] (positional binding was the coherence gap).
    def test_signal_binds_to_perimeter_by_name_not_index(self) -> None:
        account = {
            "priorityPerimeters": [
                {"name": "VINCI Energies", "tier": "P1"},
                {"name": "VINCI Construction", "tier": "P1"},
            ],
            "pains": [
                {"pain": "Chantiers Construction : données terrain non consolidées"},
                {"pain": "Energies : plateforme DevOps hétérogène entre entités"},
            ],
        }
        plays = _plays({}, account, [])
        energies = next(p for p in plays if p["perimeter"] == "VINCI Energies")
        construction = next(p for p in plays if p["perimeter"] == "VINCI Construction")
        assert "Energies" in energies["painSignal"]  # not pains[0]
        assert "Construction" in construction["painSignal"]

    def test_play_prefers_a_real_source_over_a_weak_reconstructed_one(self) -> None:
        # Théo #2 : ne pas bâtir un play sur une source faible. An ia_reconstruction
        # contact loses to a real-source (apollo) contact even if better-prioritised.
        account = {"priorityPerimeters": [{"name": "VINCI Energies", "tier": "P1"}]}
        contacts = [
            {
                "fullName": "Fantome",
                "entity": "VINCI Energies",
                "role": "economic",
                "priority": 1,
                "source": "ia_reconstruction",
            },
            {"fullName": "Reelle", "entity": "VINCI Energies", "role": "technical", "priority": 2, "source": "apollo"},
        ]
        assert _plays({}, account, contacts)[0]["targetContact"] == "Reelle"

    def test_play_still_uses_a_weak_source_when_nothing_better(self) -> None:
        # A weak-source contact is not dropped outright — it's the last resort.
        account = {"priorityPerimeters": [{"name": "VINCI Energies", "tier": "P1"}]}
        contacts = [
            {
                "fullName": "Fantome",
                "entity": "VINCI Energies",
                "role": "economic",
                "priority": 1,
                "source": "ia_reconstruction",
            }
        ]
        assert _plays({}, account, contacts)[0]["targetContact"] == "Fantome"

    def test_signal_falls_back_to_index_when_no_name_match(self) -> None:
        # No pain names a perimeter → keep the positional behaviour (3 distinct
        # pains across 3 plays), no regression.
        account = {
            "priorityPerimeters": [{"name": "BU A", "tier": "P1"}, {"name": "BU B", "tier": "P1"}],
            "pains": [{"pain": "Douleur générique un"}, {"pain": "Douleur générique deux"}],
        }
        plays = _plays({}, account, [])
        assert plays[0]["painSignal"] == "Douleur générique un"
        assert plays[1]["painSignal"] == "Douleur générique deux"

    def test_shared_parent_token_does_not_collapse_plays(self) -> None:
        # Review fix: the parent token "vinci" is shared by both perimeters, so it
        # must NOT drive the match — a parent-level pain would otherwise bind every
        # play to the same item. Plays keep distinct signals.
        account = {
            "priorityPerimeters": [
                {"name": "VINCI Energies", "tier": "P1"},
                {"name": "VINCI Construction", "tier": "P1"},
            ],
            "pains": [{"pain": "Le SI du groupe VINCI est fragmenté"}, {"pain": "Chantiers en retard faute d'outils"}],
        }
        plays = _plays({}, account, [])
        assert plays[0]["painSignal"] != plays[1]["painSignal"]  # not both pain[0]

    def test_empty_named_contact_does_not_crash_play_validation(self) -> None:
        # Review fix: a contact matching the perimeter but with an empty name made
        # targetContact=None and crashed Play.model_validate. Now it falls back.
        account = {"priorityPerimeters": [{"name": "VINCI Energies", "tier": "P1"}]}
        contacts = [{"entity": "VINCI Energies", "fullName": "", "priority": 1}]
        play = _plays({}, account, contacts)[0]  # must not raise
        assert play["targetContact"] == "à identifier"

    # ── SalesConnect (roadmap §14): every reco carries a cited `preuve` and a
    #    completeness verdict — signal/preuve/contact/action/message/risque, and a
    #    play whose signal has no real source is flagged faible, never fabricated.
    def _full_account(self) -> dict:
        return {
            "priorityPerimeters": [{"name": "VINCI Energies", "tier": "P1", "whatToSell": ["DevOps"]}],
            "angles": [{"title": "Usine logicielle"}],
            "pains": [{"pain": "Recrutement massif data"}],
            "recentSignals": [
                {
                    "signal": "VINCI Energies recrute 12 profils data",
                    "source": "France Travail",
                    "date": "2026-06",
                    "type": "budget",
                }
            ],
        }

    def test_play_carries_founded_preuve_from_a_real_sourced_signal(self) -> None:
        contacts = [
            {"fullName": "Sophie", "entity": "VINCI Energies", "role": "economic", "priority": 1, "source": "apollo"}
        ]
        messages = [{"contactName": "Sophie", "linkedinMessage": "Bonjour Sophie"}]
        play = _plays(
            {"evaluation": {"risks": [{"risk": "Cycle long"}]}, "quick_wins": [{"action": "LinkedIn à Sophie"}]},
            self._full_account(),
            contacts,
            messages,
        )[0]
        # preuve is tied to the REAL source (never fabricated) + carries provenance.
        assert play["preuve"]["source"] == "France Travail"
        assert play["preuve"]["date"] == "2026-06"
        assert play["preuve"]["weak"] is False
        # All 6 SalesConnect fields are present → the play is complete/actionnable.
        c = play["completeness"]
        assert c["status"] == "complete"
        assert c["missing"] == []
        assert c["hasFoundedEvidence"] is True

    def test_play_without_sourced_signal_is_flagged_faible_not_fabricated(self) -> None:
        # No recentSignals/budgetSignals → no real source to cite → preuve is None
        # (honest, §8) and the play is marked faible, not dropped.
        account = {"priorityPerimeters": [{"name": "BU X", "tier": "P1"}]}
        play = _plays({}, account, [])[0]
        assert play["preuve"] is None
        assert play["completeness"]["status"] == "faible"
        assert "preuve" in play["completeness"]["missing"]
        assert play["completeness"]["hasFoundedEvidence"] is False

    def test_play_evidence_from_a_weak_source_is_marked_weak_and_faible(self) -> None:
        # A weak/reconstructed source is kept but flagged weak → not a founded
        # proof (Théo #2) → the play is faible even though a source string exists.
        account = {
            "priorityPerimeters": [{"name": "BU X", "tier": "P1"}],
            "recentSignals": [{"signal": "hypothèse IA", "source": "ia_reconstruction"}],
        }
        play = _plays({}, account, [])[0]
        assert play["preuve"]["source"] == "ia_reconstruction"
        assert play["preuve"]["weak"] is True
        assert play["completeness"]["hasFoundedEvidence"] is False
        assert play["completeness"]["status"] == "faible"

    def test_preuve_binds_to_the_perimeter_by_name(self) -> None:
        # Two perimeters, two sourced signals — each play binds the signal that
        # NAMES its perimeter (coherent proof per play), not just signals[0].
        account = {
            "priorityPerimeters": [
                {"name": "VINCI Energies", "tier": "P1"},
                {"name": "VINCI Construction", "tier": "P1"},
            ],
            "recentSignals": [
                {"signal": "Energies lance une plateforme DevOps", "source": "Les Echos", "date": "2026-05"},
                {"signal": "Construction digitalise ses chantiers", "source": "Le Monde", "date": "2026-04"},
            ],
        }
        plays = _plays({}, account, [])
        energies = next(p for p in plays if p["perimeter"] == "VINCI Energies")
        construction = next(p for p in plays if p["perimeter"] == "VINCI Construction")
        assert energies["preuve"]["source"] == "Les Echos"
        assert construction["preuve"]["source"] == "Le Monde"

    def test_play_serializes_the_six_salesconnect_fields(self) -> None:
        # The Play model round-trips all 6 SalesConnect fields by alias.
        from app.models.outputs.plan import Play

        contacts = [
            {"fullName": "Sophie", "entity": "VINCI Energies", "role": "economic", "priority": 1, "source": "apollo"}
        ]
        play = _plays(
            {"evaluation": {"risks": [{"risk": "Cycle long"}]}},
            self._full_account(),
            contacts,
            [{"contactName": "Sophie", "linkedinMessage": "Bonjour"}],
        )[0]
        dumped = Play.model_validate(play).model_dump(by_alias=True)
        for field in ("painSignal", "preuve", "targetContact", "firstAction", "readyMessage", "risk"):
            assert field in dumped
        assert dumped["preuve"]["source"] == "France Travail"
        assert dumped["completeness"]["requiredFields"] == [
            "signal",
            "preuve",
            "contact",
            "action",
            "message",
            "risque",
        ]

    def test_budget_signal_timeframe_is_used_as_preuve_date(self) -> None:
        # budgetSignals carry `timeframe` instead of `date` — used as the proof date.
        account = {
            "priorityPerimeters": [{"name": "BU X", "tier": "P1"}],
            "budgetSignals": [{"signal": "Programme SI 5M€", "source": "Rapport annuel", "timeframe": "2026"}],
        }
        play = _plays({}, account, [])[0]
        assert play["preuve"]["source"] == "Rapport annuel"
        assert play["preuve"]["date"] == "2026"


class TestStrategyScope:
    """ "Changer de stratégie" (Théo P3): re-plan around a chosen angle/entity."""

    def _acc(self) -> dict:
        return {
            "angles": [{"title": "Data platform"}, {"title": "Cyber NIS2"}],
            "priorityPerimeters": [{"name": "SG France"}, {"name": "Boursorama"}],
        }

    def test_chosen_angle_and_entity_lead(self) -> None:
        from app.models.plan import StrategyScope
        from app.routers.phase4_plan import _apply_strategy_scope

        out = _apply_strategy_scope(self._acc(), StrategyScope(angle="cyber", focus_entity="boursorama"))
        assert out["angles"][0]["title"] == "Cyber NIS2"  # chosen angle now leads
        assert out["priorityPerimeters"][0]["name"] == "Boursorama"

    def test_absent_or_empty_scope_is_a_noop(self) -> None:
        from app.models.plan import StrategyScope
        from app.routers.phase4_plan import _apply_strategy_scope

        acc = self._acc()
        assert _apply_strategy_scope(acc, None) is acc
        assert _apply_strategy_scope(acc, StrategyScope()) is acc  # all fields None

    def test_unknown_angle_leaves_order_untouched(self) -> None:
        from app.models.plan import StrategyScope
        from app.routers.phase4_plan import _apply_strategy_scope

        out = _apply_strategy_scope(self._acc(), StrategyScope(angle="blockchain"))
        assert out["angles"][0]["title"] == "Data platform"  # no match → unchanged

    def test_directive_names_the_imposed_strategy(self) -> None:
        from app.models.plan import StrategyScope
        from app.routers.phase4_plan import _strategy_directive

        d = _strategy_directive(StrategyScope(angle="Cyber NIS2", entry_mode="top_down"))
        assert "STRATÉGIE IMPOSÉE" in d and "Cyber NIS2" in d and "top_down" in d
        assert _strategy_directive(None) == ""
        assert _strategy_directive(StrategyScope()) == ""

    def test_reads_the_real_enriched_contact_shape(self) -> None:
        # Integration guard: _plays runs on `EnrichedContact.model_dump(by_alias=True)`
        # (what the graph passes), NOT hand-built dicts. Proves the field names it
        # reads (fullName / role / priority / entity) actually exist on the model,
        # so a play populates its contact instead of silently falling back to
        # "à identifier" / null role in prod.
        from app.models.outputs.contacts import EnrichedContact

        contact = EnrichedContact(
            fullName="Ivan", title="Directeur Technique", entity="VINCI Construction", role="technical", priority=1
        ).model_dump(by_alias=True)
        account = {"priorityPerimeters": [{"name": "VINCI Construction", "tier": "P1", "whatToSell": ["DevOps"]}]}
        play = _plays({"quick_wins": [{"action": "LinkedIn Ivan"}]}, account, [contact])[0]
        assert play["targetContact"] == "Ivan"
        assert play["targetContactRole"] == "technical"
        assert play["esnOffer"] == "DevOps"
        assert play["firstAction"] == "LinkedIn Ivan"

    def test_gate_drops_out_of_scope_entities_from_the_play(self) -> None:
        # S2 gate: SGTM (BTP) / les moulins must NOT reach the plan as play
        # candidates. Uses the Phase-1 getsPlay tag when present, classifies on
        # the fly otherwise.
        result = _trim_account_data(
            {
                "entitiesExhaustive": [
                    {"name": "ITIM", "getsPlay": True},
                    {"name": "SGTM Travaux Maroc"},  # untagged → classified out_of_sector
                    {"name": "Les Moulins du Togo", "getsPlay": False},
                    {"name": "Euro-Information"},  # untagged → IT → operating
                ],
            }
        )
        kept = [e["name"] for e in result["entitiesExhaustive"]]
        assert kept == ["ITIM", "Euro-Information"]
        # Excluded ones are kept in the dossier, labelled, but no play is built.
        excluded = {e["name"] for e in result["outOfScopeEntities"]}
        assert excluded == {"SGTM Travaux Maroc", "Les Moulins du Togo"}

    def test_gate_keeps_unclassifiable_entities(self) -> None:
        # Nameless / opaque entities are kept (benefit of the doubt) — the gate
        # never over-filters, and no outOfScopeEntities key is emitted.
        result = _trim_account_data({"entitiesExhaustive": [{"i": i} for i in range(3)]})
        assert len(result["entitiesExhaustive"]) == 3
        assert "outOfScopeEntities" not in result


class TestNormalizePlanScores:
    """The /25 score + GO/PRUDENT/STOP verdict are recomputed from the model's
    per-axis breakdown — a rule, not the model's free choice (cadrage §3.1)."""

    def test_breakdown_becomes_score_and_verdict(self) -> None:
        merged = {"evaluation": {"scoreBreakdown": GO_BREAKDOWN}}
        _normalize_plan_scores(merged)
        ev = merged["evaluation"]
        assert ev["score"] == 20 and ev["verdict"] == "GO"
        # Band-faithful /25→/10: 20/25 is the GO floor → globalScore 7 (>=7 = GO/chaud).
        assert ev["goNoGo"] == "GO" and ev["globalScore"] == 7

    def test_over_cap_axis_is_clamped_before_summing(self) -> None:
        merged = {"evaluation": {"scoreBreakdown": [{"axis": "fit_offre", "points": 99}]}}
        _normalize_plan_scores(merged)
        assert merged["evaluation"]["score"] == 5  # capped to the axis max, not 99

    def test_falls_back_to_legacy_global_score_when_no_breakdown(self) -> None:
        # Old/partial output with only a /10 globalScore → mapped to /25, then banded.
        merged = {"evaluation": {"globalScore": 3}}
        _normalize_plan_scores(merged)
        assert merged["evaluation"]["score"] == 8  # 3/10 → 7.5 → 8/25
        assert merged["evaluation"]["verdict"] == "STOP"  # 8 < 15

    def test_noop_without_evaluation(self) -> None:
        merged = {"actionPlan": {}}
        _normalize_plan_scores(merged)  # must not raise
        assert "evaluation" not in merged


class TestSortForCap:
    """Signals are capped to the top-6; a current signal must outrank an archive
    so a 2021 press release never becomes the 'signal principal' (Théo p.7/p.12)."""

    def test_archive_sinks_below_current_despite_date_string(self) -> None:
        from app.routers.phase4_plan import _sort_for_cap

        items = [
            {"signal": "archive 2023", "date": "2023-2024", "freshness": "archive"},
            {"signal": "current jan 2026", "date": "1 janv. 2026", "freshness": "current"},
            {"signal": "undated", "date": "", "freshness": "undated"},
        ]
        ordered = [s["signal"] for s in _sort_for_cap("recentSignals", items)]
        # current first, archive last — even though "1 janv. 2026" sorts low as a string.
        assert ordered[0] == "current jan 2026"
        assert ordered[-1] == "archive 2023"


class TestApplyQualityCap:
    """The Quality-Judge verdict degrades the account score AFTER the gates (Théo
    restitution §6/§7 : "Score recalculé après gates qualité"). A GO dossier the
    judge marks hallucination/trop_faible must not stay GO."""

    def test_hallucination_caps_go_to_prudent(self) -> None:
        ev = {"score": 22, "verdict": "GO", "goNoGo": "GO", "globalScore": 9}
        _apply_quality_cap(ev, "hallucination")
        assert ev["score"] == 19 and ev["verdict"] == "PRUDENT"
        assert ev["goNoGo"] == "CONDITIONNEL" and ev["globalScore"] == 6
        assert ev["qualityCapped"] is True and ev["qualityCapReason"] == "hallucination"

    def test_trop_faible_becomes_explorer(self) -> None:
        # trop_faible = données manquantes : cap 13 + verdict EXPLORER (potentiel à
        # confirmer, « collecter l'info » — annexe p25), pas un STOP par mauvais fit.
        ev = {"score": 24, "verdict": "GO"}
        _apply_quality_cap(ev, "trop_faible")
        assert ev["score"] == 13 and ev["verdict"] == "EXPLORER"
        assert ev["goNoGo"] == "CONDITIONNEL"  # EXPLORER ≠ NO-GO : à explorer, pas à jeter

    def test_ok_and_a_corriger_leave_score_untouched(self) -> None:
        for verdict in ("ok", "a_corriger", None):
            ev = {"score": 22, "verdict": "GO"}
            _apply_quality_cap(ev, verdict)
            assert ev["score"] == 22 and ev["verdict"] == "GO"
            assert "qualityCapped" not in ev

    def test_never_raises_an_already_low_score(self) -> None:
        ev = {"score": 8, "verdict": "STOP"}
        _apply_quality_cap(ev, "hallucination")  # cap is 19, score already below
        assert ev["score"] == 8 and "qualityCapped" not in ev

    def test_noop_on_missing_or_nonnumeric_score(self) -> None:
        for bad in ({}, {"score": None}, {"score": "x"}, "notadict", None):
            _apply_quality_cap(bad, "trop_faible")  # must not raise


def test_phase4_plan_offers_format(client: TestClient) -> None:
    mock_result = {
        "actionPlan": {"strategy": "Top-down"},
        "offersToPropose": [
            {"title": "Cloud", "pitch": "Migration", "targetContact": "CTO", "painAddressed": "Legacy"}
        ],
        "evaluation": {"goNoGo": "GO", "globalScore": 7},
        "prioritySubAccounts": [{"name": "SNCF Réseau", "why": "Budget IT", "entryContact": "DSI"}],
    }
    with patch("app.routers.phase4_plan.call_claude", new_callable=AsyncMock, return_value=_claude_return(mock_result)):
        res = client.post("/phase/4/plan", json={"account_id": "abc", "account_data": {"sector": "Transport"}})
    data = res.json()["data"]
    assert data["offersToPropose"][0]["title"] == "Cloud"
    assert data["prioritySubAccounts"][0]["name"] == "SNCF Réseau"


def test_phase4_plan_phases_structure(client: TestClient) -> None:
    # The split assembles actionPlan.phases from the five per-phase calls, in
    # their fixed temporal order.
    with patch(
        "app.routers.phase4_plan.call_claude",
        new_callable=AsyncMock,
        side_effect=_plan_dispatch(),
    ):
        res = client.post("/phase/4/plan", json={"account_id": "abc", "account_data": {"sector": "Transport"}})
    plan = res.json()["data"]["actionPlan"]
    assert plan["strategy"] == "S"
    phases = plan["phases"]
    assert [p["name"] for p in phases] == ["IMMEDIAT", "MOIS 1", "MOIS 2-3", "MOIS 3-6", "MOIS 6-12"]


def test_phase4_plan_split_sections_merge(client: TestClient) -> None:
    # The 11 calls (action_plan meta + 5 phases + 5 sections) run concurrently
    # (asyncio.gather), so the mock dispatches by ``prompt_name`` rather than
    # rely on call order.
    with patch(
        "app.routers.phase4_plan.call_claude",
        new_callable=AsyncMock,
        side_effect=_plan_dispatch(),
    ) as mock_claude:
        res = client.post(
            "/phase/4/plan",
            json={
                "account_id": "abc",
                # Sourced sector + angles so the gate is a no-op (test asserts merge, not gate).
                "account_data": {
                    "sector": "Transport",
                    "sources": {"tags": {"sector": "PUBLIC"}},
                    "angles": [{"angle": "Modernisation SI"}],
                },
                "contacts": [{"fullName": "Jean Dupont", "title": "DSI"}],
            },
        )
    assert res.status_code == 200
    body = res.json()
    data = body["data"]
    assert data["actionPlan"]["strategy"] == "S"
    assert data["actionPlan"]["justification"] == "J"
    assert len(data["actionPlan"]["phases"]) == 5
    assert data["evaluation"]["verdict"] == "GO"  # GO_BREAKDOWN → 20 → GO
    # All generation calls + the A1 second passes fired (concurrently).
    assert mock_claude.call_count == PLAN_CALL_COUNT + SC_EXTRA_CALLS
    # B1 telemetry: meta sums EVERY call — including the self-consistency second
    # passes (their cost must reach cost_eur like the rest).
    usage = body["meta"]["token_usage"]
    assert usage["input_tokens"] == 100 * (PLAN_CALL_COUNT + SC_EXTRA_CALLS)
    assert usage["output_tokens"] == 200 * (PLAN_CALL_COUNT + SC_EXTRA_CALLS)
    assert usage["cost_usd"] == pytest.approx(0.01 * (PLAN_CALL_COUNT + SC_EXTRA_CALLS))


# #3235 / #3212.3 — `analysis_runs.market_memory_version` : la version du jeu de
# données mémoire marché QUE CE PLAN A RÉELLEMENT LUE. Jamais une lecture
# indépendante : sans consultation (aucune expertise déclarée) ou sans couverture,
# la clé n'existe pas — un run ne se dit pas nourri par une source qu'il n'a pas lue.
def _plan_body(offers: list[str]) -> dict:
    return {
        "account_id": "abc-123",
        "account_data": {"sector": "Transport", "sources": {"tags": {}}, "angles": [{"angle": "Modernisation SI"}]},
        "contacts": [{"fullName": "Jean Dupont", "title": "DSI"}],
        "profile_data": {"companyName": "MonESN", "offers": offers},
    }


def _post_plan_with_context(client: TestClient, context: dict | None, offers: list[str]) -> dict:
    with (
        patch("app.routers.phase4_plan.call_claude", new_callable=AsyncMock, side_effect=_plan_dispatch()),
        patch(
            "app.routers.phase4_plan.bellum_api.market_memory_context_for",
            new_callable=AsyncMock,
            return_value=context,
        ),
    ):
        res = client.post("/phase/4/plan", json=_plan_body(offers))
    assert res.status_code == 200
    return res.json()["data"]["_api_metrics"]


def test_phase4_plan_timbre_la_version_de_la_memoire_marche_lue(client: TestClient) -> None:
    metrics = _post_plan_with_context(
        client,
        {
            "status": "ok",
            "coverage": {"covered": True, "observedStack": ["java"], "datasetVersion": "2026-09-v3"},
        },
        ["Cloud & Infrastructure"],
    )
    assert metrics["market_memory_version"] == "2026-09-v3"


def test_phase4_plan_ne_timbre_rien_sans_couverture_ou_sans_version(client: TestClient) -> None:
    uncovered = _post_plan_with_context(
        client, {"status": "ok", "coverage": {"covered": False, "datasetVersion": "2026-09-v3"}}, ["Cloud"]
    )
    assert "market_memory_version" not in uncovered
    unversioned = _post_plan_with_context(
        client, {"status": "ok", "coverage": {"covered": True, "datasetVersion": None}}, ["Cloud"]
    )
    assert "market_memory_version" not in unversioned
    # Aucune expertise déclarée → aucune consultation → aucun timbre.
    not_consulted = _post_plan_with_context(
        client, {"status": "ok", "coverage": {"covered": True, "datasetVersion": "x"}}, []
    )
    assert "market_memory_version" not in not_consulted


def test_phase4_plan_route_follows_a_named_sponsor_in_the_dossier(client: TestClient) -> None:
    """#2273 (épopée #2959) — l'APPELANT de bout en bout : un sponsor NOMMÉ parmi
    les contacts du dossier rend la route `sponsor` atteignable, et elle atteint
    le prompt système du plan. Le témoin : le même dossier SANS sponsor garde la
    route par défaut (aucune route inventée)."""
    sales_context = {
        "esnProfile": {"stage": "etablie"},
        "account": {"archetype": "pme_eti"},
        "relationship": {"state": "froid"},
    }

    def _system_prompt(contacts: list[dict]) -> str:
        with patch("app.routers.phase4_plan.call_claude", new_callable=AsyncMock, side_effect=_plan_dispatch()) as m:
            res = client.post(
                "/phase/4/plan",
                json={
                    "account_id": "abc-123",
                    "account_data": {"sector": "Industrie", "salesContext": sales_context},
                    "contacts": contacts,
                    "profile_data": {"companyName": "ESN Test", "size": "50"},
                },
            )
            assert res.status_code == 200
            return m.call_args_list[0][0][0]

    with_sponsor = _system_prompt([{"fullName": "Anne Sponsor", "title": "Directrice", "role": "sponsor"}])
    assert "Route : sponsor" in with_sponsor
    without = _system_prompt([{"fullName": "Jean Dupont", "title": "DSI", "role": "technical"}])
    assert "Route : direct_accessible" in without


def test_phase4_plan_route_follows_a_declared_partner_or_interaction(client: TestClient) -> None:
    """#2273.9-.21 (épopée #2959) — l'APPELANT de bout en bout pour les deux
    routes dernières atteignables : un partenaire DÉCLARÉ en place
    (`salesContext.declaredPartners`) ouvre `partenaire`, une interaction
    DÉCLARÉE (`relationship.lastInteractionAt`) ouvre `relation_existante` ;
    le témoin sans signal garde la route par défaut."""
    base = {
        "esnProfile": {"stage": "etablie"},
        "account": {"archetype": "pme_eti"},
        "relationship": {"state": "connu"},
    }

    def _system_prompt(sales_context: dict) -> str:
        with patch("app.routers.phase4_plan.call_claude", new_callable=AsyncMock, side_effect=_plan_dispatch()) as m:
            res = client.post(
                "/phase/4/plan",
                json={
                    "account_id": "abc-123",
                    "account_data": {"sector": "Industrie", "salesContext": sales_context},
                    "contacts": [{"fullName": "Jean Dupont", "title": "DSI", "role": "technical"}],
                    "profile_data": {"companyName": "ESN Test", "size": "50"},
                },
            )
            assert res.status_code == 200
            return m.call_args_list[0][0][0]

    assert "Route : partenaire" in _system_prompt({**base, "declaredPartners": ["Alten"]})
    interaction = {**base, "relationship": {"state": "connu", "lastInteractionAt": "2026-08-12"}}
    assert "Route : relation_existante" in _system_prompt(interaction)
    assert "Route : direct_accessible" in _system_prompt(base)


def test_phase4_plan_lance_les_recuperations_rag_ensemble(client: TestClient) -> None:
    """Sentry IA-K — les récupérations indépendantes du plan (plain, reranked,
    Drive, mémoire marché) démarrent TOUTES avant que la première ne finisse ;
    le choix reranked/plain et le bloc Drive restent inchangés."""
    import asyncio

    events: list[str] = []
    all_started = asyncio.Event()
    names = ("plain", "reranked", "drive", "market")

    async def _fake(name: str, value):
        events.append(f"start:{name}")
        if sum(e.startswith("start:") for e in events) == len(names):
            all_started.set()
        try:
            await asyncio.wait_for(all_started.wait(), timeout=1.0)
        except TimeoutError:
            events.append(f"stalled:{name}")
        events.append(f"end:{name}")
        return value

    async def _plain(*_a, **_k):
        return await _fake("plain", "PLAIN_KNOWLEDGE")

    async def _reranked(*_a, **_k):
        return await _fake("reranked", "RERANKED_KNOWLEDGE")

    async def _drive(*_a, **_k):
        return await _fake("drive", "DRIVE_BLOCK")

    async def _market(*_a, **_k):
        return await _fake("market", [])

    with (
        patch(
            "app.routers.phase4_plan.call_claude", new_callable=AsyncMock, side_effect=_plan_dispatch()
        ) as mock_claude,
        patch("app.routers.phase4_plan.rag_service.retrieve_knowledge_context", side_effect=_plain),
        patch("app.routers.phase4_plan.rag_knowledge.retrieve_reranked_context", side_effect=_reranked),
        patch("app.routers.phase4_plan.rag_knowledge.retrieve_drive_context", side_effect=_drive),
        patch("app.routers.phase4_plan._market_memory_reinforced_expertises", side_effect=_market),
        patch(
            "app.routers.phase4_plan.rag_knowledge.append_drive_block",
            side_effect=lambda knowledge, drive: f"{knowledge}|{drive}",
        ) as mock_append,
    ):
        res = client.post(
            "/phase/4/plan",
            json={
                "account_id": "abc-123",
                "user_id": "u-1",
                "account_data": {"sector": "Transport", "angles": [{"angle": "Modernisation SI"}]},
                "contacts": [{"fullName": "Jean Dupont", "title": "DSI"}],
                "profile_data": {"companyName": "MonESN", "offers": ["Cloud"]},
            },
        )

    assert res.status_code == 200
    assert not [e for e in events if e.startswith("stalled:")], events
    first_end = min(i for i, e in enumerate(events) if e.startswith("end:"))
    assert {e for e in events[:first_end] if e.startswith("start:")} == {f"start:{n}" for n in names}
    # reranked gagne quand il est non vide, puis le bloc Drive est ajouté.
    mock_append.assert_any_call("RERANKED_KNOWLEDGE", "DRIVE_BLOCK")
    assert mock_claude.call_count >= PLAN_CALL_COUNT
