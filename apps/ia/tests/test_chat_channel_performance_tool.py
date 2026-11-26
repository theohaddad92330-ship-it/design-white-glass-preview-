"""#3278.3 (#3259.7) — `get_channel_performance` : « quel canal répond le
mieux chez nous ? ».

La mesure (envoyés, répondus sous 14 jours, seuil d'échantillon) vit côté
NestJS ; l'outil la relaie TELLE QUELLE. Un canal sous le seuil arrive
`sufficient: false` SANS taux : l'outil n'en fabrique jamais un.
"""

from __future__ import annotations

import pytest

from app.services import bellum_api
from app.services.chat_tools import CHAT_TOOLS, execute_chat_tool

USER = "33333333-3333-4333-8333-333333333333"


def _tool(name: str) -> dict:
    return next(t for t in CHAT_TOOLS if t["name"] == name)


def test_the_tool_states_the_honesty_rules_in_its_description() -> None:
    description = _tool("get_channel_performance")["description"]
    assert "non mesuré" in description
    assert "jamais zéro" in description
    assert "preset" in description


def test_the_description_leads_with_both_questions_so_the_model_calls_it() -> None:
    """#3234 (recette 02/10, RÉFUTÉ) — « Quel rôle de décision répond le mieux chez nous ? »
    recevait une réponse générique : l'outil n'était pas appelé. La question exacte et
    `by: "role"` doivent figurer dans le PREMIER tiers de la description, et dans le schéma."""
    tool = _tool("get_channel_performance")
    description = tool["description"]
    head = description[: len(description) // 2]
    assert "quel rôle de décision répond le mieux" in head
    assert 'by: "role"' in head
    assert "jamais de réponse de mémoire" in head
    assert "rôle de" in tool["input_schema"]["properties"]["by"]["description"]


def test_the_tool_is_added_at_the_end_before_push_profile() -> None:
    # #3422.20 (01/10) — d'autres outils ont été ajoutés APRÈS celui-ci : la
    # règle tenue est « ajouté en fin, avant push_profile », pas « avant-dernier ».
    names = [t["name"] for t in CHAT_TOOLS]
    assert names[-1] == "push_profile"
    assert names.index("get_channel_performance") < names.index("push_profile")


@pytest.mark.asyncio
async def test_replays_the_turn_which_channel_answers_best(monkeypatch: pytest.MonkeyPatch) -> None:
    """Entrée : « Quel canal répond le mieux chez nous ? » → l'outil est appelé
    sans argument → la réponse porte les canaux mesurés, tels quels."""
    payload = {
        "channels": [
            {"channel": "call", "sent": 20, "replied": 8, "sufficient": True, "replyRate": 40},
            {"channel": "email", "sent": 4, "replied": 1, "sufficient": False, "replyRate": None},
        ]
    }

    async def _channel_performance(user_id: str) -> dict:
        assert user_id == USER
        return payload

    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)
    monkeypatch.setattr(bellum_api, "channel_performance", _channel_performance)
    result = await execute_chat_tool("get_channel_performance", {}, user_id=USER, profile_data=None)
    assert {key: result[key] for key in payload} == payload
    email = next(row for row in result["channels"] if row["channel"] == "email")
    assert email["replyRate"] is None  # non mesuré, jamais 0


@pytest.mark.asyncio
async def test_an_empty_workspace_says_nothing_was_measured_rather_than_zero(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    async def _channel_performance(_user_id: str) -> dict:
        return {"channels": []}

    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)
    monkeypatch.setattr(bellum_api, "channel_performance", _channel_performance)
    result = await execute_chat_tool("get_channel_performance", {}, user_id=USER, profile_data=None)
    assert result["channels"] == []
    assert "aucun envoi" in result["note"].lower()


@pytest.mark.asyncio
async def test_a_bridge_failure_is_an_error_not_an_empty_measure(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _channel_performance(_user_id: str) -> None:
        return None

    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)
    monkeypatch.setattr(bellum_api, "channel_performance", _channel_performance)
    result = await execute_chat_tool("get_channel_performance", {}, user_id=USER, profile_data=None)
    assert "error" in result


def test_the_tool_offers_a_by_role_cut_with_the_same_honesty_rules() -> None:
    """#3234 (#3211.11) — la coupe par rôle est une option de l'outil existant."""
    tool = _tool("get_channel_performance")
    # #3211.11 (lot M11) — + cadence/route/priority, en fin d'énumération.
    assert tool["input_schema"]["properties"]["by"]["enum"][:2] == ["channel", "role"]
    assert "rôle" in tool["description"]


