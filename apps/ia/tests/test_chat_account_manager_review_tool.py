"""#2985 (revue manager, section G de #2319) — l'APPELANT de la revue.

Mesuré le 26/09/2026 : le pont NestJS (`internal/copilot/account/manager-review`)
compose déjà le tiroir « ce qui a changé », le plan (actions réalisées / non
avancées) et les risques des affaires — mais rien côté chat ne l'exposait au
modèle. Ce fichier vérifie que `get_account_manager_review` RELAIE ce calcul
tel quel (aucun second calcul), que « déjà là »/« reste » (verdict, couverture,
faits importants, décision manager, arbitrage) restent nommés dans la
description plutôt qu'inventés, et qu'un compte étranger ou introuvable ne
donne jamais lieu à une revue.
"""

from __future__ import annotations

import pytest

from app.services import bellum_api
from app.services.chat_tools import CHAT_TOOLS, WRITE_TOOL_NAMES, execute_chat_tool

USER = "22222222-4222-4222-8222-222222222222"


@pytest.fixture(autouse=True)
def _configured(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)


async def _run(tool_input: dict) -> dict:
    return await execute_chat_tool("get_account_manager_review", tool_input, user_id=USER, profile_data=None)


def test_registry_exposes_the_tool() -> None:
    names = {t["name"] for t in CHAT_TOOLS}
    assert "get_account_manager_review" in names
    # Additif : les outils déjà exposés restent tous là.
    assert "get_account_coverage_map" in names


def test_it_is_a_pure_read_never_a_write_tool() -> None:
    assert "get_account_manager_review" not in WRITE_TOOL_NAMES


def test_schema_requires_account_id() -> None:
    tool = next(t for t in CHAT_TOOLS if t["name"] == "get_account_manager_review")
    assert tool["input_schema"]["required"] == ["account_id"]


def test_the_description_names_the_new_axes_and_what_stays_absent() -> None:
    tool = next(t for t in CHAT_TOOLS if t["name"] == "get_account_manager_review")
    description = str(tool["description"]).lower()
    # ⚠️ Pas le mot « couverture » lui-même (GA-259, `test_copilote_scope_eval.py`) :
    # l'axe est NOMMÉ par référence à `get_account_coverage_map`.
    assert "couvertur" not in description
    for present in ("verdict", "get_account_coverage_map", "importantfacts", "decisionsrequested", "notevaluated", "arbitrage", "arbitrationsrequested"):
        assert present in description
    assert "jamais une probabilité" in description
    # #2319 — l'arbitrage a désormais une source : il se PROPOSE, Laura ne réattribue jamais.
    assert "jamais réattribué" in description
    assert "aucune source réelle" not in description


@pytest.mark.asyncio
async def test_requires_an_account_id() -> None:
    result = await _run({})
    assert "error" in result


@pytest.mark.asyncio
async def test_relays_the_review_exactly_no_second_calculation(monkeypatch: pytest.MonkeyPatch) -> None:
    review = {
        "accountId": "a-1",
        "generatedAt": "2026-09-26T08:00:00.000Z",
        "changeDigest": None,
        "actionsCompleted": [
            {
                "id": "i-1",
                "label": "Relancer après le comité",
                "targetLabel": None,
                "ownerName": None,
                "completedAt": None,
            }
        ],
        "actionsStalled": [],
        "risks": [],
    }

    async def _manager_review(*_a: object, **_k: object) -> dict:
        return review

    monkeypatch.setattr(bellum_api, "account_manager_review", _manager_review)
    result = await _run({"account_id": "a-1"})
    # #2852.6-53 (suite) — l'enveloppe canonique de résultat d'outil est
    # ADDITIVE (jamais une seconde donnée) : chaque champ de la revue relayée
    # reste inchangé, l'enveloppe s'ajoute par-dessus.
    for key, value in review.items():
        assert result[key] == value
    assert result["status"] == "success"


@pytest.mark.asyncio
async def test_a_foreign_or_missing_account_never_yields_a_review(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _manager_review(*_a: object, **_k: object) -> dict:
        return {"error": "account_not_found"}

    monkeypatch.setattr(bellum_api, "account_manager_review", _manager_review)
    result = await _run({"account_id": "a-x"})
    assert "error" in result
    assert "actionsCompleted" not in result


@pytest.mark.asyncio
async def test_says_it_lacks_access_rather_than_failing_when_unconfigured(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(bellum_api, "is_configured", lambda: False)
    result = await _run({"account_id": "a-1"})
    assert "error" in result


@pytest.mark.asyncio
async def test_no_response_from_the_bridge_is_named_rather_than_silent(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _manager_review(*_a: object, **_k: object) -> None:
        return None

    monkeypatch.setattr(bellum_api, "account_manager_review", _manager_review)
    result = await _run({"account_id": "a-1"})
    assert "error" in result


@pytest.mark.asyncio
async def test_turn_replay_verdict_is_relayed_with_counted_reasons_and_no_probability(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """#2985 — rejoue le tour : « fais-moi une revue de compte pour Acme » → l'outil est
    appelé avec l'`account_id` et le verdict arrive tel quel, raisons COMPTÉES, sans
    probabilité ; un axe illisible reste nommé. Question exacte de recette : « Prépare-moi
    un point manager sur <compte> » — attendu : statut, raisons chiffrées, faits importants,
    décisions en attente, et « arbitrage pas encore rendu »."""
    review = {
        "accountId": "a-1",
        "generatedAt": "2026-10-01T08:00:00.000Z",
        "changeDigest": None,
        "actionsCompleted": [],
        "actionsStalled": [],
        "risks": [],
        "verdict": {
            "status": "attention",
            "reasons": [{"kind": "decisions_pending", "count": 1}],
            "notEvaluated": ["change_digest"],
        },
        "coverage": {"gapCount": 1, "gaps": [{"label": "DSI", "reason": "Aucun contact connu"}]},
        "importantFacts": [{"label": "AO cloud annoncé", "date": None}],
        "decisionsRequested": [{"id": "i-2", "label": "Valider la relance", "targetLabel": None, "ownerName": None}],
        "arbitrationsRequested": [
            {
                "projectId": "p-1",
                "projectLabel": "Refonte portail",
                "needTitle": "Ingénieur infrastructure",
                "consultantId": "c-1",
                "consultantName": "Karim B.",
                "accountOwnerName": "Louis S",
                "resourceOwnerName": "Marie D",
            }
        ],
    }
    seen: list[tuple[object, ...]] = []

    async def _manager_review(*a: object, **_k: object) -> dict:
        seen.append(a)
        return review

    monkeypatch.setattr(bellum_api, "account_manager_review", _manager_review)
    result = await _run({"account_id": "a-1"})
    assert seen and seen[0][1] == "a-1"
    assert result["verdict"]["status"] == "attention"
    assert result["verdict"]["notEvaluated"] == ["change_digest"]
    assert result["decisionsRequested"][0]["label"] == "Valider la relance"
    # #2319 — l'arbitrage owner/ressource arrive avec ses DEUX porteurs nommés.
    assert result["arbitrationsRequested"][0]["accountOwnerName"] == "Louis S"
    assert result["arbitrationsRequested"][0]["resourceOwnerName"] == "Marie D"
    assert "probab" not in str(result["verdict"]).lower()

