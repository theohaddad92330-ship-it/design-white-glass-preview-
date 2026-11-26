"""#3758 (BEL-LAU-1001, reste du lot J14) — LA CARTE `post_meeting_summary`.

Rejoue le tour ENTIER (``/chat/message`` → modèle simulé qui appelle le VRAI
outil ``get_account_briefing`` → repli en texte, le comportement qu'on
corrige) — et prouve qu'une carte sort du SEUL compte rendu réellement
enregistré (``notes.meeting_recap_snapshot``), jamais du texte du modèle.
Même patron que ``test_l1_known_shape_gate.py``.
"""

from __future__ import annotations

import json
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi.testclient import TestClient

from app.services import bellum_api, chat_orchestrator
from app.services.reply_blocks import split_reply_blocks

USER = "11111111-1111-4111-8111-111111111111"
ACCOUNT_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"


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


def _tool_use(name: str, tool_input: dict) -> SimpleNamespace:
    return SimpleNamespace(type="tool_use", name=name, input=tool_input, id="t1")


def _resp(stop_reason: str, content: list) -> SimpleNamespace:
    usage = SimpleNamespace(input_tokens=100, output_tokens=20, cache_read_input_tokens=0, cache_creation_input_tokens=0)
    return SimpleNamespace(stop_reason=stop_reason, content=content, usage=usage)


@pytest.fixture(autouse=True)
def _patch_env(monkeypatch):
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-test")
    monkeypatch.delenv("CHAT_TURN_BUDGET_S", raising=False)
    monkeypatch.setattr(chat_orchestrator, "throttle", lambda _provider: _DummyThrottle())
    monkeypatch.setattr(bellum_api, "account_versioning", AsyncMock(return_value=None))
    monkeypatch.setattr(
        "app.services.ownership.fetch_owned_account",
        AsyncMock(return_value={"id": ACCOUNT_A, "company_name": "Sopra Steria", "raw_analysis": {}}),
    )


def _install_model(monkeypatch, model_text: str) -> None:
    """Le modèle simulé appelle `get_account_briefing`, puis répond en TEXTE —
    le repli qu'on corrige (comme #3707/#3762/#3767/#3771, lot L1)."""
    fake = _FakeClient(
        [
            _resp("tool_use", [_tool_use("get_account_briefing", {"account_id": ACCOUNT_A})]),
            _resp("end_turn", [_text(model_text)]),
        ]
    )
    monkeypatch.setattr(chat_orchestrator.anthropic, "AsyncAnthropic", lambda **_kw: fake)


def _install_notes(monkeypatch, rows: list[dict]) -> None:
    """Le carnet de notes de ce compte, antéchronologique — comme le lit
    `_last_meeting_recap` (`chat_tools.py`)."""
    chain = MagicMock()
    for method in ("select", "eq", "order", "limit"):
        getattr(chain, method).return_value = chain
    chain.aexecute = AsyncMock(return_value=MagicMock(data=rows))
    sb = MagicMock()
    sb.table.return_value = chain
    monkeypatch.setattr("app.services.supabase_client.get_supabase", lambda: sb)


def _ask(client: TestClient, message: str) -> dict:
    res = client.post("/chat/message", json={"message": message, "user_id": USER})
    assert res.status_code == 200
    events = [
        json.loads(chunk.strip()[len("data:") :].strip())
        for chunk in res.text.strip().split("\n\n")
        if chunk.strip().startswith("data:")
    ]
    done = events[-1]
    assert done["type"] == "done" and done["success"] is True, done
    return done["data"]


def _blocks(reply: str) -> list[dict]:
    return [s.block for s in split_reply_blocks(reply) if s.kind == "block" and s.block]


def test_a_recorded_recap_leaves_as_a_post_meeting_summary_card(monkeypatch, client: TestClient) -> None:
    _install_notes(
        monkeypatch,
        [
            {
                "created_at": "2026-10-05T10:00:00+00:00",
                "meeting_recap_snapshot": {
                    "decisions": ["On avance sur le pilote data."],
                    "nextSteps": [{"action": "Envoyer le devis", "owner": "Théo", "due": "vendredi"}],
                    "reminder": {"content": "Relancer après le comité budget.", "dueLabel": "dans deux semaines"},
                },
            }
        ],
    )
    _install_model(monkeypatch, "Voici ce qu'on a décidé au dernier rendez-vous.")
    data = _ask(client, "Qu'est-ce qu'on a décidé au compte rendu du rendez-vous avec Sopra Steria ?")
    blocks = _blocks(data["reply"])
    assert [b["type"] for b in blocks] == ["post_meeting_summary"]
    card = blocks[0]
    assert card["decisions"] == ["On avance sur le pilote data."]
    assert card["actions"] == [{"what": "Envoyer le devis", "owner": "Théo", "due": "vendredi"}]
    assert card["reminder"] == {"content": "Relancer après le comité budget.", "due_label": "dans deux semaines"}
    assert card["as_of"] == "2026-10-05T10:00:00+00:00"
    assert data["context"]["reply_family"] == {"family": "post_meeting_summary", "outcome": "structured"}
    # Le texte du modèle ne porte AUCUNE décision/action inventée : seule la carte les nomme.
    head = data["reply"].split("```")[0]
    assert "pilote data" not in head


def test_without_a_recorded_recap_the_absence_is_named_not_a_false_complete(monkeypatch, client: TestClient) -> None:
    _install_notes(monkeypatch, [])
    _install_model(monkeypatch, "Je n'ai rien de spécifique à rapporter sur ce rendez-vous.")
    data = _ask(client, "Compte rendu du rendez-vous avec Sopra Steria : quelles décisions ?")
    blocks = _blocks(data["reply"])
    assert [b["type"] for b in blocks] == ["missing_data"]
    assert data["context"]["reply_family"] == {"family": "post_meeting_summary", "outcome": "structured"}


def test_a_meeting_brief_request_through_the_same_tool_is_not_turned_into_a_recap_card(
    monkeypatch, client: TestClient
) -> None:
    """#3758 (reste) — un AUTRE usage de `get_account_briefing` (analyse de
    compte) ne doit jamais être lu comme « aucun compte rendu trouvé » : la
    règle de `post_meeting_summary` ne s'applique QUE quand la demande en
    relève — sinon la porte dirait « rien trouvé » sur un tour réussi."""
    _install_notes(monkeypatch, [])
    _install_model(monkeypatch, "Sopra Steria : dossier solide, verdict à qualifier davantage.")
    data = _ask(client, "Fais-moi l'analyse du compte Sopra Steria")
    assert _blocks(data["reply"]) == []
    assert "missing_data" not in data["reply"]
    assert data["reply"] == "Sopra Steria : dossier solide, verdict à qualifier davantage."
