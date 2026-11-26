"""`CallMetadata.throttle_provider` — un appel interactif choisit sa file (#2521, suite).

Tout appel Claude passait par le seau `claude` (12 concurrents, 50 rpm),
PARTAGÉ avec les analyses de fond (phase 4, plusieurs dizaines de secondes par
lot). Découvrir appelle le modèle pour l'angle commercial DANS le même tour
HTTP qu'un commercial attend à l'écran (`/discover/registry`) — une analyse en
cours pouvait donc lui faire manger sa part du budget de temps AVANT même
d'être appelée (voir `test_discover_registry_model_share.py`).

`claude_chat` existe déjà (16/08/2026, `rate_limiter.py`) pour exactement ce
problème côté copilote : un seau séparé ne change RIEN au plafond réel du
compte Anthropic, il empêche seulement le travail de fond de manger la file de
l'interactif. `CallMetadata.throttle_provider` étend ce même seau à Découvrir,
sans nouveau paramètre de plomberie ni changement de modèle ni de coût — le
défaut (`"claude"`) reste byte-identique pour tout appelant existant.
"""

from __future__ import annotations

import asyncio
import time
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.services import rate_limiter
from app.services.claude_service import CallMetadata, call_claude


def _dict_client() -> MagicMock:
    envelope = MagicMock()
    envelope.data = {"ok": True}
    completion = MagicMock()
    completion.usage.input_tokens = 10
    completion.usage.output_tokens = 5
    client = MagicMock()
    client.messages.create_with_completion = AsyncMock(return_value=(envelope, completion))
    return client


@pytest.fixture(autouse=True)
def _fresh_throttles():
    rate_limiter._reset_cache_for_tests()
    yield
    rate_limiter._reset_cache_for_tests()


@pytest.mark.asyncio
async def test_default_metadata_still_uses_the_claude_bucket() -> None:
    """Garde-fou de non-régression : sans `throttle_provider` explicite, rien
    ne change pour les appelants existants (analyse, RAG, prompts…)."""
    seen: list[str] = []
    real_throttle = rate_limiter.throttle

    def _spy(provider: str):
        seen.append(provider)
        return real_throttle(provider)

    client = _dict_client()
    with patch("app.services.claude_service.instructor.from_anthropic", return_value=client):
        with patch("app.services.claude_service.throttle", _spy):
            with patch.dict("os.environ", {"ANTHROPIC_API_KEY": "sk-test"}):
                await call_claude("sys", "usr", response_model=dict, prompt_name="t")

    assert seen == ["claude"]


@pytest.mark.asyncio
async def test_explicit_throttle_provider_routes_to_its_own_bucket() -> None:
    seen: list[str] = []
    real_throttle = rate_limiter.throttle

    def _spy(provider: str):
        seen.append(provider)
        return real_throttle(provider)

    client = _dict_client()
    meta = CallMetadata(prompt_name="bellum_discover", throttle_provider="claude_chat")
    with patch("app.services.claude_service.instructor.from_anthropic", return_value=client):
        with patch("app.services.claude_service.throttle", _spy):
            with patch.dict("os.environ", {"ANTHROPIC_API_KEY": "sk-test"}):
                await call_claude("sys", "usr", response_model=dict, metadata=meta)

    assert seen == ["claude_chat"]


@pytest.mark.asyncio
async def test_a_busy_analysis_bucket_does_not_delay_an_interactive_call(monkeypatch) -> None:
    """Le point produit : une analyse en cours (seau `claude` occupé) ne
    retarde plus un appel interactif qui passe par `claude_chat`."""
    monkeypatch.setenv("CLAUDE_CONCURRENCY", "1")
    monkeypatch.setenv("CLAUDE_CHAT_CONCURRENCY", "1")
    rate_limiter._reset_cache_for_tests()

    # flaky mesuré le 18/09/2026 — un seuil d'horloge murale absolu
    # (`elapsed < 0.15`) dépendait de la vitesse du runner : mesuré à 0.153s
    # sous charge partagée, 2 % au-dessus du seuil. Remplacé par l'ORDRE réel
    # de complétion, déterministe quelle que soit la machine : l'appel
    # interactif (travail négligeable, seau `claude_chat` séparé) doit
    # terminer AVANT le holder, qui lui dort réellement 0.3s sur le seau
    # `claude`. C'est l'ordonnancement qu'on veut prouver, pas un chrono.
    order: list[str] = []

    async def _hold_the_analysis_bucket() -> None:
        async with rate_limiter.throttle("claude"):
            await asyncio.sleep(0.3)
        order.append("analysis")

    holder = asyncio.create_task(_hold_the_analysis_bucket())
    await asyncio.sleep(0.02)  # laisser le holder prendre le jeton

    client = _dict_client()
    meta = CallMetadata(prompt_name="bellum_discover", throttle_provider="claude_chat")
    with patch("app.services.claude_service.instructor.from_anthropic", return_value=client):
        with patch.dict("os.environ", {"ANTHROPIC_API_KEY": "sk-test"}):
            await call_claude("sys", "usr", response_model=dict, metadata=meta)
    order.append("interactive")

    await holder
    assert order == ["interactive", "analysis"], (
        f"ordre observé {order} — l'appel interactif a attendu derrière l'analyse en cours"
    )


@pytest.mark.asyncio
async def test_witness_default_metadata_still_waits_behind_a_busy_analysis(monkeypatch) -> None:
    """Témoin : SANS `throttle_provider`, l'appel attend bien derrière
    l'analyse — c'est précisément ce que #2521 (suite) corrige pour Découvrir,
    pas un changement de comportement du seau `claude` lui-même."""
    monkeypatch.setenv("CLAUDE_CONCURRENCY", "1")
    rate_limiter._reset_cache_for_tests()

    async def _hold_the_analysis_bucket() -> None:
        async with rate_limiter.throttle("claude"):
            await asyncio.sleep(0.3)

    holder = asyncio.create_task(_hold_the_analysis_bucket())
    await asyncio.sleep(0.02)

    client = _dict_client()
    with patch("app.services.claude_service.instructor.from_anthropic", return_value=client):
        with patch.dict("os.environ", {"ANTHROPIC_API_KEY": "sk-test"}):
            started = time.monotonic()
            await call_claude("sys", "usr", response_model=dict, prompt_name="t")
            elapsed = time.monotonic() - started

    await holder
    assert elapsed > 0.2, f"{elapsed:.3f}s — le témoin doit attendre derrière l'analyse (seau partagé)"
