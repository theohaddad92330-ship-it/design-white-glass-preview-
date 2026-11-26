"""#3540 (recette prod 02/10) — « Que dois-je faire cette semaine ? » : le TOUR entier rejoué
(modèle simulé → vrai outil ``get_portfolio_priorities`` → pont simulé). Les chiffres de la
réponse (« 3 comptes sur 46 ») viennent du résultat d'outil (``counts``) : le vérificateur ne
trouve rien de non sourcé, donc aucune « Précision : certains chiffres… » n'est ajoutée.

Question exacte à poser en recette : /chat, « Que dois-je faire cette semaine ? » — la réponse
ne contient jamais « Précision : certains chiffres ci-dessus ne viennent d'aucun résultat d'outil ».
"""

from __future__ import annotations

from types import SimpleNamespace

import pytest

from app.services import chat_orchestrator

USER = "11111111-1111-4111-8111-111111111111"


class _DummyThrottle:
    async def __aenter__(self):
        return self

    async def __aexit__(self, *_a):
        return False


class _FakeMessageStream:
    def __init__(self, response):
        self._response = response

    async def __aenter__(self):
        return self

    async def __aexit__(self, *_exc):
        return False

    async def __aiter__(self):
        for block in getattr(self._response, "content", None) or []:
            if getattr(block, "type", None) == "text":
                yield SimpleNamespace(type="text", text=block.text)

    async def get_final_message(self):
        return self._response


class _FakeMessages:
    def __init__(self, responses):
        self._responses = list(responses)

    def stream(self, **_kwargs):
        return _FakeMessageStream(self._responses.pop(0))


class _FakeClient:
    def __init__(self, responses):
        self.messages = _FakeMessages(responses)


def _text(text: str) -> SimpleNamespace:
    return SimpleNamespace(type="text", text=text)


def _tool_use(name: str, tool_input: dict, block_id: str) -> SimpleNamespace:
    return SimpleNamespace(type="tool_use", name=name, input=tool_input, id=block_id)


def _resp(stop_reason: str, content: list) -> SimpleNamespace:
    usage = SimpleNamespace(
        input_tokens=100, output_tokens=20, cache_read_input_tokens=0, cache_creation_input_tokens=0
    )
    return SimpleNamespace(stop_reason=stop_reason, content=content, usage=usage)


@pytest.fixture(autouse=True)
def _patch_env(monkeypatch):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-test")
    monkeypatch.delenv("CHAT_TURN_BUDGET_S", raising=False)
    monkeypatch.setattr(chat_orchestrator, "throttle", lambda _provider: _DummyThrottle())


def _install_client(monkeypatch, responses) -> None:
    fake = _FakeClient(responses)
    monkeypatch.setattr(chat_orchestrator.anthropic, "AsyncAnthropic", lambda **_kw: fake)


import json

from fastapi.testclient import TestClient



def _parse_sse(text: str) -> list[dict]:
    events: list[dict] = []
    for block in text.strip().split("\n\n"):
        block = block.strip()
        if block.startswith("data:"):
            events.append(json.loads(block[len("data:") :].strip()))
    return events




def _priorities_result() -> dict:
    watch = [
        {"id": f"a{i}", "companyName": f"Compte {i}", "bucket": "to_watch", "reason": "Sans mouvement actuel."}
        for i in range(3)
    ]
    return {
        "now": [],
        "toVerify": [],
        "toWatch": watch,
        "notNow": [],
        "capacityCap": 5,
        "emptyBuckets": ["now", "to_verify", "not_now"],
        "diversityNotes": [],
        "counts": {"now": 0, "toVerify": 0, "toWatch": 3, "notNow": 0, "total": 46, "outsideNow": 46},
    }


def test_the_week_turn_writes_only_figures_the_tool_returned(monkeypatch, client: TestClient) -> None:
    from app.services import bellum_api

    async def _portfolio_priorities(*_a, **_kw):
        return _priorities_result()

    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)
    monkeypatch.setattr(bellum_api, "portfolio_priorities", _portfolio_priorities)
    _install_client(
        monkeypatch,
        [
            _resp("tool_use", [_tool_use("get_portfolio_priorities", {}, "t1")]),
            _resp("end_turn", [_text("Rien d'urgent : 3 comptes à surveiller sur 46 suivis, aucun à travailler maintenant.")]),
        ],
    )

    res = client.post("/chat/message", json={"message": "Que dois-je faire cette semaine ?", "user_id": USER})

    assert res.status_code == 200
    events = _parse_sse(res.text)
    assert events[-1]["type"] == "done" and events[-1]["success"] is True, events[-1]
    streamed = "".join(e.get("text", "") for e in events if e.get("type") == "delta")
    assert "46" in streamed
    assert "Précision" not in streamed and "certains chiffres" not in streamed


