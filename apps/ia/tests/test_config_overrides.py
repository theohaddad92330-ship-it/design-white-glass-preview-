"""config_overrides — override runtime persistant (rechargeable sans redeploy)."""

from __future__ import annotations

import asyncio
import threading
import time

import pytest

from app.config.knowledge_config import clear_overrides, get_config
from app.config.overrides_loader import aload_config_overrides, load_config_overrides


@pytest.fixture(autouse=True)
def _reset_overrides():
    clear_overrides()
    yield
    clear_overrides()


def test_loader_applies_a_fetched_patch():
    load_config_overrides(fetch=lambda: {"no_go": {"min_keyword_len": 2}})
    assert get_config().no_go.min_keyword_len == 2


def test_loader_is_a_noop_on_empty_or_failed_fetch():
    load_config_overrides(fetch=lambda: {})  # empty → defaults
    assert get_config().no_go.min_keyword_len == 3

    def _boom() -> dict:
        raise RuntimeError("db down")

    # A raising fetch must not propagate here — the loader passes {} on our behalf
    # only when fetch returns it; a raising fetch is the caller's concern, so we
    # wrap it to prove the real fetch degrades (see fetch_global_override_patch).
    with pytest.raises(RuntimeError):
        load_config_overrides(fetch=_boom)


# #2915.2 — démarrage retardé côté IA : `main.py` (startup) et
# `/config/reload` appelaient tous deux `load_config_overrides()` — synchrone,
# `.execute()` bloquant — DIRECTEMENT depuis un handler `async def`, sans
# `asyncio.to_thread`. L'IA tourne en un SEUL processus (apps/ia/railway.json
# n'a pas de `--workers`) : ce thread event-loop est aussi celui qui répond à
# /health, donc un fetch lent gèle tout le service pendant sa durée. C'est le
# SEUL endroit du dépôt qui appelle `.execute()` au lieu de la variante
# `TableQuery.aexecute()` déjà prévue pour ça (`supabase_client.py`).
async def test_async_loader_offloads_the_fetch_so_it_never_blocks_the_event_loop():
    seen_threads: list[threading.Thread] = []
    other_task_progressed = False

    def slow_fetch() -> dict:
        seen_threads.append(threading.current_thread())
        time.sleep(0.2)
        return {}

    async def concurrent_probe() -> None:
        nonlocal other_task_progressed
        await asyncio.sleep(0.05)
        other_task_progressed = True

    probe = asyncio.create_task(concurrent_probe())
    await aload_config_overrides(fetch=slow_fetch)
    await probe

    assert other_task_progressed, (
        "le fetch a gelé la boucle asyncio : aucune autre tâche n'a pu avancer pendant son exécution"
    )
    assert seen_threads and seen_threads[0] is not threading.main_thread()


def test_real_fetch_degrades_without_db():
    # fetch_global_override_patch swallows any error (no creds in tests) → {}.
    from app.config.overrides_loader import fetch_global_override_patch

    assert fetch_global_override_patch() == {}


def test_reload_endpoint(client):
    res = client.post("/config/reload")
    assert res.status_code == 200
    body = res.json()
    assert body["version"] == "v1"
    assert "applied" in body


def test_current_config_endpoint(client):
    res = client.get("/config/current")
    assert res.status_code == 200
    assert res.json()["version"] == "v1"


def test_agents_endpoint(client):
    res = client.get("/config/agents")
    assert res.status_code == 200
    agents = res.json()["agents"]
    assert len(agents) == 12
    assert agents["AccountVocabularyBuilder"]["kind"] == "prompt"


# #2009.11 — la version STABLE d'un prompt (hash de template), lue par l'API
# AVANT l'appel générateur pour entrer dans la clé d'idempotence
# (`generationKey`, apps/api/.../profile-context.service.ts) sans dupliquer la
# source de vérité (GA-26 : le registre de prompts vit ici, côté IA).
def test_prompt_version_endpoint_matches_the_registry(client):
    from app.prompts.registry import prompt_version_for

    res = client.get("/config/prompt-version/profiler")
    assert res.status_code == 200
    assert res.json()["version"] == prompt_version_for("profiler")


def test_prompt_version_endpoint_renders_null_for_an_unregistered_name(client):
    # Jamais une valeur inventée pour un nom non enregistré — `null`, comme
    # `prompt_version_for` lui-même (voir test_prompt_fingerprint.py).
    res = client.get("/config/prompt-version/does-not-exist")
    assert res.status_code == 200
    assert res.json()["version"] is None


def test_prompts_endpoint(client):
    res = client.get("/config/prompts")
    assert res.status_code == 200
    prompts = res.json()["prompts"]
    assert len(prompts) == 12
    # A prompt-agent exposes its template source; the algo agents expose their fn.
    assert "def build_system_prompt" in prompts["AccountVocabularyBuilder"]["source"]
    assert prompts["AccountScorer"]["kind"] == "algo"
