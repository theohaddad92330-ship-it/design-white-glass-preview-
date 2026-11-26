"""#4792 (épopée #4791) — Laura LIT notre base : comptes, besoins, consultants, par métier et par lieu.

Les refus qui comptent, dans l'ordre où ils protègent :
  * l'outil est déclaré EN FIN de catalogue (le préfixe d'outils mis en cache reste valide) et il LIT ;
  * `total` vient de la base, jamais du nombre de lignes montrées — 80 lignes sur 3 600 le disent ;
  * un amont injoignable est une erreur CLAIRE, jamais une liste vide qui se lirait « il n'y a rien » ;
  * `null` reste `null` : jamais « 0 », jamais une date devinée ;
  * une famille non demandée est ABSENTE ; une famille demandée et vide se DIT vide ;
  * zéro crédit : aucun appel à une source externe, et la description le dit au modèle.
"""

from __future__ import annotations

import pytest

from app.services import bellum_api, chat_tools
from app.services.base_reader_tool import (
    SEARCH_OUR_BASE_TOOL,
    SEARCH_OUR_BASE_TOOL_NAME,
)

USER = "22222222-2222-4222-8222-222222222222"
ACCOUNT = "11111111-1111-4111-8111-111111111111"


def _need(index: int) -> dict:
    return {
        "source": "registered_need",
        "collectedAt": "2026-05-01T10:00:00.000Z",
        "needId": f"need-{index}",
        "accountId": ACCOUNT,
        "accountName": "Client Exemple",
        "title": f"Développeur Java {index}",
        "skills": ["Java"],
        "place": "Lille (59)",
        "status": "to_qualify",
    }


def _payload(**over: object) -> dict:
    base: dict = {
        "readAt": "2026-10-29T10:00:00.000Z",
        "needs": {
            "total": 80,
            "offset": 0,
            "limit": 50,
            "hasMore": True,
            "rows": [_need(index) for index in range(50)],
        },
        "consultants": {
            "total": 3_600,
            "offset": 0,
            "limit": 50,
            "hasMore": True,
            "rows": [
                {
                    "source": "consultant_experience",
                    "collectedAt": "2026-02-01T08:00:00.000Z",
                    "consultantId": "c-1",
                    "fullName": "Nom Exemple",
                    "title": "Data engineer",
                    "place": "Lille",
                    "zones": ["59"],
                    "skills": ["Java"],
                    "experience": {
                        "client": "Client Exemple",
                        "role": "Développeur Java",
                        "from": "2023-01-01",
                        "to": "2024-06-30",
                    },
                }
            ],
        },
    }
    base.update(over)
    return base


@pytest.fixture(autouse=True)
def _configured(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)


def _bridge(monkeypatch: pytest.MonkeyPatch, result: object) -> list[tuple[str, dict]]:
    calls: list[tuple[str, dict]] = []

    async def fake(user_id: str, **kwargs: object) -> object:
        calls.append((user_id, dict(kwargs)))
        return result

    monkeypatch.setattr(bellum_api, "search_our_base", fake)
    return calls


async def _run(payload: dict | None = None) -> dict:
    return await chat_tools.execute_chat_tool(SEARCH_OUR_BASE_TOOL_NAME, payload or {}, user_id=USER, profile_data=None)


# ── Le catalogue : l'outil EXISTE, en fin de liste, et il lit ─────────────────


def test_the_tool_is_declared_at_the_end_of_the_catalogue_and_reads_only() -> None:
    names = [str(tool["name"]) for tool in chat_tools.CHAT_TOOLS]
    assert SEARCH_OUR_BASE_TOOL_NAME in names
    # EN FIN de liste : insérer au milieu invaliderait le préfixe d'outils mis en cache.
    assert names.index(SEARCH_OUR_BASE_TOOL_NAME) >= len(names) - 2
    assert SEARCH_OUR_BASE_TOOL_NAME not in chat_tools.WRITE_TOOL_NAMES