def test_the_portfolio_prompt_tells_laura_to_read_counts_from_the_tool() -> None:
    from app.prompts import bellum_advisor

    text = bellum_advisor.__dict__
    prompts = "\n".join(v for v in text.values() if isinstance(v, str))
    assert "`counts`" in prompts and "n'écris aucun nombre que l'outil n'a pas rendu" in prompts


def test_the_week_turn_with_43_other_accounts_reads_them_from_outside_now(monkeypatch, client: TestClient) -> None:
    """Recette Y7 02/10 : « 43 autres comptes » était 46 − 3 calculé par Laura → « Précision… »."""
    from app.services import bellum_api

    result = _priorities_result()
    result["counts"] = {"now": 3, "toVerify": 0, "toWatch": 43, "notNow": 0, "total": 46, "outsideNow": 43}

    async def _portfolio_priorities(*_a, **_kw):
        return result

    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)
    monkeypatch.setattr(bellum_api, "portfolio_priorities", _portfolio_priorities)
    _install_client(
        monkeypatch,
        [
            _resp("tool_use", [_tool_use("get_portfolio_priorities", {}, "t1")]),
            _resp("end_turn", [_text("3 comptes à travailler maintenant ; 43 autres comptes restent à surveiller.")]),
        ],
    )
    res = client.post("/chat/message", json={"message": "Que dois-je faire cette semaine ?", "user_id": USER})
    streamed = "".join(e.get("text", "") for e in _parse_sse(res.text) if e.get("type") == "delta")
    assert "43" in streamed and "Précision" not in streamed


def test_the_prompt_points_other_accounts_to_outside_now() -> None:
    from app.prompts import bellum_advisor

    assert "outsideNow" in "".join(v for v in vars(bellum_advisor).values() if isinstance(v, str))


def test_the_portfolio_prompt_tells_laura_to_cite_effort_budget_or_name_it_unmeasured() -> None:
    """#3245 (réfuté, recette 07/10) — la réponse à « où investir mon temps cette
    semaine ? » ne mentionnait jamais la charge commerciale, et quand elle n'est pas
    réglée (`weeklyAvailableHours` nul), rien ne disait qu'elle n'est pas mesurée
    (silence plutôt que « non mesuré » — jamais « 0 », doctrine GA-18/GA-19)."""
    from app.prompts import bellum_advisor

    prompts = "\n".join(v for v in vars(bellum_advisor).values() if isinstance(v, str))
    assert "effortBudget" in prompts
    assert "weeklyAvailableHours" in prompts
    assert "non mesurée" in prompts or "pas mesurée" in prompts


def test_the_portfolio_prompt_tells_laura_to_relay_objective_and_first_action() -> None:
    """#3245 (réfuté, recette 07/10) — aucune mention d'objectif/première action pour
    les comptes « maintenant », alors que l'outil les porte (`objective`, `firstAction`,
    `expectedTime`)."""
    from app.prompts import bellum_advisor

    prompts = "\n".join(v for v in vars(bellum_advisor).values() if isinstance(v, str))
    assert "`objective`" in prompts
    assert "`firstAction`" in prompts
    assert "`expectedTime`" in prompts


def test_the_portfolio_prompt_tells_laura_to_cite_a_long_bet_even_on_a_mixed_portfolio() -> None:
    """#3245 (réfuté, recette 07/10) — Accor et AIRBUS sont déclarés « Pari long »,
    mais un troisième compte « maintenant » non déclaré empêchait `diversityNotes`
    de dire quoi que ce soit (règle : CHACUN doit le déclarer) — Laura répondait
    « charge disponible non mesurée » sans jamais citer les paris longs déclarés."""
    from app.prompts import bellum_advisor

    prompts = "\n".join(v for v in vars(bellum_advisor).values() if isinstance(v, str))
    assert "`betHorizon`" in prompts
    assert "pari long" in prompts
