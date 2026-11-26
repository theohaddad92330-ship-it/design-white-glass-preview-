"""#2442.3 / #2442.4 / #2442.11 / #2442.12 — la trace d'UN tour de Laura.

Ce que ces tests tiennent :

* une trace par tour porte un RÉCAPITULATIF (outils, latences, jetons, coût,
  étapes, erreurs, statut final) — lisible sans relire chaque span ;
* le récapitulatif ne porte QUE des métadonnées : jamais le corps du message,
  jamais un identifiant brut de personne ou d'espace, jamais un secret ;
* « coût inconnu » ne se lit jamais « 0 » ;
* sans clés Langfuse : no-op strict, rien ne s'enfile ;
* un ``bind_trace`` imbriqué du même nom REJOINT la trace du tour au lieu d'en
  ouvrir une seconde (la route lie la trace, l'orchestrateur la retrouve).
"""

from __future__ import annotations

import asyncio
import json

import pytest

from app.services import langfuse_client as lf
from app.services import turn_trace


@pytest.fixture(autouse=True)
def _clean_state(monkeypatch):
    for var in (
        "LANGFUSE_PUBLIC_KEY",
        "LANGFUSE_SECRET_KEY",
        "LANGFUSE_HOST",
        "LANGFUSE_CAPTURE_CONTENT",
        "LANGFUSE_DISABLED",
    ):
        monkeypatch.delenv(var, raising=False)
    lf._reset_for_tests()
    yield
    lf._reset_for_tests()


def _enable(monkeypatch):
    monkeypatch.setenv("LANGFUSE_PUBLIC_KEY", "pk-lf-test")
    monkeypatch.setenv("LANGFUSE_SECRET_KEY", "sk-lf-test")


def _bodies(event_type: str) -> list[dict]:
    return [e["body"] for e in lf._pending_events() if e["type"] == event_type]


def _last_trace() -> dict:
    traces = _bodies("trace-create")
    assert traces, "aucune trace émise"
    return traces[-1]


def _run_turn(*, fail_tool: bool = False, cost: float | None = 0.01) -> None:
    with lf.bind_trace("chat_turn", user_id="u-pseudo", session_id="cid-1", summarize=True):
        lf.note_turn_event("step")
        with lf.span("retrieval"):
            pass
        lf.record_generation(
            name="bellum_chat",
            model="claude-x",
            input_tokens=100,
            output_tokens=20,
            cache_read_tokens=5,
            cost_usd=cost,
            duration_s=0.2,
        )
        lf.note_turn_event("delta")
        with lf.span("tool:search_contacts"):
            pass
        if fail_tool:
            with pytest.raises(RuntimeError), lf.span("tool:read_mail"):
                raise RuntimeError("boom sk-ant-api03-SECRETSECRETSECRET")
        lf.record_generation(
            name="bellum_chat", model="claude-x", input_tokens=50, output_tokens=10, cost_usd=0.02, duration_s=0.1
        )
        lf.note_turn_status("ok")


# ── no-op strict ──────────────────────────────────────────────────────────────


def test_sans_cles_le_tour_n_enfile_rien(monkeypatch):
    def _boom(*_a, **_kw):  # pragma: no cover
        raise AssertionError("aucun POST sans clés")

    monkeypatch.setattr(lf, "_post_batch", _boom)
    _run_turn()
    assert lf._pending_events() == []


# ── récapitulatif ─────────────────────────────────────────────────────────────


def test_le_tour_porte_son_recapitulatif(monkeypatch):
    _enable(monkeypatch)
    _run_turn(fail_tool=True)
    summary = _last_trace()["metadata"]["turn"]
    assert summary["tokens"] == {"input": 150, "output": 30, "cacheRead": 5}
    assert summary["costUsd"] == pytest.approx(0.03)
    assert summary["costComplete"] is True
    assert summary["models"] == ["claude-x"]
    assert summary["generations"] == 2
    assert [t["name"] for t in summary["tools"]] == ["search_contacts", "read_mail"]
    assert [t["status"] for t in summary["tools"]] == ["ok", "error"]
    assert all(isinstance(t["ms"], int) for t in summary["tools"])
    assert summary["errors"] == ["RuntimeError"]
    assert "retrieval" in summary["stageMs"]
    assert isinstance(summary["totalMs"], int)
    assert isinstance(summary["firstStatusMs"], int)
    assert isinstance(summary["firstTokenMs"], int)
    assert summary["finalStatus"] == "ok"
    # UNE trace : le récapitulatif est un upsert du même id, jamais une seconde.
    assert len({t["id"] for t in _bodies("trace-create")}) == 1


