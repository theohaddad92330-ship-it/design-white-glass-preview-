"""#3939 (recette prod 13/10, Renault) — « où est la douleur sur ce compte ? » : une phrase + 4 puces
non numérotées, sans source, « aucun résultat d'outil ce tour ».

CAUSE : le compte étant déjà en contexte (prompt), le modèle répond SANS appeler `get_account_briefing`
(déjà noté à #2271.16). Même remède que #3513/#3399 : la règle vit dans le CHEMIN — au premier round
d'une question de douleur, avec un compte en portée, l'outil est FORCÉ. Et le briefing porte, pour chaque
douleur, son fait source daté (le signal du dossier de même domaine), jamais une probabilité.

#3939.3 (recette prod 14/10, Sanofi) — même défaut sur « Fais-moi un point rapide » : la phrase n'était
pas dans `PAIN_QUESTION_MARKERS`, donc ne forçait rien non plus."""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from app.services import chat_orchestrator
from app.services.chat_requested_mode import set_turn_thread
from app.services.chat_tools import build_account_briefing
from app.services.compilers.intent_router import asks_where_is_the_pain

BRIEFING = "get_account_briefing"


@pytest.mark.parametrize(
    "message",
    [
        "où est la douleur sur ce compte ?",
        "Ou est la douleur chez eux",
        "Quelles sont les douleurs de ce compte ?",
        "quels sont les pain points du compte",
        "Where is the pain on this account?",
        # #3939.3 (recette prod 14/10, Sanofi) — même défaut, phrase différente.
        "Fais-moi un point rapide",
        "Fais-moi un point",
        "Fais-moi le point",
    ],
)
def test_3939_the_pain_question_is_detected(message):
    assert asks_where_is_the_pain(message)


@pytest.mark.parametrize(
    "message", ["Bonjour", "Quel compte attaquer en premier ?", "J'ai mal au dos", "Faut-il aller chez LVMH ?"]
)
def test_3939_the_detector_says_no_elsewhere(message):
    assert asks_where_is_the_pain(message) is None


# #3939.3 (recette prod 14/10 R5, Sanofi) — « Fais-moi un point rapide » (check-in générique,
# sans la phrase explicite « où est la douleur ») répondait SANS appeler `get_account_briefing` :
# même cause racine que #3939 initial (Renault, 13/10), une autre phrase.
@pytest.mark.parametrize(
    "message",
    [
        "Fais-moi un point rapide",
        "Fais-moi un point rapide sur ce compte",
        "Tu peux me faire un point rapide sur Sanofi ?",
        "Give me a quick update on this account",
    ],
)
def test_3939_the_generic_check_in_is_also_detected(message):
    assert asks_where_is_the_pain(message)


_TOOLS = [{"name": BRIEFING}]


def test_3939_forces_the_briefing_at_round_zero_with_an_account_in_scope():
    forced = chat_orchestrator._forced_pain_briefing_kwargs(
        0, "où est la douleur sur ce compte ?", _TOOLS, account_in_scope=True
    )
    assert forced == {"force_tool": BRIEFING}


def test_3939_does_not_force_without_account_later_rounds_or_other_questions():
    ask = "où est la douleur sur ce compte ?"
    assert chat_orchestrator._forced_pain_briefing_kwargs(0, ask, _TOOLS, account_in_scope=False) == {}
    assert chat_orchestrator._forced_pain_briefing_kwargs(1, ask, _TOOLS, account_in_scope=True) == {}
    assert chat_orchestrator._forced_pain_briefing_kwargs(0, "Bonjour", _TOOLS, account_in_scope=True) == {}
    assert chat_orchestrator._forced_pain_briefing_kwargs(0, ask, [], account_in_scope=True) == {}


def _account() -> dict:
    return {
        "id": "acc-1",
        "company_name": "Renault",
        "raw_analysis": {
            "pains": [
                {"pain": "Migration cloud en retard", "domain_code": "cloud"},
                {"pain": "Dette data", "domain_code": "data"},
                {"pain": "Sans signal associé", "domain_code": "security"},
                {"pain": "Quatrième douleur", "domain_code": "cloud"},
            ],
            "recentSignals": [
                {"id": "s1", "signal": "Programme cloud décalé de 6 mois", "date": "2026-09-30", "domain_code": "cloud",
                 "freshness": "current", "source": "Les Echos"},
                {"id": "s2", "signal": "Ancien", "date": "2021-01-01", "domain_code": "data", "freshness": "archive"},
                {"id": "s3", "signal": "Chantier data lancé", "date": "2026-08-12", "domain_code": "data",
                 "freshness": "current"},
            ],
        },
    }


