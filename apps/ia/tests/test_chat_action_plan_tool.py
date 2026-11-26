"""#3904.1 — `get_action_plan` : le plan d'actions commercial, regroupé par GESTE.

Le bilan de relance (#3903, `get_reengagement_report`) classait déjà chaque
compte par SENS (balle chez nous / chez le client) ; aucun outil ne le
transformait en plan ordonné par geste. Ce fichier vérifie que le plan
COMPOSE ce bilan (aucun recalcul de catégorie), qu'il nomme ce qu'il ne sait
pas évaluer (« proche de signer » : axes non tranchés) et qu'une source en
panne se NOMME au lieu de se lire « rien à faire ».
"""

from __future__ import annotations

from typing import Any

import pytest

from app.services import bellum_api
from app.services.action_plan import compose_action_plan
from app.services.chat_tools import CHAT_TOOLS, WRITE_TOOL_NAMES, execute_chat_tool

USER = "33333333-4333-4333-8333-333333333333"


def _row(
    account_id: str,
    company: str,
    category: str,
    kind: str = "email",
    direction: str = "outbound",
    consecutive_emails: int = 0,
) -> dict:
    return {
        "consecutiveOutboundEmails": consecutive_emails,
        "accountId": account_id,
        "companyName": company,
        "lastOccurredAt": "2026-09-01T00:00:00.000Z",
        "lastDirection": direction,
        "lastKind": kind,
        "attempts": 2,
        "category": category,
    }


REPORT = {
    "since": "2026-07-01T00:00:00.000Z",
    "accounts": [
        _row("a-1", "SNCF", "en_attente_chez_nous", direction="inbound"),
        _row("a-2", "Thales", "a_relancer"),
        _row("a-3", "Airbus", "a_relancer", kind="call"),
        _row("a-4", "Société Générale", "en_attente_chez_le_client"),
    ],
    "sourcesCoverage": {"observed": ["email", "call"], "notObserved": ["meeting", "linkedin"]},
    "notEvaluated": ["open_deal_status"],
}


TO_ACT = {
    "accounts": [
        {
            "id": "a-9",
            "companyName": "Orange",
            "reason": "no_recent_action",
            "lastActionAt": "2026-08-01T00:00:00.000Z",
        },
        {"id": "a-8", "companyName": "EDF", "reason": "awaiting_decision", "lastActionAt": None},
        # Déjà dans le bilan (échange en cours) : jamais « à contacter » en plus.
        {"id": "a-4", "companyName": "Société Générale", "reason": "no_recent_action", "lastActionAt": None},
    ],
    "truncated": False,
}

DORMANT = {
    "months": 6,
    "total": 1,
    "contacts": [
        {
            "contact_id": "c-1",
            "account_id": "a-7",
            "full_name": "Claire Martin",
            "title": "DSI",
            "company_name": "Renault",
            "reactivation_score": {"score": 7, "max_possible": 12, "axes": [{"key": "silence", "evaluated": True}]},
        }
    ],
}


NEAR_SIGNING = {
    "bellum": [
        {"accountId": "a-5", "companyName": "Alstom", "opportunityId": "o-1", "label": "TMA", "stage": "negotiation"},
    ],
    "crm": [
        {"accountId": "a-6", "companyName": "BNP", "dealName": "Refonte", "stageLabel": "Proposition envoyée"},
    ],
}


CONNECTIONS = {
    "sources": [
        {"source": "crm", "state": "connected", "lastSync": "2026-10-05T08:00:00.000Z"},
        {"source": "telephony", "state": "not_connected", "lastSync": None},
        {"source": "calendar", "state": "action_required", "lastSync": None},
        {"source": "email", "state": "connected", "lastSync": None},
    ]
}


@pytest.fixture(autouse=True)
def _configured(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)


def _gesture(plan: dict, name: str) -> dict:
    return next(g for g in plan["gestures"] if g["gesture"] == name)


# ── Le registre ─────────────────────────────────────────────────────────────


def test_registry_exposes_a_read_tool() -> None:
    names = [t["name"] for t in CHAT_TOOLS]
    assert "get_action_plan" in names
    assert "get_action_plan" not in WRITE_TOOL_NAMES
    assert names[-1] == "push_profile"