def test_le_recapitulatif_porte_le_cout_des_outils_non_llm(monkeypatch):
    """#2442.12 (épopée #2879) — le coût Brave/Apollo/Firecrawl… appelé pendant
    le tour, transporté tel quel depuis `run_metrics`/`provider_pricing` vers le
    récapitulatif — cette fonction n'invente aucun prix, elle ne fait que
    poser ce qu'on lui donne. Un fournisseur non tarifé (0 $, comme un free
    tier) reste visible : « gratuit » n'est pas « absent »."""
    _enable(monkeypatch)
    with lf.bind_trace("chat_turn", session_id="cid-cost", summarize=True):
        lf.note_turn_provider_costs(
            {
                "brave": {"calls": 2, "cost_usd": 0.01},
                "bodacc": {"calls": 3, "cost_usd": 0.0},
                "jamais_appele": {"calls": 0, "cost_usd": 0.0},
            }
        )
        lf.note_turn_status("ok")
    summary = _last_trace()["metadata"]["turn"]
    assert summary["providerCosts"] == {
        "brave": {"calls": 2, "cost_usd": 0.01},
        "bodacc": {"calls": 3, "cost_usd": 0.0},
    }


def test_note_turn_provider_costs_hors_tour_ne_leve_pas():
    """Hors tour (pas de `bind_trace` ouvert) : no-op silencieux, jamais une
    exception — la même garantie que le reste de `note_turn_*`."""
    lf.note_turn_provider_costs({"brave": {"calls": 1, "cost_usd": 0.005}})


def test_un_cout_inconnu_ne_se_lit_jamais_zero(monkeypatch):
    _enable(monkeypatch)
    _run_turn(cost=None)
    summary = _last_trace()["metadata"]["turn"]
    assert "costUsd" not in summary
    assert summary["costComplete"] is False


def test_un_tour_sans_premier_jeton_ne_porte_pas_de_zero(monkeypatch):
    _enable(monkeypatch)
    with lf.bind_trace("chat_turn", session_id="cid-2", summarize=True):
        pass
    summary = _last_trace()["metadata"]["turn"]
    # Rien reçu : l'absence reste une absence (GA-18), jamais « 0 ms ».
    assert "firstTokenMs" not in summary
    assert "firstStatusMs" not in summary
    assert "costUsd" not in summary
    assert "providerCosts" not in summary
    assert summary["tools"] == []


def test_une_trace_sans_recapitulatif_reste_inchangee(monkeypatch):
    _enable(monkeypatch)
    with lf.bind_trace("analysis_run", session_id="cid-3"), lf.span("phase_1"):
        pass
    assert all("turn" not in (t.get("metadata") or {}) for t in _bodies("trace-create"))


def test_un_bind_imbrique_du_meme_nom_rejoint_la_trace(monkeypatch):
    _enable(monkeypatch)
    with (
        lf.bind_trace("chat_turn", user_id="u-pseudo", session_id="cid-4", summarize=True),
        lf.bind_trace("chat_turn", user_id="raw-user-uuid", session_id="cid-4", metadata={"prompt_version": "v9"}),
        lf.span("tool:x"),
    ):
        pass
    traces = _bodies("trace-create")
    assert len({t["id"] for t in traces}) == 1
    final = traces[-1]
    assert final["userId"] == "u-pseudo"
    assert final["metadata"]["prompt_version"] == "v9"
    assert [t["name"] for t in final["metadata"]["turn"]["tools"]] == ["x"]


def test_le_recapitulatif_traverse_une_tache_enfant(monkeypatch):
    _enable(monkeypatch)

    async def _tool():
        with lf.span("tool:parallel"):
            await asyncio.sleep(0)

    async def _turn():
        with lf.bind_trace("chat_turn", session_id="cid-5", summarize=True):
            await asyncio.gather(asyncio.create_task(_tool()))

    asyncio.run(_turn())
    assert [t["name"] for t in _last_trace()["metadata"]["turn"]["tools"]] == ["parallel"]


