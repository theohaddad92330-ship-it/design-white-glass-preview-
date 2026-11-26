"""Le PLAFOND d'un tour de copilote — celui que le budget du tour ne borne pas.

Retour bêta #1191 : `POST /api/ia/chat` en **502 après 120 076 ms**. Ce nombre est
le budget de l'APPELANT (`CHAT_CALLER_BUDGET_MS` = 120 000 côté NestJS), pas celui
du tour (`_DEFAULT_TURN_BUDGET_S` = 90 s). L'en-tête de `chat_orchestrator.py`
annonce pourtant : « Le plafond dur réellement observable est `budget +
_MIN_CALL_TIMEOUT_S` », soit 100 s. Cette phrase était FAUSSE, pour deux raisons
mesurables dans le code :

1. **L'exécution d'un outil n'est bornée par rien.** `execute_chat_tool` est
   attendu sans délai ; `_TOOL_ROUND_RESERVE_S` (25 s) ne fait que RÉSERVER du
   temps avant d'ouvrir un tour, il ne borne pas ce que le tour consomme. Un outil
   qui met trois minutes fait un tour de trois minutes.
2. **Tout ce qui précède `run_chat_with_tools` est HORS budget.** L'échéance naît
   à l'intérieur de cette fonction ; la récupération RAG (appel HTTP d'embedding +
   pgvector), la lecture des documents joints et le chargement de l'historique la
   précèdent — aucun n'est borné.

D'où ce plafond, posé là où les deux se voient : à l'entrée du handler. Il ne
remplace pas le budget du tour, il le REND VRAI — et il rend `_TIMEOUT_REPLY`
(qui dit le temps) au lieu d'un 502 qui ne dit rien.
"""

from __future__ import annotations

import asyncio
import json
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

from app.routers import chat as chat_router


def _terminal_event(text: str) -> dict:
    """`/chat/message` diffuse en SSE (LOT STREAM) — le dernier événement porte
    la MÊME forme que l'ancien corps JSON de cet endpoint."""
    events = [
        json.loads(block.strip()[len("data:") :].strip())
        for block in text.strip().split("\n\n")
        if block.strip().startswith("data:")
    ]
    return events[-1]


def test_le_plafond_reste_sous_le_budget_de_lappelant() -> None:
    """120 s côté NestJS. Un plafond au-dessus ne borne rien : l'appelant coupe
    d'abord, et l'utilisateur voit une panne au lieu d'une phrase."""
    assert chat_router._turn_ceiling_s() < 120.0


def test_le_plafond_laisse_finir_un_tour_legitime() -> None:
    """…et il ne doit pas être plus SERRÉ que le plafond que l'orchestrateur
    s'autorise, sinon il couperait des tours qui allaient aboutir."""
    from app.services import chat_orchestrator

    orchestrator_ceiling = (
        chat_orchestrator._DEFAULT_TURN_BUDGET_S + chat_orchestrator._MIN_CALL_TIMEOUT_S
    )
    assert chat_router._turn_ceiling_s() >= orchestrator_ceiling


def test_un_reglage_casse_ne_supprime_pas_le_plafond(monkeypatch) -> None:
    """Même mode de sûreté que le budget du tour : c'est l'ABSENCE de borne qui a
    causé la panne, un réglage illisible ne doit pas la recréer."""
    monkeypatch.setenv("CHAT_TURN_CEILING_S", "pas-un-nombre")
    assert chat_router._turn_ceiling_s() == chat_router._DEFAULT_TURN_CEILING_S
    monkeypatch.setenv("CHAT_TURN_CEILING_S", "0")
    assert chat_router._turn_ceiling_s() == chat_router._DEFAULT_TURN_CEILING_S


def test_un_outil_qui_ne_rend_jamais_la_main_est_coupe(client: TestClient, monkeypatch) -> None:
    """LE défaut de #1191, joué de bout en bout.

    L'orchestrateur part et ne revient pas (c'est ce que fait un outil non borné).
    Le handler doit rendre une réponse qui DIT le temps, dans son plafond — pas
    laisser l'appelant couper à 120 s sur un 502.
    """
    monkeypatch.setenv("CHAT_TURN_CEILING_S", "0.05")

    async def _never_returns(*_a, **_kw):
        await asyncio.sleep(30)
        raise AssertionError("le plafond n'a pas coupé")

    with patch("app.services.chat_orchestrator.run_chat_with_tools", new=_never_returns):
        res = client.post("/chat/message", json={"message": "enrichis ce contact", "user_id": "u1"})

    assert res.status_code == 200
    body = _terminal_event(res.text)
    assert body["success"] is False
    # La phrase du budget, pas un message générique : « une erreur est survenue »
    # envoie l'utilisateur relancer et repayer un tour pour le même mur.
    assert body["data"]["reply"] == chat_router._TIMEOUT_REPLY


def test_un_tour_normal_nest_pas_coupe(client: TestClient) -> None:
    """Contrôle : le plafond ne doit pas mordre sur un tour qui répond."""
    with patch(
        "app.services.chat_orchestrator.run_chat_with_tools",
        new_callable=AsyncMock,
        return_value=("Voici mon conseil.", []),
    ):
        res = client.post("/chat/message", json={"message": "Bonjour", "user_id": "u1"})

    assert res.status_code == 200
    assert _terminal_event(res.text)["data"]["reply"] == "Voici mon conseil."