@pytest.mark.asyncio
async def test_replays_the_turn_which_role_answers_best(monkeypatch: pytest.MonkeyPatch) -> None:
    """Entrée : « Quel rôle répond le mieux ? » → `get_channel_performance(by=role)`
    → les rôles mesurés reviennent tels quels, un rôle sous le seuil sans taux."""
    payload = {
        "roles": [
            {"role": "technical", "sent": 12, "replied": 6, "sufficient": True, "replyRate": 50},
            {"role": "economic", "sent": 3, "replied": 0, "sufficient": False, "replyRate": None},
        ]
    }
    seen: dict = {}

    async def _channel_performance(user_id: str, by: str = "channel") -> dict:
        seen["by"] = by
        return payload

    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)
    monkeypatch.setattr(bellum_api, "channel_performance", _channel_performance)
    result = await execute_chat_tool("get_channel_performance", {"by": "role"}, user_id=USER, profile_data=None)
    assert seen["by"] == "role"
    assert result == payload
    assert next(r for r in result["roles"] if r["role"] == "economic")["replyRate"] is None


@pytest.mark.asyncio
async def test_an_empty_role_cut_says_not_measured_rather_than_zero(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _channel_performance(_user_id: str, by: str = "channel") -> dict:
        return {"roles": []}

    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)
    monkeypatch.setattr(bellum_api, "channel_performance", _channel_performance)
    result = await execute_chat_tool("get_channel_performance", {"by": "role"}, user_id=USER, profile_data=None)
    assert result["roles"] == []
    assert "pas mesuré" in result["note"].lower()


# ── #3211.11 (#3234, lot M11 09/10) — recommandation par dimension ────────


def test_the_tool_offers_cadence_route_priority_and_forbids_a_probability() -> None:
    tool = _tool("get_channel_performance")
    assert set(tool["input_schema"]["properties"]["by"]["enum"]) == {
        "channel",
        "role",
        "cadence",
        "route",
        "priority",
        "angle",
    }
    description = tool["description"]
    assert 'by: "cadence"' in description
    assert "jamais une probabilité" in description
    assert "positive" in description and "judged" in description


@pytest.mark.asyncio
@pytest.mark.parametrize("dimension", ["cadence", "route", "priority"])
async def test_replays_the_turn_which_dimension_works_best(monkeypatch: pytest.MonkeyPatch, dimension: str) -> None:
    payload = {
        "dimension": dimension,
        "recommended": "x",
        "reason": "measured",
        "values": [{"value": "x", "positive": 9, "judged": 12, "sufficient": True}],
    }
    seen: dict = {}

    async def _channel_performance(user_id: str, by: str = "channel") -> dict:
        seen["by"] = by
        return payload

    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)
    monkeypatch.setattr(bellum_api, "channel_performance", _channel_performance)
    result = await execute_chat_tool("get_channel_performance", {"by": dimension}, user_id=USER, profile_data=None)
    assert seen["by"] == dimension
    assert result == payload


@pytest.mark.asyncio
async def test_nothing_recommended_says_why_and_never_a_zero(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _channel_performance(_user_id: str, by: str = "channel") -> dict:
        return {"dimension": "route", "recommended": None, "reason": "no_outcome", "values": []}

    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)
    monkeypatch.setattr(bellum_api, "channel_performance", _channel_performance)
    result = await execute_chat_tool("get_channel_performance", {"by": "route"}, user_id=USER, profile_data=None)
    assert result["recommended"] is None
    assert "pas mesuré" in result["note"].lower()


@pytest.mark.asyncio
async def test_a_dimension_bridge_failure_is_an_error(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _channel_performance(_user_id: str, by: str = "channel") -> dict | None:
        return None

    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)
    monkeypatch.setattr(bellum_api, "channel_performance", _channel_performance)
    result = await execute_chat_tool("get_channel_performance", {"by": "cadence"}, user_id=USER, profile_data=None)
    assert "error" in result


# ── P05.a (#3246, lot 09/10) — « ce qui marche ailleurs » ─────────────────


def test_the_tool_presents_elsewhere_beside_home_never_a_probability_nor_a_name() -> None:
    tool = _tool("get_channel_performance")
    description = tool["description"]
    assert "`elsewhere`" in description
    assert "À CÔTÉ de « chez nous »" in description
    assert "pas assez de données communes" in description
    assert "jamais un pourcentage de chance" in description
    assert "Ne nomme jamais un autre espace" in description
    assert tool["input_schema"]["properties"]["account_id"]["type"] == "string"
    assert "account_id" not in tool["input_schema"].get("required", [])