# ── identité : pseudonymes, jamais de brut ────────────────────────────────────


def test_pseudonyme_stable_et_distinct_par_nature():
    a = turn_trace.pseudonymize("user", "9d359267-f7ee-430f-a614-2044a2e77ab5")
    assert a == turn_trace.pseudonymize("user", "9d359267-f7ee-430f-a614-2044a2e77ab5")
    assert a != turn_trace.pseudonymize("workspace", "9d359267-f7ee-430f-a614-2044a2e77ab5")
    assert "9d359267" not in a
    assert turn_trace.pseudonymize("user", "") is None


def test_aucune_donnee_personnelle_ni_corps_ni_secret_dans_la_trace(monkeypatch):
    _enable(monkeypatch)
    user_id = "9d359267-f7ee-430f-a614-2044a2e77ab5"
    workspace_id = "11111111-2222-3333-4444-555555555555"
    message = "Écris à jean.dupont@acme.fr au +33 6 12 34 56 78 : le budget est de 42 k€"
    identity = turn_trace.turn_identity(
        user_id=user_id,
        workspace_id=workspace_id,
        conversation_id="conv-1",
        account_id="acc-1",
        message=message,
        history=[{"role": "user", "content": "ancien message confidentiel"}],
        document_ids=["doc-1", "doc-2"],
        pinned_facts=["fait épinglé confidentiel"],
        crm_connected=True,
        interface_language="fr",
    )
    with lf.bind_trace(
        "chat_turn", user_id=identity.user, session_id="cid-6", metadata=identity.metadata, summarize=True
    ):
        with pytest.raises(ValueError), lf.span("tool:send"):
            raise ValueError(message)
        lf.note_turn_status("failed")

    dumped = json.dumps(lf._pending_events(), ensure_ascii=False)
    for forbidden in (user_id, workspace_id, "jean.dupont@acme.fr", "12 34 56 78", "42 k€", "confidentiel", message):
        assert forbidden not in dumped, forbidden
    final = _last_trace()
    assert final["userId"] == identity.user
    meta = final["metadata"]
    # Liste FERMÉE : un attribut neuf doit passer par `turn_identity`.
    assert set(meta) <= {
        "environment",
        "release",
        "workspace",
        "conversationId",
        "accountInScope",
        "historyTurns",
        "attachedDocuments",
        "pinnedFacts",
        "crmConnected",
        "interfaceLanguage",
        "messageChars",
        "messageId",
        "turn",
        "prompt_version",
        "outcome",
    }
    assert meta["messageChars"] == len(message)
    assert meta["historyTurns"] == 1
    assert meta["turn"]["errors"] == ["ValueError"]
    assert meta["turn"]["finalStatus"] == "failed"


# ── la route : un vrai tour, de bout en bout ──────────────────────────────────


