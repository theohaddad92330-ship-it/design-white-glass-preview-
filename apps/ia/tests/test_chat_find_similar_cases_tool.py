"""#3210 (LAU-FINAL-216, beta 28/09/2026) — `find_similar_cases`.

La règle de similarité (axes comparés, plafond à trois cas) vit côté
NestJS (`deriveSimilarCases`, testée seule là-bas). Cet outil relaie TEL
QUEL, prose nuancée assumée (`chat_read_tool_card_coverage.py`) — jamais
un verdict, seulement des similitudes/différences nommées.
"""

from __future__ import annotations

import pytest

from app.services import bellum_api
from app.services.chat_tools import CHAT_TOOLS, execute_chat_tool


def _tool(name: str) -> dict:
    return next(t for t in CHAT_TOOLS if t["name"] == name)


def test_find_similar_cases_carries_the_no_go_rule_in_its_description() -> None:
    description = _tool("find_similar_cases")["description"]
    assert "NO-GO ABSOLU" in description
    assert "jamais une preuve" in description
    assert "lossReason" in description


@pytest.mark.asyncio
async def test_find_similar_cases_requires_an_account_id(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)
    result = await execute_chat_tool(
        "find_similar_cases",
        {},
        user_id="33333333-3333-4333-8333-333333333333",
        profile_data=None,
    )
    assert result["error"] == "Un identifiant de compte est requis."
    assert result["status"] == "invalid_input"


@pytest.mark.asyncio
async def test_find_similar_cases_relays_won_and_lost_cases(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    payload = {
        "cases": [
            {
                "accountId": "geodis",
                "accountLabel": "Geodis",
                "outcome": "won",
                "missionLabel": "Audit d'entrée",
                "projectLabel": None,
                "whatWorked": "Verticalisation et direction de programme identifiable.",
                "whatFailed": None,
                "lossReason": None,
                "similarities": [
                    "Même secteur (Banque).",
                    "Taille comparable (500-1000).",
                ],
                "differences": [],
                "closedAt": "2026-06-01",
            }
        ]
    }

    async def _similar_cases(_user_id: str, account_id: str) -> dict:
        assert account_id == "target-1"
        return payload

    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)
    monkeypatch.setattr(bellum_api, "similar_cases", _similar_cases)
    result = await execute_chat_tool(
        "find_similar_cases",
        {"account_id": "target-1"},
        user_id="33333333-3333-4333-8333-333333333333",
        profile_data=None,
    )
    assert {key: result[key] for key in payload} == payload


@pytest.mark.asyncio
async def test_find_similar_cases_reports_an_unknown_account_cleanly(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def _similar_cases(*_a: object, **_k: object) -> dict:
        return {"error": "account_not_found"}

    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)
    monkeypatch.setattr(bellum_api, "similar_cases", _similar_cases)
    result = await execute_chat_tool(
        "find_similar_cases",
        {"account_id": "missing"},
        user_id="33333333-3333-4333-8333-333333333333",
        profile_data=None,
    )
    # #3195 — le refus garde son message exact et porte le geste suivant.
    assert result["error"] == "Compte introuvable dans votre portefeuille."
    assert "web_search" in result["next_step"]


@pytest.mark.asyncio
async def test_find_similar_cases_relays_the_structured_dimensions_verbatim(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """#3210.3 — rejoue le tour « À quel cas passé ce compte ressemble-t-il ? ».

    Entrée : la question ; outil appelé : `find_similar_cases` ; réponse : les
    axes STRUCTURÉS (territoire, expertise, accès, offre, périmètre) tels que
    NestJS les a calculés — l'outil n'en invente aucun et ne reformule pas.
    """
    payload = {
        "cases": [
            {
                "accountId": "geodis",
                "accountLabel": "Geodis",
                "outcome": "lost",
                "missionLabel": None,
                "projectLabel": "TMA",
                "whatWorked": None,
                "whatFailed": None,
                "lossReason": "Budget gelé.",
                "similarities": [
                    "Même territoire (FR).",
                    "Même expertise achetée (data_engineering).",
                    "Même niveau d’accès (direct_reference).",
                ],
                "differences": ["Offre différente (Run contre Build)."],
                "closedAt": "2026-05-01",
            }
        ]
    }

    async def _similar_cases(_user_id: str, _account_id: str) -> dict:
        return payload

    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)
    monkeypatch.setattr(bellum_api, "similar_cases", _similar_cases)
    result = await execute_chat_tool(
        "find_similar_cases",
        {"account_id": "target-1"},
        user_id="33333333-3333-4333-8333-333333333333",
        profile_data=None,
    )
    assert {key: result[key] for key in payload} == payload
    assert "Même expertise achetée (data_engineering)." in result["cases"][0]["similarities"]


def test_an_empty_answer_names_what_was_examined_never_a_bare_no_case() -> None:
    """#3246 (recette prod 02/10) : « aucun cas comparable » nu ne dit pas si
    l'espace n'a aucun retour ou si rien ne ressemble à ce compte."""
    description = _tool("find_similar_cases")["description"]
    assert "examined" in description
    assert "retours de mission" in description
    assert "opportunités perdues" in description
    assert "Jamais un « aucun cas » nu" in description


