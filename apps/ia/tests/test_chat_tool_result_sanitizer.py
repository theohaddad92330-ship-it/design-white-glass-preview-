"""#2438.6 — purger secrets et données d'un autre workspace des résultats d'outil.

Avant ce lot : aucune purge de résultat d'outil. `workspace-isolation.spec.ts`
garde l'isolation DB générale (côté NestJS), jamais un résultat d'outil IA
qu'un connecteur tiers ou un champ mal projeté aurait pu faire fuiter vers le
modèle. Deux garanties, dans l'esprit GA-18/GA-19 (on NOMME ce qui a été
retiré, on ne le fait pas juste disparaître) :

1. `sanitize_tool_result` retire toute clé « secrète » (token, mot de passe,
   clé API…) n'importe où dans l'arbre, y compris imbriquée.
2. Elle retire tout `workspace_id`/`workspaceId` — un résultat d'outil de chat
   n'a jamais eu besoin d'exposer cet identifiant interne au modèle, et un
   champ de ce nom qui ne serait PAS celui de l'appelant est la fuite exacte
   que ce point referme.
3. `execute_chat_tool` applique la purge à CHAQUE résultat avant de le rendre.
"""

from __future__ import annotations

import pytest

from app.services import chat_tools
from app.services.tool_result_sanitizer import sanitize_tool_result

USER = "11111111-1111-4111-8111-111111111111"


def test_sanitize_tool_result_redacts_known_secret_keys_anywhere_nested():
    raw = {
        "account_id": "acc-1",
        "api_key": "sk-live-abc",
        "nested": {"access_token": "xyz", "label": "ok"},
        "list": [{"client_secret": "shh"}, {"fine": "value"}],
    }
    cleaned = sanitize_tool_result(raw)

    assert cleaned["account_id"] == "acc-1"
    assert cleaned["api_key"] != "sk-live-abc"
    assert cleaned["nested"]["access_token"] != "xyz"
    assert cleaned["nested"]["label"] == "ok"
    assert cleaned["list"][0]["client_secret"] != "shh"
    assert cleaned["list"][1]["fine"] == "value"


def test_sanitize_tool_result_redacts_workspace_id_anywhere_in_the_tree():
    raw = {"contacts": [{"workspace_id": "22222222-2222-4222-8222-222222222222", "name": "A"}]}
    cleaned = sanitize_tool_result(raw)

    assert "22222222-2222-4222-8222-222222222222" not in str(cleaned)
    assert cleaned["contacts"][0]["name"] == "A"


def test_sanitize_tool_result_keeps_the_analysis_plan_token():
    # `plan_token` (#1489) est un jeton de SÉQUENCEMENT, pas un secret — le
    # modèle doit pouvoir le reporter au clic « go ». Seule exemption nommée.
    raw = {"action": "start_account_analysis", "plan_token": "tok-abc", "planToken": "tok-abc"}
    cleaned = sanitize_tool_result(raw)

    assert cleaned["plan_token"] == "tok-abc"
    assert cleaned["planToken"] == "tok-abc"


def test_sanitize_tool_result_leaves_ordinary_data_untouched():
    raw = {"account_id": "acc-1", "company_name": "Acme", "score": 42}
    assert sanitize_tool_result(raw) == raw


async def test_execute_chat_tool_applies_the_sanitizer_to_every_result(monkeypatch: pytest.MonkeyPatch):
    calls: list[dict] = []
    original = chat_tools.sanitize_tool_result

    def _spy(value):
        calls.append(value)
        return original(value)

    async def _noop_record(*a, **k) -> None:
        return None

    monkeypatch.setattr(chat_tools, "sanitize_tool_result", _spy)
    monkeypatch.setattr(chat_tools, "record_tool_call", _noop_record)

    result = await chat_tools.execute_chat_tool("un_outil_qui_nexiste_pas", {}, user_id=USER, profile_data=None)

    assert calls, "execute_chat_tool n'a jamais appelé le sanitizer"
    assert result == {"error": "Outil inconnu: un_outil_qui_nexiste_pas"}
