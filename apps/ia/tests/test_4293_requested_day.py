"""#4293.8 (#2770.13) — « Organise-moi ma journée de lundi » visait le 19/10 (aujourd'hui) au lieu de LUNDI prochain.
Le jour demandé se lit dans le message, en code ; il l'emporte sur la date devinée par le modèle."""

from __future__ import annotations

from datetime import date, datetime
from zoneinfo import ZoneInfo

import pytest

from app.services import bellum_api
from app.services.chat_requested_mode import set_turn_thread
from app.services.chat_tools import execute_chat_tool
from app.services.requested_day import requested_day

MONDAY = date(2026, 10, 19)
USER = "11111111-1111-4111-8111-111111111111"


@pytest.mark.parametrize(
    ("message", "expected"),
    [
        ("Organise-moi ma journée de lundi", date(2026, 10, 26)),  # on est lundi : « lundi » = le PROCHAIN
        ("planifie ma journée de mercredi", date(2026, 10, 21)),
        ("organise mon vendredi 23", date(2026, 10, 23)),
        ("organise ma journée de demain", date(2026, 10, 20)),
        ("organise ma journée d'après-demain", date(2026, 10, 21)),
        ("organise ma journée de lundi prochain", date(2026, 10, 26)),
        ("Organise-moi ma journée de LUNDI", date(2026, 10, 26)),
    ],
)
def test_the_requested_day_is_read_from_the_message(message: str, expected: date) -> None:
    assert requested_day(message, MONDAY) == expected


@pytest.mark.parametrize(
    "message", ["Organise ma journée", "planifie-moi cet après-midi", "organise ma journée d'aujourd'hui", "", None]
)
def test_no_named_day_leaves_the_default(message: str | None) -> None:
    assert requested_day(message, MONDAY) is None


@pytest.mark.asyncio
async def test_the_plan_targets_the_named_day_even_if_the_model_guessed_today(monkeypatch: pytest.MonkeyPatch) -> None:
    seen: dict[str, str] = {}

    async def _slots(_u: str, **kwargs: object) -> list[dict]:
        seen["from"] = str(kwargs["from_iso"])
        return [{"start": "2026-10-26T09:00:00+00:00", "end": "2026-10-26T12:00:00+00:00", "minutes": 180}]

    monkeypatch.setattr(bellum_api, "find_free_slots", _slots)
    set_turn_thread("Organise-moi ma journée de lundi", [])
    import app.services.chat_tools as chat_tools

    # Le « maintenant » du produit : un lundi 19/10 à 21 h 30 (l'heure de la recette).
    monkeypatch.setattr(
        chat_tools, "now_in_reference_timezone", lambda *_a, **_k: datetime(2026, 10, 19, 21, 30, tzinfo=ZoneInfo("Europe/Paris"))
    )
    result = await execute_chat_tool(
        "propose_focus_plan",
        {
            "date": MONDAY.isoformat(),  # la devinette du modèle : aujourd'hui
            "blocks": [
                {"type": "call_session", "title": "Appels", "duration_minutes": 30, "priority_reason": "Comptes chauds"}
            ],
        },
        user_id=USER,
        profile_data=None,
    )
    assert result["proposal"]["plan"]["date"] == "2026-10-26"
    assert seen["from"].startswith("2026-10-26")