@pytest.mark.asyncio
async def test_replayed_turn_empty_answer_relays_what_was_examined(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """#3246 — rejoue « À quoi ressemble ce compte par rapport à ce qu'on a gagné
    ou perdu ? » sur un espace dont rien ne ressemble au compte : l'outil relaie
    `examined` TEL QUEL, c'est lui qui permet à Laura de nommer l'absence."""
    payload = {"cases": [], "examined": {"won": 2, "lost": 1}}

    async def _similar_cases(_user_id: str, _account_id: str) -> dict:
        return payload

    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)
    monkeypatch.setattr(bellum_api, "similar_cases", _similar_cases)
    result = await execute_chat_tool(
        "find_similar_cases",
        {"account_id": "target-1"},
        user_id="33333333-3333-4333-8333-333333333333",
        profile_data=None,
    )
    assert result["cases"] == []
    assert result["examined"] == {"won": 2, "lost": 1}


def test_the_description_names_meetings_and_case_memory_without_probability() -> None:
    """#3210.1 (lot M11 09/10) — la source « rendez-vous » se nomme absente, la
    mémoire par cas se cite en comptes, sans client ni probabilité."""
    description = next(t for t in CHAT_TOOLS if t["name"] == "find_similar_cases")["description"]
    assert "unavailableSources" in description
    assert "caseMemory" in description
    assert "sans nommer de client" in description
    assert "jamais comme une probabilité" in description


# ── P05.b (#3246, lot 09/10) — « dans la base commune » ───────────────────


def test_the_description_presents_the_shared_base_after_case_memory_never_a_name() -> None:
    tool = next(t for t in CHAT_TOOLS if t["name"] == "find_similar_cases")
    description = tool["description"]
    assert "`elsewhere` ajoute une ligne « dans la base commune »" in description
    assert "APRÈS `caseMemory`, jamais fondue avec lui" in description
    assert "pas assez de cas communs pour en parler, jamais « zéro cas »" in description
    assert "aucun motif de perte : n'en invente pas" in description


@pytest.mark.asyncio
async def test_relays_the_shared_base_line_as_is(monkeypatch: pytest.MonkeyPatch) -> None:
    """Entrée : « ce genre de compte se gagne ailleurs ? » → `find_similar_cases`
    → `elsewhere` relayé TEL QUEL, sans nom ni second calcul."""
    elsewhere = {
        "basis": "shared_anonymous_base",
        "minWorkspaces": 3,
        "status": "shared",
        "lines": [{"dimension": "sector", "value": "naf_62", "won": 5, "lost": 3, "contributingWorkspaces": 4}],
    }

    async def _similar_cases(_user_id: str, _account_id: str) -> dict:
        return {"cases": [], "examined": {"won": 0, "lost": 0}, "elsewhere": elsewhere}

    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)
    monkeypatch.setattr(bellum_api, "similar_cases", _similar_cases)
    result = await execute_chat_tool(
        "find_similar_cases",
        {"account_id": "target-1"},
        user_id="33333333-3333-4333-8333-333333333333",
        profile_data=None,
    )
    assert result["elsewhere"] == elsewhere


def test_3246_relation_and_timing_are_closed_lists_never_guessed() -> None:
    """#3246.relation / #3246.timing (décision Louis 16/10/2026) — Laura cite les deux
    dimensions comme les autres, et sait qu'une dimension non évaluable ne vaut jamais 0."""
    description = _tool("find_similar_cases")["description"]
    assert "#3246.relation" in description
    assert "JAMAIS du texte libre" in description
    assert "#3246.timing" in description
    assert "médiane des cycles clos" in description
    assert "jamais un 0" in description
    # L'ancienne comparaison par tranche de durée prévue a disparu.
    assert "PAR TRANCHE" not in description


@pytest.mark.asyncio
async def test_3246_grid_names_all_ten_dimensions_relation_and_organisation_included(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """#3246.3 / #3246.5 (18/10) — la prod répondait « 9 dimensions » sans organisation ni relation : le
    modèle énumérait de mémoire. La grille voyage dans le résultat : 10 dimensions nommées, une non
    évaluable porte sa raison (jamais 0), le stade de relation est un critère de similarité nommé."""
    payload = {
        "cases": [],
        "unavailableDimensions": [{"dimension": "organisation", "reason": "non renseignée"}],
        "targetKnown": {"sector": True, "size": True},
    }

    async def _similar_cases(_user_id: str, _account_id: str) -> dict:
        return payload

    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)
    monkeypatch.setattr(bellum_api, "similar_cases", _similar_cases)
    result = await execute_chat_tool(
        "find_similar_cases",
        {"account_id": "target-1"},
        user_id="33333333-3333-4333-8333-333333333333",
        profile_data=None,
    )
    grid = result["dimensionsGrid"]
    assert len(grid) == 10
    by_name = {line["dimension"]: line for line in grid}
    assert "organisation de la décision" in by_name and "stade de relation" in by_name
    assert by_name["organisation de la décision"]["status"] == "non évaluée"
    assert by_name["organisation de la décision"]["reason"] == "non renseignée"
    assert by_name["stade de relation"]["status"] == "comparée"
    description = _tool("find_similar_cases")["description"]
    assert "dimensionsGrid" in description and "même stade de relation" in description
