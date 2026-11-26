"""#3085.1 (18/10) — le seau de débit du copilote est PAR UTILISATEUR : deux membres du même espace ne s'attendent pas.

Avant : un seul seau ``claude_chat`` (4 créneaux) partagé par tous. Un utilisateur qui en tenait quatre faisait
attendre l'autre. Le plafond du fournisseur reste tenu par ``claude_chat_global``.
"""

from __future__ import annotations

import pytest

from app.services import chat_orchestrator, rate_limiter
from app.services.rate_limiter import RateLimitTimeout


@pytest.fixture(autouse=True)
def _fresh_buckets(monkeypatch):
    monkeypatch.delenv("REDIS_URL", raising=False)
    monkeypatch.setenv("CLAUDE_CHAT_CONCURRENCY", "1")
    monkeypatch.setenv("CLAUDE_CHAT_RPM", "600")
    rate_limiter._reset_cache_for_tests()
    yield
    rate_limiter._reset_cache_for_tests()


@pytest.mark.asyncio
async def test_deux_utilisateurs_ne_s_attendent_pas():
    async with chat_orchestrator._ChatTurnThrottle("alice"):
        # Alice tient son unique créneau ; Bob passe quand même, sans attendre.
        with rate_limiter.wait_deadline(rate_limiter.time.monotonic() + 0.5):
            async with chat_orchestrator._ChatTurnThrottle("bob"):
                pass


@pytest.mark.asyncio
async def test_sait_dire_non_le_meme_utilisateur_s_attend_lui_meme():
    async with chat_orchestrator._ChatTurnThrottle("alice"):
        with rate_limiter.wait_deadline(rate_limiter.time.monotonic() + 0.2):
            with pytest.raises(RateLimitTimeout):
                async with chat_orchestrator._ChatTurnThrottle("alice"):
                    pass
