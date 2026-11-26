"""#3218 (lot RBJ) — « le périmètre retenu n'est pas encore transmis au run ».

La chaîne : IA `start_account_analysis` → pont `/internal/copilot/analysis/start` (qui accepte et
transmet déjà `scope_mode`, `copilot-bridge.controller.ts`) → `AnalysisService.start` (coût, historique
des runs `analysis_runs.scope_mode`, job) → dossier (`RelaunchImpact`, historique des runs). Le maillon
CASSÉ était le premier : l'outil n'avait ni paramètre `scope_mode`, `bellum_api.start_account_analysis`
ne l'envoyait jamais — le run partait « sans périmètre » même quand la personne avait choisi.

Deux chemins : le périmètre que le modèle NOMME (`scope_mode`), et l'acquiescement « lance-la » à la
question de périmètre, où le périmètre retenu est le premier proposé (`scopeGuardrail.suggestedScopeMode`
de la préparation), jamais deviné ailleurs. Ces tests lisent le payload RÉELLEMENT posté au pont."""

from __future__ import annotations

import pytest

from app.services import bellum_api
from app.services.chat_requested_mode import set_turn_thread
from app.services.chat_tools import START_ANALYSIS_TOOL, execute_chat_tool

USER = "11111111-1111-4111-8111-111111111111"
_GUARDRAIL = {"suggestedScopeMode": "business_unit", "reason": "grande entreprise"}
_ASKED = [
    {"role": "user", "content": "Lance maintenant l'analyse approfondie de BNP Paribas"},
    {"role": "assistant", "content": "BNP Paribas est un groupe trop large. Quel périmètre : direction ou programme ?"},
]


class _Resp:
    status_code = 200

    def json(self) -> object:
        return {"accountId": "acc-1", "jobId": "job-1", "launched": True, "reason": None, "contextUsed": []}


def _capturing_client(sent: list[dict]):
    class _Client:
        def __init__(self, *_a: object, **_kw: object) -> None:
            pass

        async def __aenter__(self) -> _Client:
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


async def _start(extra: dict | None = None) -> dict:
    return await execute_chat_tool(
        "start_account_analysis",
        {"company": "BNP Paribas", "plan_token": "tok-bnp", **(extra or {})},
        user_id=USER,
        profile_data=None,
    )


def _posts_to_start(sent: list[dict]) -> list[dict]:
    return [c for c in sent if c["url"].endswith("/internal/copilot/analysis/start")]


@pytest.mark.asyncio
async def test_rbj_3218_the_scope_the_model_names_reaches_the_bridge(sent: list[dict]) -> None:
    set_turn_thread("analyse BNP Paribas en France", [])
    await _start({"scope_mode": "france"})
    assert _posts_to_start(sent)[-1]["json"]["scope_mode"] == "france"


@pytest.mark.asyncio
async def test_rbj_3218_an_unknown_scope_is_dropped_not_sent(sent: list[dict]) -> None:
    # le contrat du pont est `.strict()` + enum : une valeur inventée ferait refuser TOUT le lancement.
    set_turn_thread("analyse BNP Paribas", [])
    await _start({"scope_mode": "tout_le_monde"})
    assert "scope_mode" not in _posts_to_start(sent)[-1]["json"]


@pytest.mark.asyncio
async def test_rbj_3218_no_scope_named_keeps_the_payload_byte_identical(sent: list[dict]) -> None:
    set_turn_thread("analyse BNP Paribas", [])
    await _start()
    assert "scope_mode" not in _posts_to_start(sent)[-1]["json"]


@pytest.mark.asyncio
async def test_rbj_3218_lance_la_carries_the_first_proposed_scope_to_the_run(
    monkeypatch: pytest.MonkeyPatch, sent: list[dict]
) -> None:
    async def fake_plan(user_id, *, company, locale="fr"):
        return {"account": None, "costCredits": 8, "creditsLeft": 40, "planToken": "t", "scopeGuardrail": _GUARDRAIL}

    monkeypatch.setattr(bellum_api, "plan_account_analysis", fake_plan)
    set_turn_thread("lance-la", _ASKED)
    planned = await execute_chat_tool(
        "plan_account_analysis", {"company": "BNP Paribas"}, user_id=USER, profile_data=None
    )
    assert planned["status"] == "scope_accepted_default"
    # le modèle appelle `start` SANS nommer de périmètre (il ne le fait pas à coup sûr) :
    await _start()
    assert _posts_to_start(sent)[-1]["json"]["scope_mode"] == "business_unit"


@pytest.mark.asyncio
async def test_rbj_3218_what_the_model_names_beats_the_default(
    monkeypatch: pytest.MonkeyPatch, sent: list[dict]
) -> None:
    async def fake_plan(user_id, *, company, locale="fr"):
        return {"account": None, "costCredits": 8, "creditsLeft": 40, "planToken": "t", "scopeGuardrail": _GUARDRAIL}

    monkeypatch.setattr(bellum_api, "plan_account_analysis", fake_plan)
    set_turn_thread("lance-la", _ASKED)
    await execute_chat_tool("plan_account_analysis", {"company": "BNP Paribas"}, user_id=USER, profile_data=None)
    await _start({"scope_mode": "filiales"})
    assert _posts_to_start(sent)[-1]["json"]["scope_mode"] == "filiales"


@pytest.mark.asyncio
async def test_rbj_3218_a_plain_first_request_never_inherits_a_default(
    monkeypatch: pytest.MonkeyPatch, sent: list[dict]
) -> None:
    # sait dire NON : hors acquiescement, le garde-fou n'est qu'une suggestion, pas un choix de la personne.
    async def fake_plan(user_id, *, company, locale="fr"):
        return {"account": None, "costCredits": 8, "creditsLeft": 40, "planToken": "t", "scopeGuardrail": _GUARDRAIL}

    monkeypatch.setattr(bellum_api, "plan_account_analysis", fake_plan)
    set_turn_thread("Analyse BNP Paribas", [])
    await execute_chat_tool("plan_account_analysis", {"company": "BNP Paribas"}, user_id=USER, profile_data=None)
    await _start()
    assert "scope_mode" not in _posts_to_start(sent)[-1]["json"]


def test_rbj_3218_the_tool_schema_offers_exactly_the_contract_modes() -> None:
    enum = START_ANALYSIS_TOOL["input_schema"]["properties"]["scope_mode"]["enum"]
    assert set(enum) == {
        "groupe",
        "france",
        "filiales",
        "it_digital",
        "startups",
        "business_unit",
        "direction",
        "programme",
        "site",
        "custom",
    }
