"""#4524.2 — « Sur quoi Laura s'appuie » : le choix du commercial voyage jusqu'à la génération.

- Les faits COCHÉS sont dans le paquet envoyé au modèle ; les non cochés n'y sont PAS (ni en bloc, ni dans l'extrait
  du dossier du compte).
- « Angle libre » = aucun fait imposé : aucun signal du compte n'est servi au modèle.
- Sans choix (clé absente), le paquet est celui d'avant, à l'octet près.
"""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from app.services.message_grounding import MessageGrounding, apply_grounding

_CONTACT = {
    "first_name": "Olivier",
    "last_name": "Martin",
    "title": "CTO",
    "decision_role": "Référent technique",
    "entity": "CIB",
    "account_id": "acc-1",
}
_ACCOUNT = {
    "company_name": "Guerbet",
    "raw_analysis": {
        "recent_signals": [
            {"signal": "Cession de la filiale Uptevia", "date": "2026-10-01", "source": "Les Echos"},
            {"signal": "Recrutement de 12 ingénieurs data", "date": "2026-09-20", "source": "Welcome to the Jungle"},
            {"signal": "Nouveau directeur des achats", "date": "2026-09-10", "source": "LinkedIn"},
        ]
    },
}


def _post(grounding: dict | None) -> str:
    """Le user prompt réellement envoyé au modèle pour ce choix."""
    calls: list[str] = []

    async def _spy(system, user, **_kw):
        calls.append(user)
        return {"body": "brouillon"}, None

    body: dict = {
        "contact_id": "c1",
        "user_id": "u1",
        "channel": "email",
        "profile_data": {"companyName": "Acme", "offers": ["SRE"]},
    }
    if grounding is not None:
        body["grounding"] = grounding
    with (
        patch("app.routers.message.get_supabase", return_value=MagicMock()),
        patch("app.routers.message.fetch_owned_contact", new_callable=AsyncMock, return_value=_CONTACT),
        patch("app.routers.message.fetch_owned_account", new_callable=AsyncMock, return_value=_ACCOUNT),
        patch("app.routers.message.call_claude", new=_spy),
    ):
        from app.main import app

        res = TestClient(app).post("/message/generate", json=body)
    assert res.status_code == 200, res.text
    return calls[0]


def test_checked_facts_are_in_the_packet_and_unchecked_ones_are_not() -> None:
    prompt = _post(
        {
            "mode": "facts",
            "facts": [
                {"kind": "account_signal", "label": "Cession de la filiale Uptevia", "proof": "Les Echos · 1 oct."},
                {"kind": "contact_need", "label": "Veut fiabiliser ses pipelines data", "proof": None},
            ],
        }
    )
    assert "Cession de la filiale Uptevia" in prompt
    assert "Les Echos" in prompt
    assert "Veut fiabiliser ses pipelines data" in prompt
    # Non cochés : absents partout, y compris de l'extrait du dossier (`str(raw_analysis)`).
    assert "Recrutement de 12 ingénieurs data" not in prompt
    assert "Nouveau directeur des achats" not in prompt


def test_free_angle_imposes_no_fact() -> None:
    prompt = _post({"mode": "free_angle"})
    assert "Cession de la filiale Uptevia" not in prompt
    assert "Recrutement de 12 ingénieurs data" not in prompt
    assert "ANGLE LIBRE" in prompt
    # Le prompt ne dit plus « pars du signal le plus actionnable » : il n'y en a aucun d'imposé.
    assert "pars du signal le plus actionnable" not in prompt


def test_without_a_choice_the_packet_is_the_one_from_before() -> None:
    prompt = _post(None)
    assert "Cession de la filiale Uptevia" in prompt
    assert "Recrutement de 12 ingénieurs data" in prompt
    assert "SUR QUOI S'APPUYER" not in prompt


def test_facts_mode_without_any_fact_is_refused() -> None:
    with pytest.raises(ValueError):
        MessageGrounding(mode="facts", facts=[])


def test_apply_grounding_none_changes_nothing() -> None:
    raw = {"recent_signals": [{"signal": "x"}]}
    out_raw, out_signals, block = apply_grounding(raw, raw["recent_signals"], None)
    assert out_raw is raw
    assert out_signals is raw["recent_signals"]
    assert block == ""
