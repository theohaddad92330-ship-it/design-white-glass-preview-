"""#1957.11 / #1957.12 — un tour qui dépasse son temps montre ce qu'il a DÉJÀ récupéré.

Le plafond du tour (`CHAT_TURN_CEILING_S`, 105 s) coupe l'orchestrateur par
`asyncio.wait_for`. Jusqu'ici, l'annulation emportait l'accumulateur des actions
avec la coroutine : un tour qui avait déjà lu deux dossiers de compte rendait
« Je n'ai pas réussi à terminer cette réponse » et RIEN d'autre — le travail
fait était perdu, et la personne relançait un tour complet pour le refaire.

Ce que ces tests tiennent :

1. l'orchestrateur remplit l'accumulateur de l'APPELANT au fil des rounds, donc
   ce qui a été lu survit à l'annulation ;
2. à l'expiration, ce qui a été LU (outils terminés, sources datées) est rendu
   comme PARTIEL et daté — jamais « aucun résultat » ;
3. ce qui n'a pas été lu ne se présente pas comme récupéré : une proposition
   préparée, un outil en erreur, ou rien du tout → la phrase du temps seule,
   byte-identique à avant ;
4. la phrase suit la langue de l'INTERFACE (#1958.8).
"""

from __future__ import annotations

import asyncio
import json
import time
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient

from app.routers import chat as chat_router
from app.services import chat_orchestrator


def _terminal_event(text: str) -> dict:
    events = [
        json.loads(block.strip()[len("data:") :].strip())
        for block in text.strip().split("\n\n")
        if block.strip().startswith("data:")
    ]
    return events[-1]


_DOSSIER_READ = {
    "tool": "get_account_briefing",
    "input": {"account_id": "acc-1"},
    "status": "done",
    "sources": [{"kind": "account_dossier", "label": "Société Générale", "as_of": "2026-09-10"}],
}


def _orchestrator_that_reads_then_hangs(*actions: dict):
    """Un orchestrateur qui a terminé des outils, puis ne rend jamais la main —
    exactement ce que le plafond du tour coupe."""

    async def _run(*_a, **kwargs):
        collected = kwargs.get("collected")
        assert collected is not None, "le routeur doit passer son accumulateur à l'orchestrateur"
        collected.extend(actions)
        await asyncio.sleep(30)
        raise AssertionError("le plafond n'a pas coupé")

    return _run


def _ceiling_after_preparation(monkeypatch: pytest.MonkeyPatch, margin_s: float = 0.5) -> None:
    """Le plafond coupe l'ORCHESTRATEUR, pas la préparation du tour : sur un
    runner chargé, la préparation seule a pris 0,4 s et mangeait un plafond fixe
    de 0,05 s — l'orchestrateur ne partait jamais, rien n'était lu (faux rouge CI).
    Le plafond rendu = temps déjà écoulé depuis la pose + `margin_s`."""
    started = time.monotonic()
    monkeypatch.setattr(chat_router, "_turn_ceiling_s", lambda: (time.monotonic() - started) + margin_s)


class TestRouterTimeout:
    def test_ce_qui_a_ete_lu_est_rendu_partiel_et_date(self, client: TestClient, monkeypatch) -> None:
        _ceiling_after_preparation(monkeypatch)
        with patch(
            "app.services.chat_orchestrator.run_chat_with_tools",
            new=_orchestrator_that_reads_then_hangs(_DOSSIER_READ),
        ):
            res = client.post("/chat/message", json={"message": "compare mes comptes", "user_id": "u1"})

        body = _terminal_event(res.text)
        assert body["success"] is False
        reply = body["data"]["reply"]
        # Le temps, ce qui n'a PAS eu lieu, puis ce qui a été récupéré.
        assert reply.startswith(chat_router._TIMEOUT_PARTIAL_REPLY)
        assert "Société Générale" in reply
        assert "10/09/2026" in reply, "chaque élément récupéré porte sa date"
        assert "aucun résultat" not in reply.lower()
        context = body["data"]["context"]
        assert context["partial"]["reason"] == "turn_timeout"
        assert context["partial"]["as_of"], "le partiel est daté"
        assert {"kind": "account_dossier", "label": "Société Générale", "as_of": "2026-09-10"} in context["sources"]

    def test_rien_de_lu_rend_la_phrase_du_temps_seule(self, client: TestClient, monkeypatch) -> None:
        _ceiling_after_preparation(monkeypatch)
        with patch(
            "app.services.chat_orchestrator.run_chat_with_tools",
            new=_orchestrator_that_reads_then_hangs(),
        ):
            res = client.post("/chat/message", json={"message": "enrichis ce contact", "user_id": "u1"})

        body = _terminal_event(res.text)
        assert body["data"] == {"reply": chat_router._TIMEOUT_REPLY}

    def test_une_proposition_ou_un_echec_ne_se_presentent_pas_comme_recuperes(
        self, client: TestClient, monkeypatch
    ) -> None:
        _ceiling_after_preparation(monkeypatch)
        prepared = {"tool": "enrich_contact", "input": {}, "status": "pending_confirmation", "proposal": {}}
        failed = {
            "tool": "get_account_briefing",
            "input": {},
            "status": "error",
            "sources": [{"kind": "account_dossier", "label": "Fantôme"}],
        }
        with patch(
            "app.services.chat_orchestrator.run_chat_with_tools",
            new=_orchestrator_that_reads_then_hangs(prepared, failed),
        ):
            res = client.post("/chat/message", json={"message": "enrichis ce contact", "user_id": "u1"})

        body = _terminal_event(res.text)
        assert body["data"] == {"reply": chat_router._TIMEOUT_REPLY}

    def test_une_source_sans_date_le_dit(self, client: TestClient, monkeypatch) -> None:
        _ceiling_after_preparation(monkeypatch)
        undated = {**_DOSSIER_READ, "sources": [{"kind": "account_dossier", "label": "Airbus"}]}
        with patch(
            "app.services.chat_orchestrator.run_chat_with_tools",
            new=_orchestrator_that_reads_then_hangs(undated),
        ):
            res = client.post("/chat/message", json={"message": "compare", "user_id": "u1"})

        reply = _terminal_event(res.text)["data"]["reply"]
        assert "Airbus (date inconnue)" in reply

    def test_la_phrase_suit_la_langue_de_linterface(self, client: TestClient, monkeypatch) -> None:
        _ceiling_after_preparation(monkeypatch)
        with patch(
            "app.services.chat_orchestrator.run_chat_with_tools",
            new=_orchestrator_that_reads_then_hangs(_DOSSIER_READ),
        ):
            res = client.post(
                "/chat/message",
                json={"message": "compare my accounts", "user_id": "u1", "interface_language": "en"},
            )

        reply = _terminal_event(res.text)["data"]["reply"]
        assert reply.startswith(chat_router._TIMEOUT_PARTIAL_REPLY_EN)
        assert "2026-09-10" in reply

    def test_la_phrase_du_temps_seule_suit_aussi_la_langue(self, client: TestClient, monkeypatch) -> None:
        _ceiling_after_preparation(monkeypatch)
        with patch(
            "app.services.chat_orchestrator.run_chat_with_tools",
            new=_orchestrator_that_reads_then_hangs(),
        ):
            res = client.post(
                "/chat/message",
                json={"message": "enrich this contact", "user_id": "u1", "interface_language": "en"},
            )

        assert _terminal_event(res.text)["data"] == {"reply": chat_router._TIMEOUT_REPLY_EN}


