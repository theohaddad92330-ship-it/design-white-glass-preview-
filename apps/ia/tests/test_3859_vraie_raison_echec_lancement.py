"""#3859.4 (recette prod 10/10) — « trouve-moi 5 décideurs IT chez Lactalis » :
Laura répond « l'analyse n'a pas pu être lancée ici » sans aucune raison.

Cause mécanique : `bellum_api._post` rend `None` pour TOUT échec (non configuré,
HTTP 4xx/5xx, délai) ; `plan_account_analysis` / `start_account_analysis`
rendaient alors « Je n'ai pas pu préparer l'analyse » — la même phrase pour
« service indisponible », « crédits » et « compte introuvable ». Et un
`launched: false` (dossier récent déjà là, rejeu démo) se lisait « non lancée »
sans dire pourquoi. Chaque cas se NOMME, aucun faux succès.
"""

from __future__ import annotations

import pytest

from app.services import bellum_api
from app.services.chat_tools import execute_chat_tool

USER = "11111111-1111-4111-8111-111111111111"


class _Resp:
    def __init__(self, status: int, body: object) -> None:
        self.status_code = status
        self._body = body

    def json(self) -> object:
        return self._body


def _fake_client(response: _Resp | Exception):
    class _Client:
        def __init__(self, *_a: object, **_kw: object) -> None:
            pass

        async def __aenter__(self) -> "_Client":
            return self

        async def __aexit__(self, *_exc: object) -> bool:
            return False

        async def post(self, *_a: object, **_kw: object) -> _Resp:
            if isinstance(response, Exception):
                raise response
            return response

    return _Client


@pytest.fixture
def _bridge(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("API_INTERNAL_URL", "http://api.internal")
    monkeypatch.setenv("INTERNAL_API_SECRET", "s3cret")


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("response", "needle"),
    [
        (_Resp(402, {}), "beaucoup utilisé"),
        (_Resp(404, {}), "introuvable"),
        (_Resp(503, {}), "indisponible"),
        (_Resp(500, {}), "indisponible"),
        (TimeoutError(), "indisponible"),
    ],
)
async def test_plan_failure_names_the_real_reason(
    monkeypatch: pytest.MonkeyPatch, _bridge: None, response: _Resp | Exception, needle: str
) -> None:
    monkeypatch.setattr(bellum_api.httpx, "AsyncClient", _fake_client(response))
    out = await execute_chat_tool("plan_account_analysis", {"company": "Lactalis"}, user_id=USER, profile_data=None)
    assert needle in out["error"].lower()
    # Never a success shape on failure.
    assert "plan_token" not in out and "launched" not in out


@pytest.mark.asyncio
async def test_start_failure_names_the_reason_not_a_silent_none(monkeypatch: pytest.MonkeyPatch, _bridge: None) -> None:
    monkeypatch.setattr(bellum_api.httpx, "AsyncClient", _fake_client(_Resp(503, {})))
    out = await execute_chat_tool(
        "start_account_analysis", {"company": "Lactalis", "plan_token": "tok"}, user_id=USER, profile_data=None
    )
    assert "indisponible" in out["error"].lower()
    assert "launched" not in out


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("reason", "needle"),
    [("cache_hit", "récent"), ("demo_replay", "démo")],
)
async def test_not_launched_says_why_and_never_claims_a_run(
    monkeypatch: pytest.MonkeyPatch, reason: str, needle: str
) -> None:
    async def fake_start(user_id: str, **_kw: object) -> dict:
        return {"accountId": "a1", "jobId": None, "launched": False, "reason": reason}

    monkeypatch.setattr(bellum_api, "start_account_analysis", fake_start)
    out = await execute_chat_tool(
        "start_account_analysis", {"company": "Lactalis", "plan_token": "tok"}, user_id=USER, profile_data=None
    )
    assert out["launched"] is False
    assert needle in out["not_launched_because"].lower()
