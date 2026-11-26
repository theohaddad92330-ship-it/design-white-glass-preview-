"""#3278 (recette prod 14/10) — seule « filiale » sortait : le plan relit le
SalesContext PERSISTÉ à la recherche, et `PlanRequest` jetait les signaux de
route que l'API relit à chaque appel (veille, talent, événement, inbound,
signal d'achat déclaré, consultant, partenaire). Un signal posé APRÈS la
recherche n'atteignait donc jamais la route du plan rendu."""

from __future__ import annotations

from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from app.services.claude_service import TokenUsage as ClaudeTokenUsage

# Contexte persisté à la recherche : grand groupe froid, AUCUN signal de route.
_PERSISTED = {
    "salesContextVersion": 1,
    "esnProfile": {"stage": "etablie"},
    "account": {"archetype": "grand_groupe"},
    "relationship": {"state": "froid"},
}
_PLAN = {"actionPlan": {"strategy": "S"}, "offersToPropose": [], "evaluation": {}, "prioritySubAccounts": []}


def _route_of(client: TestClient, **fresh: object) -> str | None:
    usage = ClaudeTokenUsage(input_tokens=1, output_tokens=1, model="claude-sonnet-4-6", cost_usd=0.0)
    with patch("app.routers.phase4_plan.call_claude", new_callable=AsyncMock, return_value=(_PLAN, usage)):
        res = client.post(
            "/phase/4/plan",
            json={
                "account_id": "abc",
                "account_data": {"company_name": "Thales", "salesContext": _PERSISTED},
                "contacts": [],
                **fresh,
            },
        )
    assert res.status_code == 200
    return (res.json()["data"].get("recommendedRoute") or {}).get("route")


def test_without_fresh_signal_the_big_cold_account_still_enters_by_a_subsidiary(client: TestClient) -> None:
    assert _route_of(client) == "filiale_site"


@pytest.mark.parametrize(
    ("fresh", "route"),
    [
        ({"declared_route_signals": {"watch_only": True}}, "veille_seule"),
        ({"declared_route_signals": {"talent_from_account": True}}, "depuis_talent"),
        ({"declared_route_signals": {"event_community": True}}, "evenement_communaute"),
        ({"declared_route_signals": {"inbound_content": True}}, "inbound_contenu"),
        ({"declared_signal_present": True}, "signal_entrant"),
        ({"consultant_history": "present"}, "consultant_present"),
        ({"consultant_history": "former"}, "ancien_consultant"),
        ({"declared_partners": ["Alten"]}, "partenaire"),
    ],
)
def test_a_signal_sent_with_the_plan_request_names_its_route(client: TestClient, fresh: dict, route: str) -> None:
    assert _route_of(client, **fresh) == route
