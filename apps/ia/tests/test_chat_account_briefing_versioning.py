"""#3212.3(b) (épopée #3235) — `get_account_briefing` expose enfin `versioning`
et `verdict_revision`, jusque-là calculés côté NestJS (`analysis_runs`, sans
RLS) sans AUCUN appelant côté chat (`CopilotAccountVersioningController`
existait, personne ne l'appelait — le motif qui revient dans tout ce dépôt).

`bellum_api.account_versioning` est le pont ; ces tests vérifient que l'outil
le RELAIE (aucun second calcul) et n'invente jamais rien quand le pont est
éteint, en échec, ou muet sur l'un des deux champs.
"""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi import HTTPException

from app.services import bellum_api
from app.services.chat_tools import execute_chat_tool

USER = "33333333-4333-4333-8333-333333333333"


async def _fetch_owned_account(*_a: object, **_k: object) -> dict:
    return {"id": "acc-1", "company_name": "Client Test"}


@pytest.fixture(autouse=True)
def _owned_account(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr("app.services.supabase_client.get_supabase", MagicMock(return_value=MagicMock()))
    monkeypatch.setattr("app.services.ownership.fetch_owned_account", AsyncMock(side_effect=_fetch_owned_account))


async def _run() -> dict:
    return await execute_chat_tool("get_account_briefing", {"account_id": "acc-1"}, user_id=USER, profile_data=None)


@pytest.mark.asyncio
async def test_account_versioning_is_a_strict_no_op_without_the_bridge_configured(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """`bellum_api.account_versioning` elle-même : sans `API_INTERNAL_URL`/
    `INTERNAL_API_SECRET`, aucun appel réseau — même contrat que le reste du
    pont (docstring de tête du module)."""
    monkeypatch.delenv("API_INTERNAL_URL", raising=False)
    monkeypatch.delenv("INTERNAL_API_SECRET", raising=False)

    async def _explode(*_a: object, **_k: object) -> None:
        raise AssertionError("aucun appel réseau sans configuration")

    monkeypatch.setattr("httpx.AsyncClient", _explode)

    assert await bellum_api.account_versioning(USER, "acc-1") is None


@pytest.mark.asyncio
async def test_adds_versioning_and_verdict_revision_when_the_bridge_carries_both(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    payload = {
        "versioning": {"analysis_version": "abc123f", "profile_version": None, "date": "2026-09-28T08:00:00Z"},
        "verdictRevision": {
            "previousVerdict": "PRUDENT",
            "newVerdict": "GO",
            "changedAt": "2026-09-28T08:00:00Z",
            "causes": ["x"],
        },
    }
    monkeypatch.setattr(bellum_api, "account_versioning", AsyncMock(return_value=payload))

    result = await _run()

    assert result["versioning"] == payload["versioning"]
    # #3235 (14/10) — les verdicts sont NOMMÉS comme la fiche ; le code brut voyage dans `*Code`.
    assert result["verdict_revision"] == {
        **payload["verdictRevision"],
        "previousVerdict": "RÉSERVE",
        "previousVerdictCode": "PRUDENT",
        "newVerdict": "AGIR MAINTENANT",
        "newVerdictCode": "GO",
    }


@pytest.mark.asyncio
async def test_omits_both_keys_when_the_bridge_is_off_never_a_guessed_version(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(bellum_api, "account_versioning", AsyncMock(return_value=None))

    result = await _run()

    assert "versioning" not in result
    assert "verdict_revision" not in result


@pytest.mark.asyncio
async def test_omits_verdict_revision_alone_when_the_bridge_names_no_revision_to_explain(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    payload = {"versioning": {"analysis_version": None}, "verdictRevision": None}
    monkeypatch.setattr(bellum_api, "account_versioning", AsyncMock(return_value=payload))

    result = await _run()

    assert result["versioning"] == payload["versioning"]
    assert "verdict_revision" not in result


@pytest.mark.asyncio
async def test_a_foreign_or_missing_account_never_calls_the_versioning_bridge(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        "app.services.ownership.fetch_owned_account",
        AsyncMock(side_effect=HTTPException(status_code=404)),
    )
    spy = AsyncMock(return_value={"versioning": {}, "verdictRevision": {}})
    monkeypatch.setattr(bellum_api, "account_versioning", spy)

    result = await _run()

    assert result["status"] == "empty"
    spy.assert_not_called()


# #3212.7 — non-régression de la STABILITÉ : le briefing est une projection pure du
# dossier stocké + ce que le pont rend ; aucun état de conversation, aucun hasard.


@pytest.mark.asyncio
async def test_same_question_twice_or_in_a_new_conversation_gives_the_same_answer(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    payload = {"versioning": {"analysis_version": "abc123f"}, "verdictRevision": None}
    monkeypatch.setattr(bellum_api, "account_versioning", AsyncMock(return_value=payload))

    first, second = await _run(), await _run()
    # « nouvelle conversation » / « reformulation » : l'outil ne reçoit que l'id du compte.
    third = await execute_chat_tool(
        "get_account_briefing", {"account_id": "acc-1"}, user_id=USER, profile_data={"role": "autre"}
    )

    assert first == second == third


@pytest.mark.asyncio
async def test_a_new_run_or_corrected_profile_shows_up_as_a_stated_revision_not_a_silent_change(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    before = {"versioning": {"analysis_version": "v1"}, "verdictRevision": None}
    after = {
        "versioning": {"analysis_version": "v2"},
        "verdictRevision": {"previousVerdict": "NO-GO", "newVerdict": "GO", "causes": ["profil corrigé"]},
    }
    bridge = AsyncMock(side_effect=[before, after])
    monkeypatch.setattr(bellum_api, "account_versioning", bridge)

    old, new = await _run(), await _run()

    assert "verdict_revision" not in old
    assert new["verdict_revision"]["causes"] == ["profil corrigé"]
    assert new["versioning"]["analysis_version"] != old["versioning"]["analysis_version"]


@pytest.mark.asyncio
async def test_a_refreshed_market_memory_shows_up_as_a_stated_version_not_a_silent_change(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """#3212.7 — 8e scénario (« Market Memory actualisée »), livré avec le câblage de
    `market_memory_version` (`phase4_plan` → worker → colonne) : le chat RELAIE la
    version telle que le pont la rend — jamais fabriquée quand le run ne l'a pas lue."""
    before = {"versioning": {"market_memory_version": None}, "verdictRevision": None}
    after = {"versioning": {"market_memory_version": "2026-10-v4"}, "verdictRevision": None}
    monkeypatch.setattr(bellum_api, "account_versioning", AsyncMock(side_effect=[before, after]))

    old, new = await _run(), await _run()

    assert old["versioning"]["market_memory_version"] is None
    assert new["versioning"]["market_memory_version"] == "2026-10-v4"


def test_the_tool_description_tells_laura_to_cite_verdict_revision_causes_or_name_its_absence() -> None:
    """#3235 (réfuté, recette 07/10 sur Société Générale) — `verdict_revision` était
    déjà relayé par l'outil (voir les tests ci-dessus) mais rien dans sa description
    ne disait au modèle de le LIRE pour répondre à « pourquoi le verdict a changé » :
    le champ existait sans appelant côté prompt, le motif qui revient dans ce dépôt."""
    from app.services.chat_tools import GET_ACCOUNT_BRIEFING_TOOL

    description = GET_ACCOUNT_BRIEFING_TOOL["description"]
    assert "verdict_revision" in description
    assert "causes" in description
    assert "pourquoi le verdict a changé" in description
    assert "aucune révision" in description.lower()


@pytest.mark.asyncio
async def test_3235_relays_the_comparison_even_when_the_verdict_is_unchanged(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Recette 13/10 (Thales, 4 analyses) : « aucune révision » alors que deux analyses existent."""
    comparison = {
        "status": "unchanged",
        "previousVerdict": "GO",
        "newVerdict": "GO",
        "unchangedSince": "2026-09-10T00:00:00Z",
        "causes": [],
    }
    payload = {"versioning": None, "verdictRevision": None, "verdictComparison": comparison}
    monkeypatch.setattr(bellum_api, "account_versioning", AsyncMock(return_value=payload))

    result = await _run()

    assert result["verdict_comparison"] == {
        **comparison,
        "previousVerdict": "AGIR MAINTENANT",
        "previousVerdictCode": "GO",
        "newVerdict": "AGIR MAINTENANT",
        "newVerdictCode": "GO",
    }
    assert "verdict_revision" not in result


@pytest.mark.asyncio
async def test_3235_no_comparison_key_when_the_bridge_names_none(monkeypatch: pytest.MonkeyPatch) -> None:
    payload = {"versioning": None, "verdictRevision": None, "verdictComparison": None}
    monkeypatch.setattr(bellum_api, "account_versioning", AsyncMock(return_value=payload))

    assert "verdict_comparison" not in await _run()


@pytest.mark.asyncio
async def test_3235_comparison_names_verdicts_like_the_account_sheet_never_the_raw_code(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Recette 14/10 (Thales) : « verdict actuel RÉSERVE » à côté de « dernière analyse PRUDENT » — un seul
    verdict, deux vocabulaires (PRUDENT est le code brut que RÉSERVE nomme). Un seul vocabulaire côté Laura."""
    comparison = {
        "status": "changed",
        "previousVerdict": "GO",
        "newVerdict": "PRUDENT",
        "previousNoGoTrigger": None,
        "newNoGoTrigger": None,
        "causes": ["cause non capturée par cet instantané"],
    }
    revision = {
        "previousVerdict": "STOP",
        "newVerdict": "PRUDENT",
        "previousNoGoTrigger": "budget gelé",
        "newNoGoTrigger": None,
        "causes": ["x"],
    }
    payload = {"versioning": None, "verdictRevision": revision, "verdictComparison": comparison}
    monkeypatch.setattr(bellum_api, "account_versioning", AsyncMock(return_value=payload))

    result = await _run()

    assert result["verdict_comparison"]["previousVerdict"] == "AGIR MAINTENANT"
    assert result["verdict_comparison"]["newVerdict"] == "RÉSERVE"
    assert result["verdict_comparison"]["newVerdictCode"] == "PRUDENT"
    # `_run` passe profile_data=None (aucun objectif) : un STOP avec déclencheur = INCOMPATIBILITÉ ÉTABLIE.
    assert result["verdict_revision"]["previousVerdict"] == "INCOMPATIBILITÉ ÉTABLIE"
    assert result["verdict_revision"]["newVerdict"] == "RÉSERVE"


@pytest.mark.asyncio
async def test_3235_an_unreadable_side_stays_null_never_a_guessed_verdict(monkeypatch: pytest.MonkeyPatch) -> None:
    comparison = {
        "status": "unreadable",
        "previousVerdict": None,
        "newVerdict": "PRUDENT",
        "causes": ["le modèle a changé (a → b)"],
    }
    payload = {"versioning": None, "verdictRevision": None, "verdictComparison": comparison}
    monkeypatch.setattr(bellum_api, "account_versioning", AsyncMock(return_value=payload))

    result = (await _run())["verdict_comparison"]

    assert result["previousVerdict"] is None
    assert result["newVerdict"] == "RÉSERVE"
    assert result["causes"] == ["le modèle a changé (a → b)"]