def test_the_description_names_the_three_families_the_cost_and_the_date() -> None:
    description = str(SEARCH_OUR_BASE_TOOL["description"])
    assert "COMPTES" in description and "BESOINS" in description and "CONSULTANTS" in description
    # Gratuit, dit au modèle sans le mot « crédit » (#4464) : un outil qu'on hésite à appeler ne sert personne.
    assert "ne débite RIEN" in description
    # La date de collecte se dit, et une absence ne devient jamais « 0 ».
    assert "collectedAt" in description and "jamais une date devinée" in description
    # Elle ne nomme jamais d'où vient la donnée.
    assert "Ne nomme JAMAIS d'où vient la donnée" in description


# ── Les critères voyagent, et rien n'est deviné ───────────────────────────────


@pytest.mark.asyncio
async def test_the_criteria_travel_and_nothing_absent_is_invented(monkeypatch: pytest.MonkeyPatch) -> None:
    calls = _bridge(monkeypatch, _payload())
    await _run({"terms": ["Java"], "city": "Lille", "departments": ["59"], "families": ["needs", "consultants"]})
    assert calls[0][0] == USER
    sent = calls[0][1]
    assert sent["terms"] == ["Java"]
    assert sent["city"] == "Lille"
    assert sent["departments"] == ["59"]
    assert sent["families"] == ["needs", "consultants"]
    # Rien de deviné : une période non demandée reste absente.
    assert sent["period_from"] is None and sent["period_to"] is None
    assert sent["regions"] == []


@pytest.mark.asyncio
async def test_an_unknown_family_never_reaches_the_api(monkeypatch: pytest.MonkeyPatch) -> None:
    calls = _bridge(monkeypatch, _payload())
    await _run({"families": ["needs", "licornes"]})
    assert calls[0][1]["families"] == ["needs"]


@pytest.mark.asyncio
async def test_the_period_travels_on_both_sides(monkeypatch: pytest.MonkeyPatch) -> None:
    calls = _bridge(monkeypatch, _payload())
    await _run({"from": "2026-01-01", "to": "2026-06-30"})
    assert calls[0][1]["period_from"] == "2026-01-01"
    assert calls[0][1]["period_to"] == "2026-06-30"


# ── Les chiffres : mesurés, jamais déduits des lignes montrées ────────────────


@pytest.mark.asyncio
async def test_the_total_comes_from_the_base_not_from_the_rows_shown(monkeypatch: pytest.MonkeyPatch) -> None:
    _bridge(monkeypatch, _payload())
    result = await _run({"terms": ["Java"], "city": "Lille"})
    assert result["needs"]["total"] == 80
    assert result["consultants"]["total"] == 3_600
    # Les lignes montrées sont bornées, et la borne se DIT.
    assert len(result["needs"]["rows"]) == 15
    assert result["needs"]["truncated"] is True
    assert result["needs"]["hasMore"] is True


@pytest.mark.asyncio
async def test_a_family_not_asked_is_absent_and_an_empty_one_says_so(monkeypatch: pytest.MonkeyPatch) -> None:
    _bridge(monkeypatch, {"readAt": "2026-10-29T10:00:00.000Z", "needs": {"total": 0, "rows": [], "hasMore": False}})
    result = await _run({"families": ["needs"]})
    # Non demandée ⇒ absente : « je n'ai pas regardé » n'est pas « il n'y a rien ».
    assert "accounts" not in result and "consultants" not in result
    assert result["needs"]["total"] == 0
    assert "message" in result


@pytest.mark.asyncio
async def test_each_row_keeps_its_nature_and_its_collection_date(monkeypatch: pytest.MonkeyPatch) -> None:
    _bridge(monkeypatch, _payload())
    result = await _run({"terms": ["Java"]})
    row = result["needs"]["rows"][0]
    assert row["source"] == "registered_need"
    assert row["collectedAt"] == "2026-05-01T10:00:00.000Z"
    person = result["consultants"]["rows"][0]
    assert person["source"] == "consultant_experience"
    assert person["experience"]["client"] == "Client Exemple"