def test_3939_each_top_pain_carries_its_dated_source_fact_and_no_probability():
    briefing = build_account_briefing(_account())
    evidence = briefing["pain_evidence"]
    assert evidence[0] == {"pain": "Migration cloud en retard", "fact": "Programme cloud décalé de 6 mois", "date": "2026-09-30"}
    # L'archive est écartée, le signal courant du bon domaine retenu.
    assert evidence[1]["fact"] == "Chantier data lancé"
    # Une douleur sans signal de même domaine : AUCUNE ligne de source (rien d'inventé).
    assert all(e["pain"] != "Sans signal associé" for e in evidence)
    # Le fournisseur ne se nomme jamais, aucune probabilité.
    assert "source" not in evidence[0]
    assert not any(k in briefing for k in ("probability", "probabilite"))
    assert briefing["top_pains"] == ["Migration cloud en retard", "Dette data", "Sans signal associé"]


def test_3939_no_signal_no_evidence_key():
    account = _account()
    account["raw_analysis"].pop("recentSignals")
    assert "pain_evidence" not in build_account_briefing(account)


@pytest.mark.asyncio
async def test_3939_turn_forces_the_briefing_tool_on_the_real_path(monkeypatch):
    class _Throttle:
        async def __aenter__(self):
            return self

        async def __aexit__(self, *_a):
            return False

    class _Stream:
        def __init__(self, response):
            self._response = response

        async def __aenter__(self):
            return self

        async def __aexit__(self, *_exc):
            return False

        async def __aiter__(self):
            for block in self._response.content:
                if block.type == "text":
                    yield SimpleNamespace(type="text", text=block.text)

        async def get_final_message(self):
            return self._response

    responses = [
        SimpleNamespace(
            stop_reason="tool_use",
            content=[SimpleNamespace(type="tool_use", name=BRIEFING, input={"account_id": "acc-1"}, id="t1")],
        ),
        SimpleNamespace(stop_reason="end_turn", content=[SimpleNamespace(type="text", text="1. Cloud")]),
    ]
    calls: list[dict] = []

    class _Messages:
        def stream(self, **kwargs):
            calls.append({**kwargs, "messages": list(kwargs["messages"])})
            return _Stream(responses.pop(0))

    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-test")
    monkeypatch.setattr(chat_orchestrator, "throttle", lambda _p: _Throttle())
    monkeypatch.setattr(
        chat_orchestrator.anthropic, "AsyncAnthropic", lambda **_kw: SimpleNamespace(messages=_Messages())
    )
    monkeypatch.setattr(chat_orchestrator, "execute_chat_tool", AsyncMock(return_value={"top_pains": ["Cloud"]}))
    message = "où est la douleur sur ce compte ?"
    set_turn_thread(message, [])
    tier_context = chat_orchestrator.ChatTierContext(account_in_scope=True)

    await chat_orchestrator.run_chat_with_tools(
        "sys", message, user_id="u1", profile_data=None, user_message=message, tier_context=tier_context
    )

    assert calls[0]["tool_choice"] == {"type": "tool", "name": BRIEFING}
    assert "tool_choice" not in calls[1]


# #3243 (recette R37, 16/10) — la question de relance lit le compte (outil) avant de répondre.
@pytest.mark.parametrize(
    "message",
    ["Faut-il relancer Servier maintenant ?", "Dois-je relancer ce compte ?", "Should I follow up with Servier now?"],
)
def test_3243_a_follow_up_question_forces_the_briefing(message):
    assert chat_orchestrator._forced_pain_briefing_kwargs(0, message, _TOOLS, account_in_scope=True) == {
        "force_tool": BRIEFING
    }
    assert chat_orchestrator._forced_pain_briefing_kwargs(0, message, _TOOLS, account_in_scope=False) == {}