def test_the_description_forbids_probabilities_and_names_the_holes() -> None:
    tool = next(t for t in CHAT_TOOLS if t["name"] == "get_action_plan")
    description = str(tool["description"]).lower()
    assert "jamais un pourcentage" in description
    assert "proche_de_signer" in description
    # #3904 — décision Louis 09/10 : un STADE (proposition ou négociation), jamais une probabilité.
    assert "proposition" in description and "négociation" in description
    assert "deux e-mails" in description
    assert "le commercial" in description and "rien n'est envoyé" in description


# ── La composition (pure) ───────────────────────────────────────────────────


def test_groups_the_report_by_gesture_without_recomputing_the_category() -> None:
    plan = compose_action_plan(report=REPORT)
    assert [a["accountId"] for a in _gesture(plan, "repondre")["actions"]] == ["a-1"]
    assert [a["accountId"] for a in _gesture(plan, "relancer")["actions"]] == ["a-2"]
    # Même canal que la dernière tentative restée sans réponse : un appel.
    assert [a["accountId"] for a in _gesture(plan, "appeler")["actions"]] == ["a-3"]
    every_id = {a["accountId"] for g in plan["gestures"] for a in g["actions"]}
    # Balle chez le client, silence encore court : aucun geste — jamais une relance prématurée.
    assert "a-4" not in every_id


def test_each_action_carries_its_reason_and_a_dated_source() -> None:
    plan = compose_action_plan(report=REPORT)
    action = _gesture(plan, "relancer")["actions"][0]
    assert action["companyName"] == "Thales"
    assert action["reason"]
    assert action["sources"] == [{"source": "journal_echanges", "kind": "email", "date": "2026-09-01T00:00:00.000Z"}]


# ── #3904 — DÉCISION LOUIS 09/10 : « appeler » et « proche de signer » ─────


def test_two_consecutive_unanswered_emails_turn_into_a_call() -> None:
    plan = compose_action_plan(report={**REPORT, "accounts": [_row("a-2", "Thales", "a_relancer", consecutive_emails=2)]})
    assert [a["accountId"] for a in _gesture(plan, "appeler")["actions"]] == ["a-2"]
    assert "deux e-mails" in _gesture(plan, "appeler")["actions"][0]["reason"].lower()
    assert _gesture(plan, "relancer")["actions"] == []


def test_a_single_unanswered_email_stays_a_follow_up_never_a_call() -> None:
    # Cas limite : UN e-mail sans réponse (la série a été cassée par une réponse
    # ou un appel avant lui) reste « relancer » — jamais « appeler » deviné.
    plan = compose_action_plan(report={**REPORT, "accounts": [_row("a-2", "Thales", "a_relancer", consecutive_emails=1)]})
    assert [a["accountId"] for a in _gesture(plan, "relancer")["actions"]] == ["a-2"]
    assert _gesture(plan, "appeler")["actions"] == []


def test_close_to_signing_lists_proposal_or_negotiation_opportunities_with_their_source() -> None:
    plan = compose_action_plan(report=REPORT, near_signing=NEAR_SIGNING)
    block = _gesture(plan, "proche_de_signer")
    assert block["status"] == "ok"
    assert [a["accountId"] for a in block["actions"]] == ["a-5", "a-6"]
    assert block["actions"][0]["sources"] == [{"source": "opportunite_bellum", "kind": "negotiation", "date": None}]
    assert block["actions"][1]["sources"] == [{"source": "ton_crm", "kind": "Proposition envoyée", "date": None}]
    assert all(item["gesture"] != "proche_de_signer" for item in plan["notEvaluated"])


def test_close_to_signing_names_an_unread_crm_and_still_reads_bellum() -> None:
    plan = compose_action_plan(report=REPORT, near_signing={**NEAR_SIGNING, "crm": None})
    assert [a["accountId"] for a in _gesture(plan, "proche_de_signer")["actions"]] == ["a-5"]
    not_evaluated = {item["gesture"]: item for item in plan["notEvaluated"]}
    assert not_evaluated["proche_de_signer"]["source"] == "ton_crm"
    assert "crm" in not_evaluated["proche_de_signer"]["reason"].lower()