@pytest.mark.asyncio
async def test_relays_elsewhere_as_is_with_the_account_segment(monkeypatch: pytest.MonkeyPatch) -> None:
    """Entrée : « quelle cadence marche le mieux, chez nous et ailleurs, pour ce compte ? »
    → `get_channel_performance(by=cadence, account_id)` → `elsewhere` relayé TEL QUEL."""
    payload = {
        "dimension": "cadence",
        "recommended": None,
        "reason": "not_enough_measured",
        "values": [],
        "elsewhere": {
            "basis": "shared_anonymous_base",
            "status": "shared",
            "segment": {"sector": "naf_64", "sizeBand": "eti"},
            "contributingWorkspaces": 4,
            "values": [{"value": "relance", "positive": 9, "judged": 12, "contributingWorkspaces": 4}],
        },
    }
    seen: dict = {}

    async def _channel_performance(user_id: str, by: str = "channel", account_id: str | None = None) -> dict:
        seen.update(by=by, account_id=account_id)
        return payload

    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)
    monkeypatch.setattr(bellum_api, "channel_performance", _channel_performance)
    result = await execute_chat_tool(
        "get_channel_performance", {"by": "cadence", "account_id": "acc-1"}, user_id=USER, profile_data=None
    )
    assert seen == {"by": "cadence", "account_id": "acc-1"}
    assert result["elsewhere"] == payload["elsewhere"]


@pytest.mark.asyncio
async def test_the_bridge_sends_the_account_only_for_a_dimension(monkeypatch: pytest.MonkeyPatch) -> None:
    sent: list[dict] = []

    async def _post(_path: str, body: dict) -> dict:
        sent.append(body)
        return {}

    monkeypatch.setattr(bellum_api, "_post", _post)
    await bellum_api.channel_performance("u-1", by="route", account_id="acc-1")
    await bellum_api.channel_performance("u-1", by="role", account_id="acc-1")
    assert sent[0] == {"userId": "u-1", "by": "route", "accountId": "acc-1"}
    assert "accountId" not in sent[1]


# ── #3211.11 (#3234, lot RAISON-B 12/10) — la coupe par ANGLE du message ───


def test_the_tool_offers_an_angle_cut_without_a_probability() -> None:
    tool = _tool("get_channel_performance")
    assert "angle" in tool["input_schema"]["properties"]["by"]["enum"]
    assert 'by: "angle"' in tool["description"]


@pytest.mark.asyncio
async def test_replays_the_turn_which_angle_answers_best(monkeypatch: pytest.MonkeyPatch) -> None:
    payload = {
        "angles": [
            {"angle": "suite au poc", "sent": 12, "replied": 5, "sufficient": True, "replyRate": 42},
            {"angle": "webinaire", "sent": 3, "replied": 0, "sufficient": False, "replyRate": None},
        ]
    }
    seen: dict = {}

    async def _channel_performance(user_id: str, by: str = "channel", **_kw: object) -> dict:
        seen["by"] = by
        return payload

    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)
    monkeypatch.setattr(bellum_api, "channel_performance", _channel_performance)
    result = await execute_chat_tool("get_channel_performance", {"by": "angle"}, user_id=USER, profile_data=None)
    assert seen["by"] == "angle"
    assert next(r for r in result["angles"] if r["angle"] == "webinaire")["replyRate"] is None


@pytest.mark.asyncio
async def test_an_empty_angle_cut_says_not_measured_rather_than_zero(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _channel_performance(user_id: str, by: str = "channel", **_kw: object) -> dict:
        return {"angles": []}

    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)
    monkeypatch.setattr(bellum_api, "channel_performance", _channel_performance)
    result = await execute_chat_tool("get_channel_performance", {"by": "angle"}, user_id=USER, profile_data=None)
    assert result["angles"] == []
    assert "pas mesuré" in result["note"].lower()


@pytest.mark.asyncio
async def test_an_angle_bridge_failure_is_an_error_not_an_empty_measure(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _channel_performance(user_id: str, by: str = "channel", **_kw: object) -> None:
        return None

    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)
    monkeypatch.setattr(bellum_api, "channel_performance", _channel_performance)
    result = await execute_chat_tool("get_channel_performance", {"by": "angle"}, user_id=USER, profile_data=None)
    assert "error" in result


@pytest.mark.asyncio
async def test_the_bridge_sends_by_angle(monkeypatch: pytest.MonkeyPatch) -> None:
    sent: list[dict] = []

    async def _post(_path: str, body: dict) -> dict:
        sent.append(body)
        return {}

    monkeypatch.setattr(bellum_api, "_post", _post)
    await bellum_api.channel_performance("u-1", by="angle")
    assert sent[0] == {"userId": "u-1", "by": "angle"}