def test_la_route_du_chat_trace_le_tour_de_bout_en_bout(client, monkeypatch):
    """#2442.4 — la ROUTE lie la trace (identité, récupération, persistance,
    premier jeton, statut final) et l'orchestrateur la REJOINT. Le trace_id est
    celui de la convention commune : le correlation-id posé par l'API."""
    from unittest.mock import AsyncMock, patch

    _enable(monkeypatch)
    monkeypatch.setattr(lf, "_post_batch", lambda _b: True)
    user_id = "9d359267-f7ee-430f-a614-2044a2e77ab5"
    workspace_id = "11111111-2222-3333-4444-555555555555"
    message = "Relance jean.dupont@acme.fr sur le budget confidentiel"

    from app.services import run_metrics

    async def _fake_orchestrator(*_a, emit=None, **_kw):
        with lf.bind_trace("chat_turn", user_id=user_id, session_id="ignored"):
            with lf.span("tool:search_contacts"):
                pass
            # #2442.12 (épopée #2879) — simule ce qu'un outil qui parle à un
            # fournisseur externe fait déjà via `rate_limiter.throttle()`,
            # sous le MÊME correlation-id que la trace (posé par le header
            # `x-correlation-id` de la requête, plus bas).
            run_metrics.record_call("0123456789abcdef0123456789abcdef", "brave", duration_ms=120, ok=True)
            await emit({"type": "delta", "text": "Bon"})
        return "Bonjour !", []

    with (
        patch("app.services.chat_orchestrator.run_chat_with_tools", new=_fake_orchestrator),
        patch("app.services.conversation_service.save_turn", new_callable=AsyncMock),
        patch("app.services.conversation_service.load_recent_history", new_callable=AsyncMock, return_value=[]),
    ):
        res = client.post(
            "/chat/message",
            json={"message": message, "user_id": user_id, "workspace_id": workspace_id, "conversation_id": "conv-42"},
            headers={
                "x-correlation-id": "0123456789abcdef0123456789abcdef",
                "x-bellum-turn": "id=c0ffee00-0000-4000-8000-000000002442;auth=7;quota=12;context=340;evil=5",
            },
        )
    assert res.status_code == 200

    traces = [t for t in _bodies("trace-create") if t["name"] == "chat_turn"]
    assert len({t["id"] for t in traces}) == 1
    final = traces[-1]
    assert final["id"] == "0123456789abcdef0123456789abcdef"
    assert final["userId"] == turn_trace.pseudonymize("user", user_id)
    meta = final["metadata"]
    assert meta["workspace"] == turn_trace.pseudonymize("workspace", workspace_id)
    assert meta["conversationId"] == "conv-42"
    # #2442.3 — ce que SEULE l'API sait : l'id du message et ses étapes.
    assert meta["messageId"] == "c0ffee00-0000-4000-8000-000000002442"
    turn = meta["turn"]
    assert turn["finalStatus"] == "ok"
    assert isinstance(turn["firstTokenMs"], int)
    assert {"retrieval", "memory", "persistence"} <= set(turn["stageMs"])
    # #2442.4 (épopée #2879) — le span « auth » manquant : tout ce qui
    # s'exécute entre la réception de la requête et l'entrée dans le
    # contrôleur (routage + guards Nest), posé par l'API comme les deux autres.
    assert turn["stageMs"]["api.auth"] == 7
    assert turn["stageMs"]["api.quota"] == 12
    assert turn["stageMs"]["api.context"] == 340
    assert "api.evil" not in turn["stageMs"]
    assert [t["name"] for t in turn["tools"]] == ["search_contacts"]
    # #2442.12 (épopée #2879) — le coût Brave de CE tour, tarifé par le même
    # registre que le pipeline d'analyse (`provider_pricing`), jamais recalculé
    # ici : $0.005/appel (défaut) × 1 appel.
    assert turn["providerCosts"] == {"brave": {"calls": 1, "cost_usd": 0.005}}
    run_metrics.clear_metrics("0123456789abcdef0123456789abcdef")
    # #2441.4 — le verdict SLO du tour, calculé sur les VRAIES étapes API
    # posées par cette requête (12 ms + 340 ms = 352 ms, sous le seuil de 500).
    assert turn["slo"]["ack"] == {"ms": 352, "sloMs": 500, "breached": False}
    assert turn["slo"]["firstStatus"]["breached"] is False
    dumped = json.dumps(lf._pending_events(), ensure_ascii=False)
    for forbidden in (user_id, workspace_id, "jean.dupont@acme.fr", "confidentiel"):
        assert forbidden not in dumped, forbidden


# ── l'en-tête du tour posé par l'API ──────────────────────────────────────────


def test_l_entete_du_tour_se_lit_en_liste_fermee():
    parsed = turn_trace.parse_turn_header("id=c0ffee00-0000-4000-8000-000000002442;auth=7;quota=12;context=340")
    assert parsed.message_id == "c0ffee00-0000-4000-8000-000000002442"
    assert parsed.stages_ms == {"auth": 7, "quota": 12, "context": 340}


@pytest.mark.parametrize(
    "raw",
    [
        None,
        "",
        "id=jean.dupont@acme.fr;quota=-3;context=abc",
        "id=c0ffee00;evil=5;quota=99999999999",
        "n'importe quoi",
    ],
)
def test_un_entete_malforme_ne_pose_rien(raw):
    parsed = turn_trace.parse_turn_header(raw)
    assert parsed.message_id is None
    assert parsed.stages_ms == {}
