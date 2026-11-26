"""#3218 (lot RAW, recette G4 prod 11/10, conv dfeb2627) — « lance-la » après la proposition
d'analyse ⇒ « L'analyse n'a pas été relancée : dossier réutilisé sans débit », ni carte ni job.

POURQUOI RAT PASSAIT ET LA PROD ÉCHOUAIT ENCORE : RAT force bien `plan_account_analysis` puis
`start_account_analysis` (son test simule un `start` qui rend `started`). Mais le VRAI `start`
passe par `/internal/copilot/analysis/start` → `AnalysisService.start`, qui court-circuite tout
dossier complet de moins de 30 jours (`cache_hit`, `launched: false`) SAUF si `relaunch: true`.
Le pont n'acceptait pas `relaunch` (DTO `.strict()`), l'IA ne l'envoyait jamais : un lancement
DEMANDÉ explicitement sur un compte déjà analysé retombait toujours sur la réutilisation.

Ce test lit le payload RÉELLEMENT posté au pont."""

from __future__ import annotations

import pytest

from app.services import bellum_api
from app.services.chat_requested_mode import requested_mode_scope, set_turn_thread
from app.services.chat_tools import execute_chat_tool

USER = "11111111-1111-4111-8111-111111111111"


class _Resp:
    status_code = 200

    def json(self) -> object:
        return {"accountId": "acc-1", "jobId": "job-1", "launched": True, "reason": None, "contextUsed": []}


def _capturing_client(sent: list[dict]):
    class _Client:
        def __init__(self, *_a: object, **_kw: object) -> None:
            pass

        async def __aenter__(self) -> "_Client":
            return self

        async def __aexit__(self, *_exc: object) -> bool:
            return False

        async def post(self, url: str, *_a: object, json: dict | None = None, **_kw: object) -> _Resp:
            sent.append({"url": url, "json": json or {}})
            return _Resp()

    return _Client


@pytest.fixture
def sent(monkeypatch: pytest.MonkeyPatch) -> list[dict]:
    monkeypatch.setenv("API_INTERNAL_URL", "http://api.internal")
    monkeypatch.setenv("INTERNAL_API_SECRET", "s3cret")
    captured: list[dict] = []
    monkeypatch.setattr(bellum_api.httpx, "AsyncClient", _capturing_client(captured))
    return captured


async def _start() -> dict:
    return await execute_chat_tool(
        "start_account_analysis",
        {"company": "BNP Paribas", "plan_token": "tok-bnp"},
        user_id=USER,
        profile_data=None,
    )


@pytest.mark.asyncio
async def test_raw_3218_lance_la_after_the_scope_question_asks_a_relaunch(sent: list[dict]) -> None:
    set_turn_thread(
        "lance-la",
        [
            {"role": "user", "content": "Lance maintenant l'analyse approfondie de BNP Paribas"},
            {"role": "assistant", "content": "Sur quel périmètre veux-tu cadrer BNP Paribas ?"},
        ],
    )
    await _start()
    assert sent[-1]["url"].endswith("/internal/copilot/analysis/start")
    assert sent[-1]["json"].get("relaunch") is True


@pytest.mark.asyncio
async def test_raw_3218_the_deepen_mode_asks_a_relaunch(sent: list[dict]) -> None:
    set_turn_thread("Analyse BNP Paribas", [])
    with requested_mode_scope("approfondi"):
        await _start()
    assert sent[-1]["json"].get("relaunch") is True


@pytest.mark.asyncio
async def test_raw_3218_the_model_can_ask_a_relaunch_explicitly(sent: list[dict]) -> None:
    set_turn_thread("Relance l'analyse de BNP Paribas", [])
    await execute_chat_tool(
        "start_account_analysis",
        {"company": "BNP Paribas", "plan_token": "tok-bnp", "relaunch": True},
        user_id=USER,
        profile_data=None,
    )
    assert sent[-1]["json"].get("relaunch") is True


@pytest.mark.asyncio
async def test_raw_3218_a_plain_first_request_keeps_the_free_reuse(sent: list[dict]) -> None:
    # Témoin : « Analyse BNP Paribas » sans geste de relance — un dossier frais reste réutilisé
    # sans débit (le pont rend `cache_hit`), le payload est celui d'avant, clé pour clé.
    set_turn_thread("Analyse BNP Paribas", [])
    await _start()
    assert "relaunch" not in sent[-1]["json"]
