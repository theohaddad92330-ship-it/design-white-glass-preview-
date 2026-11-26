"""#1943.3 — 3 cartes au plus par réponse, 1 principale (décision de Louis du 13/09).

L'orchestrateur EMPILAIT les propositions sans plafond : chaque outil d'écriture
qui rendait ``pending_confirmation`` ajoutait une carte, et une réponse pouvait en
porter autant que le modèle avait appelé d'outils (deux rounds × N appels).

La garde vit dans le CODE, pas dans le prompt : une consigne « au plus trois » est
un conseil que le modèle suit la plupart du temps. Au-delà du plafond, la
proposition est ABANDONNÉE — son entrée d'action ne porte plus de ``proposal``,
donc ``chat.py`` ne la met pas dans ``pending_actions`` — et le modèle en est
INFORMÉ par le résultat d'outil, pour qu'il n'annonce pas une carte qui
n'apparaîtra pas. Le journal dit COMBIEN, jamais QUOI (ni contact, ni note).

L'API refait la même coupe à la proposition (défense en profondeur) ; la valeur
est lue des deux côtés par ``packages/contracts/src/schemas/copilot-card.test.ts``.
"""

from __future__ import annotations

import json
import logging
from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from app.services import chat_orchestrator


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
        for block in getattr(self._response, "content", None) or []:
            if getattr(block, "type", None) == "text":
                yield SimpleNamespace(type="text", text=block.text)

    async def get_final_message(self):
        return self._response


class _Client:
    def __init__(self, responses):
        self._responses = list(responses)
        self.calls: list[dict] = []
        self.messages = SimpleNamespace(stream=self._stream)

    def _stream(self, **kwargs):
        # Copie profonde par sérialisation : le transport MUTE sa liste de
        # messages d'un round à l'autre, et on veut ce qui est parti À CET appel.
        self.calls.append(json.loads(json.dumps(kwargs, default=str)))
        return _Stream(self._responses.pop(0))


def _tool_use(index: int, name: str = "schedule_reminder_for_contact") -> SimpleNamespace:
    return SimpleNamespace(
        type="tool_use",
        name=name,
        input={"contact_id": f"contact-{index}", "at": "2026-09-14T09:00:00Z"},
        id=f"toolu_{index}",
    )


def _round(*blocks: SimpleNamespace) -> SimpleNamespace:
    return SimpleNamespace(stop_reason="tool_use", content=list(blocks))


def _final(text: str = "Voici ce que je te propose.") -> SimpleNamespace:
    return SimpleNamespace(stop_reason="end_turn", content=[SimpleNamespace(type="text", text=text)])


def _proposal_for(name: str, tool_input: dict, **_kw) -> dict:
    if name == "compare_accounts":
        return {"recommendation": "A"}
    return {
        "status": "pending_confirmation",
        "message": "Action préparée, PAS exécutée.",
        "proposal": {
            "action": "schedule_reminder",
            "contact_id": tool_input["contact_id"],
            "at": tool_input["at"],
            # Un contenu qui ne doit JAMAIS apparaître au journal.
            "note": f"NOTE-CONFIDENTIELLE-{tool_input['contact_id']}",
        },
    }


@pytest.fixture
def install(monkeypatch):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-test")
    monkeypatch.setattr(chat_orchestrator, "throttle", lambda _p: _Throttle())
    monkeypatch.setattr(chat_orchestrator, "execute_chat_tool", AsyncMock(side_effect=_proposal_for))

    def _install(responses):
        client = _Client(responses)
        monkeypatch.setattr(chat_orchestrator.anthropic, "AsyncAnthropic", lambda **_kw: client)
        return client

    return _install


def _kept(actions: list[dict]) -> list[str]:
    return [a["proposal"]["contact_id"] for a in actions if a.get("proposal")]


def test_the_cap_is_three():
    assert chat_orchestrator._MAX_CARDS_PER_REPLY == 3


async def test_four_proposals_in_one_round_keep_the_first_three(install):
    client = install([_round(*(_tool_use(i) for i in range(4))), _final()])

    _reply, actions = await chat_orchestrator.run_chat_with_tools("sys", "user", user_id="u1", profile_data=None)

    assert _kept(actions) == ["contact-0", "contact-1", "contact-2"]
    dropped = [a for a in actions if not a.get("proposal")]
    assert len(dropped) == 1
    assert dropped[0]["status"] == "not_proposed"
    # Le modèle SAIT que la quatrième n'est pas affichée : sinon il l'annonce.
    second_call = json.dumps(client.calls[1]["messages"], ensure_ascii=False)
    assert "not_proposed" in second_call


async def test_the_cap_spans_the_two_rounds_of_a_turn(install):
    install([_round(_tool_use(0), _tool_use(1)), _round(_tool_use(2), _tool_use(3)), _final()])

    _reply, actions = await chat_orchestrator.run_chat_with_tools("sys", "user", user_id="u1", profile_data=None)

    assert _kept(actions) == ["contact-0", "contact-1", "contact-2"]
    assert [a["status"] for a in actions].count("not_proposed") == 1


async def test_three_proposals_are_all_kept(install):
    """Témoin : la garde n'attrape pas ce qu'elle ne vise pas."""
    client = install([_round(*(_tool_use(i) for i in range(3))), _final()])

    _reply, actions = await chat_orchestrator.run_chat_with_tools("sys", "user", user_id="u1", profile_data=None)

    assert _kept(actions) == ["contact-0", "contact-1", "contact-2"]
    assert all(a["status"] == "pending_confirmation" for a in actions)
    assert "not_proposed" not in json.dumps(client.calls[1]["messages"], ensure_ascii=False)


async def test_a_read_tool_is_never_counted_as_a_card(install):
    install(
        [
            _round(
                _tool_use(0),
                _tool_use(1),
                SimpleNamespace(
                    type="tool_use", name="compare_accounts", input={"account_ids": ["a", "b"]}, id="toolu_read"
                ),
                _tool_use(2),
            ),
            _final(),
        ]
    )

    _reply, actions = await chat_orchestrator.run_chat_with_tools("sys", "user", user_id="u1", profile_data=None)

    assert _kept(actions) == ["contact-0", "contact-1", "contact-2"]
    assert next(a for a in actions if a["tool"] == "compare_accounts")["status"] == "done"


async def test_the_drop_is_logged_with_counts_never_content(install, caplog):
    install([_round(*(_tool_use(i) for i in range(5))), _final()])

    with caplog.at_level(logging.INFO, logger=chat_orchestrator.logger.name):
        await chat_orchestrator.run_chat_with_tools("sys", "user", user_id="u1", profile_data=None)

    messages = [record.getMessage() for record in caplog.records if record.name == chat_orchestrator.logger.name]
    assert any("plafond" in message and "2" in message for message in messages)
    assert not any("NOTE-CONFIDENTIELLE" in message or "contact-" in message for message in messages)
