"""#4284.13 (#4045.12) — « /discover charge plus de 60 s » : la durée de `/discover/signals` se MESURE.

`/discover/registry` journalise déjà `duration_ms` (#4363.1) ; `signals`, qui dépense le même bucket, n'en disait rien :
la lenteur restait une impression. Trois nombres (durée, candidats, ajoutés par le palier voisin) — ni critère, ni nom.
"""

from __future__ import annotations

import logging
import re

import pytest

from app.routers import discover_signals as mod
from app.routers.discover_signals import DiscoverSignalsRequest, DiscoverSignalsResponse


def _lines(caplog) -> list[str]:
    return [r.getMessage() for r in caplog.records if r.getMessage().startswith("discover signals ")]


async def test_signal_search_logs_one_duration_line(monkeypatch, caplog) -> None:
    async def exact(req: DiscoverSignalsRequest) -> DiscoverSignalsResponse:
        return DiscoverSignalsResponse(candidates=[])

    monkeypatch.setattr(mod, "_discover_signals_exact", exact)
    with caplog.at_level(logging.INFO, logger=mod.logger.name):
        await mod._discover_signals_once(DiscoverSignalsRequest(department="69", keywords=["secret-critere"]))
    lines = _lines(caplog)
    assert len(lines) == 1
    assert re.fullmatch(r"discover signals duration_ms=\d+ candidates=0", lines[0])


async def test_failed_signal_search_still_logs_its_duration(monkeypatch, caplog) -> None:
    async def exact(req: DiscoverSignalsRequest) -> DiscoverSignalsResponse:
        raise RuntimeError("panne")

    monkeypatch.setattr(mod, "_discover_signals_exact", exact)
    with caplog.at_level(logging.INFO, logger=mod.logger.name), pytest.raises(RuntimeError):
        await mod._discover_signals_once(DiscoverSignalsRequest(department="69"))
    assert re.fullmatch(r"discover signals duration_ms=\d+ candidates=0", _lines(caplog)[0])