@pytest.mark.asyncio
async def test_an_absent_value_stays_null_and_never_becomes_zero(monkeypatch: pytest.MonkeyPatch) -> None:
    rows = [{**_need(0), "collectedAt": None, "place": None, "status": None}]
    _bridge(monkeypatch, {"readAt": "x", "needs": {"total": 1, "rows": rows, "hasMore": False}})
    result = await _run({"families": ["needs"]})
    row = result["needs"]["rows"][0]
    assert row["collectedAt"] is None
    assert row["place"] is None
    assert row["status"] is None


# ── L'amont : un échec se DIT ─────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_unreachable_upstream_is_a_clear_error_never_an_empty_list(monkeypatch: pytest.MonkeyPatch) -> None:
    _bridge(monkeypatch, None)
    result = await _run({"terms": ["Java"]})
    assert "error" in result
    assert "needs" not in result and "consultants" not in result


@pytest.mark.asyncio
async def test_an_error_payload_is_not_read_as_a_result(monkeypatch: pytest.MonkeyPatch) -> None:
    _bridge(monkeypatch, {"error": "boom"})
    assert "error" in await _run({"terms": ["Java"]})


@pytest.mark.asyncio
async def test_unconfigured_bridge_refuses_rather_than_answering(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(bellum_api, "is_configured", lambda: False)
    calls = _bridge(monkeypatch, _payload())
    result = await _run({"terms": ["Java"]})
    assert "error" in result
    assert calls == []


# ── La couche HTTP : le chemin, et rien d'autre ───────────────────────────────


@pytest.mark.asyncio
async def test_the_call_posts_to_the_single_reader_and_sends_only_what_was_asked(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    sent: list[tuple[str, dict]] = []

    async def fake_post(path: str, payload: dict, **_kw: object) -> dict:
        sent.append((path, payload))
        return {"readAt": "x"}

    monkeypatch.setattr(bellum_api, "_post", fake_post)
    await bellum_api.search_our_base(USER, terms=["Java"], city="Lille", families=["needs"])
    assert sent == [
        (
            "/internal/copilot/base/search",
            {"userId": USER, "terms": ["Java"], "city": "Lille", "families": ["needs"]},
        )
    ]


@pytest.mark.asyncio
async def test_no_criterion_sends_nothing_but_the_user(monkeypatch: pytest.MonkeyPatch) -> None:
    sent: list[tuple[str, dict]] = []

    async def fake_post(path: str, payload: dict, **_kw: object) -> dict:
        sent.append((path, payload))
        return {"readAt": "x"}

    monkeypatch.setattr(bellum_api, "_post", fake_post)
    await bellum_api.search_our_base(USER)
    assert sent == [("/internal/copilot/base/search", {"userId": USER})]


# ── #4794 — « comptes qui prennent des développeurs » : hors ESN, jamais deviné ───────────────────────────


@pytest.mark.asyncio
async def test_exclude_esn_travels_only_when_asked(monkeypatch: pytest.MonkeyPatch) -> None:
    calls = _bridge(monkeypatch, _payload())
    await _run({"terms": ["Java"], "city": "Lille"})
    await _run({"terms": ["Java"], "city": "Lille", "excludeEsn": True})
    assert calls[0][1]["exclude_esn"] is False
    assert calls[1][1]["exclude_esn"] is True


def test_the_description_tells_when_to_exclude_esn_and_how_to_word_the_answer() -> None:
    description = str(SEARCH_OUR_BASE_TOOL["description"])
    assert "excludeEsn" in description
    assert "comptes pouvant prendre" in description
    assert "excludeEsn" in SEARCH_OUR_BASE_TOOL["input_schema"]["properties"]


@pytest.mark.asyncio
async def test_the_bridge_sends_exclude_esn_to_the_api(monkeypatch: pytest.MonkeyPatch) -> None:
    sent: list[dict] = []

    async def fake_post(path: str, payload: dict) -> dict:
        sent.append({"path": path, **payload})
        return {}

    monkeypatch.setattr(bellum_api, "_post", fake_post)
    await bellum_api.search_our_base(USER, terms=["Java"], exclude_esn=True)
    await bellum_api.search_our_base(USER, terms=["Java"])
    assert sent[0]["excludeEsn"] is True
    assert "excludeEsn" not in sent[1]
