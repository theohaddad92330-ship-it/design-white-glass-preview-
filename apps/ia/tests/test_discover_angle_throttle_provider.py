"""`/discover/registry` — l'angle commercial passe par la file interactive (#2521, suite).

`_angles_by_siren` est l'appel modèle unique de Découvrir (l'angle commercial),
dans le MÊME tour HTTP qu'un commercial attend à l'écran. Il partageait le seau
`claude` avec les analyses de fond — voir `test_claude_service_throttle_provider.py`
pour la preuve générique que `throttle_provider` sépare bien les deux seaux.
Ce test-ci vérifie le point d'intégration : Découvrir demande VRAIMENT le seau
`claude_chat`, pas seulement un mécanisme qui existe mais n'est branché nulle
part (le motif qui revient dans ce dépôt : du code juste que personne n'appelle).
"""

from __future__ import annotations

from unittest.mock import AsyncMock

import pytest

from app.routers import discover as discover_router
from app.services.claude_service import CallMetadata


@pytest.mark.asyncio
async def test_the_angle_call_requests_the_interactive_bucket(monkeypatch) -> None:
    captured: dict = {}

    async def _fake_call_claude(*args, **kwargs):
        captured.update(kwargs)
        return {"angles": []}, None

    monkeypatch.setattr(discover_router, "call_claude", AsyncMock(side_effect=_fake_call_claude))

    await discover_router._angles_by_siren(
        [{"siren": "123456789", "name": "ACME"}], profile_data={}, query={}, degraded=[]
    )

    metadata = captured.get("metadata")
    assert isinstance(metadata, CallMetadata)
    assert metadata.throttle_provider == "claude_chat"
