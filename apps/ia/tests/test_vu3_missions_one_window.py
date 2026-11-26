"""VU.3 (18/10) — « missions terminées » : UNE fenêtre, celle de la requête.

Recette prod : deux fenêtres de dates différentes dans l'en-tête d'une même réponse. La carte annonce « du A au B » ;
chaque ligne doit tomber dans ce A–B, y compris la part À VENIR lue par `missions/ending` (qui ne connaît que
« dans N jours » et ignorait le début de la fenêtre).
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any

import pytest

from app.services import bellum_api
from app.services.chat_tools import execute_chat_tool

USER = "00000000-0000-0000-0000-000000000001"


@pytest.fixture(autouse=True)
def _configured(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)


def _day(n: int) -> str:
    return (datetime.now(UTC) + timedelta(days=n)).date().isoformat()


@pytest.mark.asyncio
async def test_future_window_does_not_list_missions_ending_before_its_start(monkeypatch: pytest.MonkeyPatch) -> None:
    async def _ending(*_a: Any, **_k: Any) -> dict[str, Any]:
        return {
            "missions": [
                {"label": "Trop tôt", "accountName": "AVANT", "ends_on": _day(5)},
                {"label": "Dans la fenêtre", "accountName": "DEDANS", "ends_on": _day(40)},
                {"label": "Trop tard", "accountName": "APRES", "ends_on": _day(90)},
            ]
        }

    monkeypatch.setattr(bellum_api, "missions_ending", _ending)
    out = await execute_chat_tool(
        "list_records",
        {"source": "missions", "from_iso": _day(30), "to_iso": _day(60)},
        user_id=USER,
        profile_data=None,
    )
    shown = repr(out["card"]["rows"])
    assert "DEDANS" in shown
    assert "AVANT" not in shown
    assert "APRES" not in shown
