"""L'issue d'un tour de copilote — la métadonnée « outcome vérifié » et
l'alerte « no-outcome ».

Deux des cinq alertes exigées par `LANGFUSE_OBSERVABILITY_REQUIREMENTS.md:30`
n'existaient nulle part : l'hallucination et le **no-outcome**. Le second est la
traduction opérationnelle d'une résolution que le dépôt tient déjà dans ses
types — « une sortie de modèle ne prouve jamais un outcome » — mais que rien ne
SURVEILLAIT.

Ce que ces tests défendent :

* un tour qui a fait AGIR un outil est un tour qui a produit quelque chose ;
* un tour qui a seulement répondu est ``answered`` — le mot dit qu'un texte est
  revenu, jamais qu'il était juste ;
* un tour qui ne rend NI action NI texte est un défaut : l'utilisateur n'a rien
  reçu, et quelqu'un doit être prévenu ;
* l'alerte ne dépend d'AUCUNE clé Langfuse : elle part même quand
  l'observabilité est éteinte.
"""

from __future__ import annotations

import asyncio
import logging

import pytest

from app.services import chat_orchestrator
from app.services import langfuse_client as lf


@pytest.fixture(autouse=True)
def _clean_state(monkeypatch):
    for var in ("LANGFUSE_PUBLIC_KEY", "LANGFUSE_SECRET_KEY", "LANGFUSE_CAPTURE_CONTENT", "LANGFUSE_DISABLED"):
        monkeypatch.delenv(var, raising=False)
    lf._reset_for_tests()
    yield
    lf._reset_for_tests()


def _enable(monkeypatch):
    monkeypatch.setenv("LANGFUSE_PUBLIC_KEY", "pk-lf-test")
    monkeypatch.setenv("LANGFUSE_SECRET_KEY", "sk-lf-test")


def _run(monkeypatch, reply: str, actions: list[dict]):
    """Fait tourner le tour en court-circuitant la boucle réelle."""

    async def fake(*_args, **_kwargs):
        # Une génération, pour que la trace paresseuse soit réellement émise.
        lf.record_generation(name="bellum_chat", model="m", input_tokens=1, output_tokens=1)
        return reply, actions

    monkeypatch.setattr(chat_orchestrator, "_run_chat_with_tools", fake)
    return asyncio.run(
        chat_orchestrator.run_chat_with_tools("sys", "user", user_id="u1", profile_data=None)
    )


def _trace_bodies() -> list[dict]:
    return [e["body"] for e in lf._pending_events() if e["type"] == "trace-create"]


# ── la classification ─────────────────────────────────────────────────────────


def test_un_outil_execute_vaut_une_action():
    assert chat_orchestrator.turn_outcome("", [{"tool": "t", "status": "done"}]) == "acted"


def test_une_proposition_a_valider_est_une_issue():
    # L'outil d'écriture n'a rien écrit : il a PRÉPARÉ, et l'utilisateur a une
    # décision à prendre. C'est un résultat, pas un vide.
    assert chat_orchestrator.turn_outcome("", [{"tool": "t", "status": "pending_confirmation"}]) == "acted"


def test_un_outil_en_echec_ne_prouve_rien():
    # Il a été appelé, il n'a rien produit. Le compter comme une action ferait
    # disparaître exactement les tours qu'on veut voir.
    assert chat_orchestrator.turn_outcome("", [{"tool": "t", "status": "failed"}]) == "no_outcome"
    assert chat_orchestrator.turn_outcome("", [{"tool": "t", "status": "error"}]) == "no_outcome"


def test_un_texte_seul_est_une_reponse_pas_une_preuve():
    assert chat_orchestrator.turn_outcome("voici ce que je vois", []) == "answered"


def test_un_texte_vide_n_est_pas_une_reponse():
    assert chat_orchestrator.turn_outcome("   \n ", []) == "no_outcome"


# ── la trace porte l'issue ────────────────────────────────────────────────────


def test_la_trace_du_tour_porte_son_issue(monkeypatch):
    _enable(monkeypatch)
    _run(monkeypatch, "réponse", [{"tool": "t", "status": "done"}])

    traces = _trace_bodies()
    assert traces, "la trace du tour doit être émise"
    assert traces[-1]["metadata"]["outcome"] == "acted"


def test_un_tour_qui_leve_est_marque_failed(monkeypatch):
    _enable(monkeypatch)

    async def boom(*_args, **_kwargs):
        lf.record_generation(name="bellum_chat", model="m", input_tokens=1, output_tokens=1)
        raise RuntimeError("le tour a dépassé son budget")

    monkeypatch.setattr(chat_orchestrator, "_run_chat_with_tools", boom)
    with pytest.raises(RuntimeError):
        asyncio.run(chat_orchestrator.run_chat_with_tools("sys", "u", user_id="u1", profile_data=None))

    assert _trace_bodies()[-1]["metadata"]["outcome"] == "failed"


# ── l'alerte ──────────────────────────────────────────────────────────────────


def test_un_tour_sans_issue_ALERTE(monkeypatch, caplog):
    _enable(monkeypatch)
    with caplog.at_level(logging.ERROR, logger=chat_orchestrator.__name__):
        _run(monkeypatch, "", [])

    errors = [record for record in caplog.records if record.levelno >= logging.ERROR]
    assert errors, "un tour sans issue doit partir en ERROR — c'est le chemin Sentry"
    assert "SANS ISSUE" in errors[0].getMessage()
    assert _trace_bodies()[-1]["metadata"]["outcome"] == "no_outcome"


def test_l_alerte_part_MEME_sans_observabilite(monkeypatch, caplog):
    # Sans clés Langfuse, rien n'est tracé — mais l'alerte doit partir quand
    # même : elle ne dépend pas d'un fournisseur tiers.
    with caplog.at_level(logging.ERROR, logger=chat_orchestrator.__name__):
        _run(monkeypatch, "", [])

    assert lf._pending_events() == []
    assert any("SANS ISSUE" in record.getMessage() for record in caplog.records)


def test_un_tour_normal_n_alerte_pas(monkeypatch, caplog):
    _enable(monkeypatch)
    with caplog.at_level(logging.ERROR, logger=chat_orchestrator.__name__):
        _run(monkeypatch, "voilà", [])

    assert [record for record in caplog.records if record.levelno >= logging.ERROR] == []