def test_close_to_signing_failed_source_is_named_never_read_as_nothing() -> None:
    plan = compose_action_plan(report=REPORT, near_signing=None)
    assert _gesture(plan, "proche_de_signer")["status"] == "source_failed"
    assert "opportunites_proches_de_signer" in plan["sourcesFailed"]


def test_the_report_holes_travel_with_the_plan() -> None:
    plan = compose_action_plan(report=REPORT)
    assert plan["coverage"]["activityKindsNotObserved"] == ["meeting", "linkedin"]
    assert plan["coverage"]["reportNotEvaluated"] == ["open_deal_status"]
    assert plan["window"]["since"] == "2026-07-01T00:00:00.000Z"


def test_a_failed_report_is_named_never_read_as_nothing_to_do() -> None:
    plan = compose_action_plan(report=None)
    assert "bilan_de_relance" in plan["sourcesFailed"]
    for gesture in ("repondre", "relancer", "appeler"):
        assert _gesture(plan, gesture)["status"] == "source_failed"


def test_an_empty_gesture_says_empty_not_failed() -> None:
    plan = compose_action_plan(
        report={**REPORT, "accounts": []},
        to_act=TO_ACT,
        dormant=DORMANT,
        connections=CONNECTIONS,
        near_signing=NEAR_SIGNING,
    )
    assert _gesture(plan, "relancer")["status"] == "empty"
    assert plan["sourcesFailed"] == []


def test_a_long_gesture_is_capped_and_says_so() -> None:
    rows = [_row(f"a-{i}", f"C{i}", "a_relancer") for i in range(30)]
    plan = compose_action_plan(report={**REPORT, "accounts": rows})
    relancer = _gesture(plan, "relancer")
    assert len(relancer["actions"]) == 20
    assert relancer["truncated"] is True
    assert relancer["total"] == 30


# ── #3904.4 — « contacter » se compose, jamais un troisième moteur ──────────


def test_contact_gesture_composes_accounts_to_act_and_the_dormant_network() -> None:
    plan = compose_action_plan(report=REPORT, to_act=TO_ACT, dormant=DORMANT)
    contacter = _gesture(plan, "contacter")
    assert contacter["status"] == "ok"
    assert [(a["accountId"], a.get("contactId")) for a in contacter["actions"]] == [("a-9", None), ("a-7", "c-1")]
    orange = contacter["actions"][0]
    assert orange["sources"] == [
        {"source": "portefeuille", "kind": "derniere_action", "date": "2026-08-01T00:00:00.000Z"}
    ]
    # Le score de réactivation voyage avec ses axes nommés — jamais un nombre nu.
    assert contacter["actions"][1]["reactivationScore"]["axes"]


def test_a_decision_pending_account_is_not_a_contact_gesture() -> None:
    plan = compose_action_plan(report=REPORT, to_act=TO_ACT, dormant=DORMANT)
    ids = [a["accountId"] for a in _gesture(plan, "contacter")["actions"]]
    assert "a-8" not in ids
    assert "a-4" not in ids


def test_a_failed_contact_source_is_named_and_the_other_still_serves() -> None:
    plan = compose_action_plan(
        report=REPORT, to_act=None, dormant=DORMANT, connections=CONNECTIONS, near_signing=NEAR_SIGNING
    )
    assert plan["sourcesFailed"] == ["comptes_a_traiter"]
    assert _gesture(plan, "contacter")["status"] == "ok"
    both_down = compose_action_plan(
        report=REPORT, to_act={"error": "x"}, dormant=None, connections=CONNECTIONS, near_signing=NEAR_SIGNING
    )
    assert _gesture(both_down, "contacter")["status"] == "source_failed"
    assert set(both_down["sourcesFailed"]) == {"comptes_a_traiter", "reseau_dormant"}


# ── #3904.3 — l'état des quatre connecteurs voyage avec le plan ─────────────


def test_the_four_connectors_travel_with_the_plan_an_absent_one_is_named() -> None:
    plan = compose_action_plan(report=REPORT, to_act=TO_ACT, dormant=DORMANT, connections=CONNECTIONS)
    connectors = {c["source"]: c for c in plan["coverage"]["connectors"]}
    assert set(connectors) == {"crm", "telephony", "calendar", "email"}
    assert connectors["telephony"]["state"] == "not_connected"
    assert connectors["crm"]["lastSync"] == "2026-10-05T08:00:00.000Z"


