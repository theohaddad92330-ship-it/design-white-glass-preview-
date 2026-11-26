"""#3202 — un tour dont l'orchestrateur rend un texte VIDE ne finit jamais en « Pas de réponse. » nu.

Recette prod 29/09 : « je cherche des startups French Tech » → trois critères → précision →
réponse finale vide avec 3 sources. Le web posait son repli « Pas de réponse. ». Le service IA
nomme désormais ce qui a été lu, ou l'absence de lecture.
"""

from __future__ import annotations

import json
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient


def _terminal_event(text: str) -> dict:
    events = [
        json.loads(chunk.strip()[len("data:") :].strip())
        for chunk in text.strip().split("\n\n")
        if chunk.strip().startswith("data:")
    ]
    return events[-1]


def _post(client: TestClient, monkeypatch, actions: list[dict]) -> dict:
    monkeypatch.delenv("CHAT_TOOLS_DISABLED", raising=False)
    with (
        patch(
            "app.services.chat_orchestrator.run_chat_with_tools",
            new_callable=AsyncMock,
            return_value=("  ", actions),
        ),
        patch("app.routers.chat.conversation_service.save_turn", AsyncMock()),
    ):
        res = client.post(
            "/chat/message",
            json={"message": "France entière, sans contrainte de taille, levée de fonds", "user_id": "u1"},
        )
    return _terminal_event(res.text)


def test_an_empty_final_text_names_the_sources_it_read(client: TestClient, monkeypatch) -> None:
    actions = [
        {
            "status": "done",
            "tool": "find_accounts",
            "sources": [{"kind": "account", "label": "Registre French Tech", "as_of": "2026-09-20"}],
        }
    ]
    body = _post(client, monkeypatch, actions)
    reply = body["data"]["reply"]
    assert reply.strip() and reply.strip() != "Pas de réponse."
    assert "Registre French Tech" in reply
    assert "20/09/2026" in reply


def test_an_empty_final_text_without_any_read_says_nothing_was_read(client: TestClient, monkeypatch) -> None:
    body = _post(client, monkeypatch, [])
    reply = body["data"]["reply"]
    assert reply.strip()
    assert "aucune source" in reply.lower()


def test_2770_an_empty_final_text_stays_empty_when_a_card_was_produced(client: TestClient, monkeypatch) -> None:
    """Recette prod 08/10 (#2770) : second envoi dans le même fil → la carte du plan
    (`propose_focus_plan`) sortait, ET « Je n'ai pas pu rédiger de réponse ce tour »
    s'affichait EN PLUS, au-dessus. Une carte PRÊTE (`proposal`, pending_actions) est
    déjà ce que le tour rend : le repli d'échec ne se pose jamais par-dessus."""
    actions = [
        {
            "status": "done",
            "tool": "propose_focus_plan",
            "proposal": {"action": "propose_focus_plan", "plan": {"date": "2026-10-08"}, "cost_credits": 0},
        }
    ]
    body = _post(client, monkeypatch, actions)
    reply = body["data"]["reply"]
    assert reply.strip() == ""
    assert "pas pu rédiger de réponse" not in reply


def test_2983_an_empty_final_text_never_turns_into_a_wall_of_bullets(client: TestClient, monkeypatch) -> None:
    """Recette prod 01/10 (« comptes banque Île-de-France ») : « Aucun résultat n'est
    rapporté » suivi de 26 puces hors sujet. Un texte vide ne dérive pas une liste
    de toutes les sources lues : au plus trois, dédoublonnées, le reste se compte."""
    actions = [
        {
            "status": "done",
            "tool": "web_search",
            "sources": [{"kind": "web", "label": f"Appel d'offres {i % 20}", "as_of": "2026-09-20"} for i in range(26)],
        }
    ]
    reply = _post(client, monkeypatch, actions)["data"]["reply"]
    bullets = [line for line in reply.splitlines() if line.startswith("- ")]
    assert 1 <= len(bullets) <= 3
    assert len(set(bullets)) == len(bullets)
    assert "Aucun résultat n'est rapporté" not in reply
    assert "17" in reply  # 20 sources distinctes − 3 montrées : le reste se COMPTE
