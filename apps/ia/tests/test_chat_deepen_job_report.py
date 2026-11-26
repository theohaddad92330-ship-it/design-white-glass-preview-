"""#3236.2 (b, tranche) — signaler côté API qu'un approfondissement est coupé.

Même garde que `thread.note_unfinished_work` (#3236.2a) et
`chat_resume_checkpoint.save` (#3236.2b, lectures) : appelé au MÊME point de
sortie (budget épuisé, mode Approfondi), best-effort — un échec de ce rapport
ne doit JAMAIS faire tomber la réponse déjà prête à partir. Sans
`API_INTERNAL_URL`/`INTERNAL_API_SECRET`, ou sans `conversation_id` : aucun
appel réseau, chemin identique à avant.
"""

from __future__ import annotations

from typing import Any

import pytest

from app.services import chat_deepen_job_report as report


@pytest.fixture(autouse=True)
def _configured(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("API_INTERNAL_URL", "http://api.internal")
    monkeypatch.setenv("INTERNAL_API_SECRET", "s3cret")


async def test_poste_la_charge_attendue(monkeypatch: pytest.MonkeyPatch) -> None:
    captured: dict[str, Any] = {}

    async def fake_post(path: str, payload: dict[str, Any], **_kwargs: object):
        captured["path"] = path
        captured["payload"] = payload
        return {"id": "job-1"}

    monkeypatch.setattr(report, "_post", fake_post)

    ok = await report.report_interrupted(
        user_id="user-1",
        conversation_id="conv-1",
        label="Étude du groupe Thales",
        completed_steps=4,
        current_step="Lecture des filiales",
    )

    assert ok is True
    assert captured["path"] == "/internal/chat/deepen-jobs"
    assert captured["payload"] == {
        "userId": "user-1",
        "conversationId": "conv-1",
        "label": "Étude du groupe Thales",
        "completedSteps": 4,
        "currentStep": "Lecture des filiales",
    }


async def test_rend_false_sans_conversation_id_et_naccede_jamais_au_reseau(monkeypatch: pytest.MonkeyPatch) -> None:
    called = False

    async def fake_post(*_args: object, **_kwargs: object):
        nonlocal called
        called = True
        return None

    monkeypatch.setattr(report, "_post", fake_post)

    ok = await report.report_interrupted(
        user_id="user-1", conversation_id=None, label="Étude", completed_steps=1, current_step=None
    )

    assert ok is False
    assert called is False


async def test_rend_false_sans_configuration_et_naccede_jamais_au_reseau(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("API_INTERNAL_URL", raising=False)

    class _NoNetworkClient:
        def __init__(self, *_args: object, **_kwargs: object) -> None:
            raise AssertionError('aucun appel réseau attendu sans "API_INTERNAL_URL"')

    monkeypatch.setattr(report.httpx, "AsyncClient", _NoNetworkClient)

    ok = await report.report_interrupted(
        user_id="user-1", conversation_id="conv-1", label="Étude", completed_steps=1, current_step=None
    )

    assert ok is False


async def test_rend_false_sur_echec_reseau_jamais_une_exception(monkeypatch: pytest.MonkeyPatch) -> None:
    async def fake_post(*_args: object, **_kwargs: object):
        return None

    monkeypatch.setattr(report, "_post", fake_post)

    ok = await report.report_interrupted(
        user_id="user-1", conversation_id="conv-1", label="Étude", completed_steps=1, current_step=None
    )

    assert ok is False


async def test_3862_report_resolved_poste_la_resolution(monkeypatch: pytest.MonkeyPatch) -> None:
    # #3862.1 — la réponse COMPLÈTE d'un tour Approfondi referme la ligne.
    captured: dict[str, Any] = {}

    async def fake_post(path: str, payload: dict[str, Any], **_kwargs: object):
        captured["path"] = path
        captured["payload"] = payload
        return {"resolved": 1}

    monkeypatch.setattr(report, "_post", fake_post)

    assert await report.report_resolved(user_id="user-1", conversation_id="conv-1") is True
    assert captured == {
        "path": "/internal/chat/deepen-jobs/resolve",
        "payload": {"userId": "user-1", "conversationId": "conv-1"},
    }


async def test_3862_report_resolved_sans_conversation_ne_touche_pas_le_reseau(monkeypatch: pytest.MonkeyPatch) -> None:
    async def fake_post(*_args: object, **_kwargs: object):
        raise AssertionError("aucun appel réseau sans conversation_id")

    monkeypatch.setattr(report, "_post", fake_post)
    assert await report.report_resolved(user_id="user-1", conversation_id=None) is False


async def test_3862_report_resolved_rend_false_si_lapi_ne_repond_pas(monkeypatch: pytest.MonkeyPatch) -> None:
    async def fake_post(*_args: object, **_kwargs: object):
        return None

    monkeypatch.setattr(report, "_post", fake_post)
    assert await report.report_resolved(user_id="user-1", conversation_id="conv-1") is False