def test_an_unread_connector_state_is_named_never_read_as_all_connected() -> None:
    plan = compose_action_plan(report=REPORT, to_act=TO_ACT, dormant=DORMANT, connections=None)
    assert plan["coverage"]["connectors"] is None
    assert "etat_des_connecteurs" in plan["sourcesFailed"]


def test_no_probability_ever_travels() -> None:
    text = str(compose_action_plan(report=REPORT, near_signing=NEAR_SIGNING)).lower()
    assert "%" not in text
    assert "probab" not in text


# ── L'appelant (le tool de chat) ────────────────────────────────────────────


async def _run(tool_input: dict[str, Any] | None = None) -> dict:
    return await execute_chat_tool("get_action_plan", tool_input or {}, user_id=USER, profile_data=None)


@pytest.mark.asyncio
async def test_the_tool_reads_the_report_and_relays_its_window(monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list[tuple] = []

    async def _report(user_id: str, since_date: str | None = None, window_days: int | None = None) -> dict:
        calls.append((user_id, since_date, window_days))
        return REPORT

    async def _to_act(user_id: str) -> dict:
        return TO_ACT

    async def _dormant(user_id: str, *, months: int | None = None, limit: int | None = None) -> dict:
        calls.append(("dormant", limit))
        return DORMANT

    monkeypatch.setattr(bellum_api, "engagement_report", _report)
    monkeypatch.setattr(bellum_api, "accounts_to_act", _to_act)

    async def _connections(user_id: str) -> dict:
        return CONNECTIONS

    monkeypatch.setattr(bellum_api, "dormant_contacts", _dormant)
    monkeypatch.setattr(bellum_api, "source_connections", _connections)

    async def _near_signing(user_id: str) -> dict:
        return NEAR_SIGNING

    monkeypatch.setattr(bellum_api, "near_signing", _near_signing)
    result = await _run({"window_days": 60})
    assert [a["accountId"] for a in _gesture(result, "proche_de_signer")["actions"]] == ["a-5", "a-6"]
    assert calls == [(USER, None, 60), ("dormant", 10)]
    assert _gesture(result, "relancer")["actions"][0]["accountId"] == "a-2"
    assert _gesture(result, "contacter")["actions"][0]["accountId"] == "a-9"
    assert result["status"] == "success"
    assert result["sourcesFailed"] == []
    assert [c["source"] for c in result["coverage"]["connectors"]] == ["crm", "telephony", "calendar", "email"]


@pytest.mark.asyncio
async def test_the_tool_never_answers_on_a_dead_bridge(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(bellum_api, "is_configured", lambda: False)
    result = await _run()
    assert result.get("error")
    assert result["status"] == "not_covered"


@pytest.mark.asyncio
async def test_the_tool_rejects_a_malformed_date(monkeypatch: pytest.MonkeyPatch) -> None:
    result = await _run({"since_date": "juillet"})
    assert result.get("error")
    assert result["status"] == "invalid_input"


# #3903 — recette prod 10/10 : « Plan d'actions commercial — 90 derniers jours » rendu
# en LISTE À PUCES (0 <table>), sans colonne « Sens ». Le plan porte maintenant son
# TABLEAU prêt à rendre : cinq colonnes nommées, une ligne par action, `None` = non mesuré.
def test_3903_the_plan_carries_a_ready_table_with_five_named_columns() -> None:
    plan = compose_action_plan(report=REPORT)
    table = plan["exportTable"]
    assert table["columns"] == ["Geste", "Compte", "Sens", "Pourquoi", "Source et date"]
    by_account = {row["cells"][1]: row["cells"] for row in table["rows"]}
    assert by_account["SNCF"][0] == "Répondre"
    assert by_account["SNCF"][2] == "Entrant"
    assert by_account["Thales"][0] == "Relancer"
    assert by_account["Thales"][2] == "Sortant"
    assert by_account["Thales"][4] == "Journal d'échanges, 2026-09-01"
    # le témoin opposé : « en attente chez le client » n'est un geste de personne
    assert "Société Générale" not in by_account
    assert all(len(row["cells"]) == 5 for row in table["rows"])