class _HangingStream:
    async def __aenter__(self):
        await asyncio.sleep(30)
        return self

    async def __aexit__(self, *_exc):
        return False


class _FakeMessages:
    """Un premier aller-retour qui demande un outil, puis un tour final qui ne
    répond jamais."""

    def __init__(self) -> None:
        self.calls = 0

    def stream(self, **_kwargs):
        self.calls += 1
        if self.calls == 1:
            response = SimpleNamespace(
                stop_reason="tool_use",
                content=[
                    SimpleNamespace(
                        type="tool_use", name="get_account_briefing", input={"account_id": "acc-1"}, id="toolu_1"
                    )
                ],
                usage=None,
            )

            class _Stream:
                async def __aenter__(self):
                    return self

                async def __aexit__(self, *_exc):
                    return False

                async def __aiter__(self):
                    if False:  # pragma: no cover — aucun texte à diffuser
                        yield None

                async def get_final_message(self):
                    return response

            return _Stream()
        return _HangingStream()


class _DummyThrottle:
    async def __aenter__(self):
        return self

    async def __aexit__(self, *_a):
        return False


@pytest.mark.asyncio
async def test_lorchestrateur_remplit_laccumulateur_de_lappelant_avant_lannulation(monkeypatch) -> None:
    """Le cœur du lot : ce qu'un round a lu est dans la liste de l'APPELANT dès
    que le round se termine — l'annulation de la coroutine ne l'emporte plus."""
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-test")
    fake = SimpleNamespace(messages=_FakeMessages())
    monkeypatch.setattr(chat_orchestrator.anthropic, "AsyncAnthropic", lambda **_kw: fake)
    monkeypatch.setattr(chat_orchestrator, "throttle", lambda _provider: _DummyThrottle())
    monkeypatch.setattr(
        chat_orchestrator,
        "execute_chat_tool",
        AsyncMock(return_value={"company_name": "Société Générale", "as_of": "2026-09-10"}),
    )

    collected: list[dict] = []
    with pytest.raises(TimeoutError):
        await asyncio.wait_for(
            chat_orchestrator.run_chat_with_tools("sys", "user", user_id="u1", profile_data=None, collected=collected),
            timeout=0.2,
        )

    assert [action["tool"] for action in collected] == ["get_account_briefing"]
    assert collected[0]["status"] == "done"
    assert collected[0]["sources"] == [{"kind": "account_dossier", "label": "Société Générale", "as_of": "2026-09-10"}]


@pytest.mark.asyncio
async def test_sans_accumulateur_le_contrat_ne_change_pas(monkeypatch) -> None:
    """Tous les appelants d'avant ce lot ne passent rien : `(reply, actions)`
    reste le contrat, au bit près."""
    monkeypatch.setenv("ANTHROPIC_API_KEY", "sk-test")

    class _OneShot:
        def stream(self, **_kwargs):
            response = SimpleNamespace(
                stop_reason="end_turn", content=[SimpleNamespace(type="text", text="ok")], usage=None
            )

            class _Stream:
                async def __aenter__(self):
                    return self

                async def __aexit__(self, *_exc):
                    return False

                async def __aiter__(self):
                    yield SimpleNamespace(type="text", text="ok")

                async def get_final_message(self):
                    return response

            return _Stream()

    monkeypatch.setattr(
        chat_orchestrator.anthropic, "AsyncAnthropic", lambda **_kw: SimpleNamespace(messages=_OneShot())
    )
    monkeypatch.setattr(chat_orchestrator, "throttle", lambda _provider: _DummyThrottle())

    reply, actions = await chat_orchestrator.run_chat_with_tools("sys", "user", user_id="u1", profile_data=None)

    assert (reply, actions) == ("ok", [])
