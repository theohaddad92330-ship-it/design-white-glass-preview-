"""#2337 — `plan_talent_territory` est ENREGISTRÉ, DISPATCHÉ, et ne fait qu'une lecture.

`test_territory_planner.py` tient le compilateur en isolation. Ce fichier tient
la COUTURE avec `chat_tools.py` : l'outil est DÉCLARÉ dans le catalogue (des
outils ajoutés APRÈS lui, chacun EN FIN à son tour, ne le déplacent jamais —
on teste sa PRÉSENCE, jamais la dernière position, qui change à chaque nouvel
outil), n'est pas une écriture, refuse moins de deux talents SANS appeler le
pont, et rend une carte lisible par l'écran quand le pont répond.
"""

from __future__ import annotations

from typing import Any

import pytest

from app.services import chat_tools
from app.services.chat_tools import CHAT_TOOLS, execute_chat_tool
from app.services.reply_blocks import split_reply_blocks

TOOL_NAME = "plan_talent_territory"


def test_l_outil_est_dans_le_catalogue() -> None:
    # Pas "le dernier" : d'autres outils sont ajoutés EN FIN après lui au fil
    # des lots (chacun préservant le préfixe de cache au moment où IL est
    # écrit) — seule sa PRÉSENCE est garantie, jamais sa position finale.
    names = [t["name"] for t in CHAT_TOOLS]
    assert TOOL_NAME in names


def test_l_outil_est_une_lecture_pas_une_ecriture() -> None:
    assert TOOL_NAME not in chat_tools.WRITE_TOOL_NAMES


async def test_un_seul_talent_est_refuse_sans_appeler_le_pont(monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list[Any] = []

    async def _facts(*args: Any, **kwargs: Any) -> dict[str, Any]:
        calls.append((args, kwargs))
        return {}

    monkeypatch.setattr("app.services.bellum_api.talent_territory_facts", _facts)
    monkeypatch.setattr("app.services.bellum_api.is_configured", lambda: True)
    out = await execute_chat_tool(
        TOOL_NAME, {"talents": [{"consultant_id": "a"}, {"consultant_id": "a"}]}, user_id="u-1", profile_data=None
    )
    assert "au moins deux talents" in out["error"]
    assert calls == []


async def test_pont_eteint_dit_non_plutot_qu_un_terrain_vide(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr("app.services.bellum_api.is_configured", lambda: False)
    out = await execute_chat_tool(
        TOOL_NAME, {"talents": [{"consultant_id": "a"}, {"consultant_id": "b"}]}, user_id="u-1", profile_data=None
    )
    assert out == {"error": "Je n'ai pas accès au vivier depuis ici."}


async def test_le_pont_repond_une_carte_de_terrain_de_jeu_lisible(monkeypatch: pytest.MonkeyPatch) -> None:
    seen: list[dict[str, Any]] = []

    async def _facts(user_id: str, *, consultant_ids: list[str]) -> dict[str, Any]:
        seen.append({"user_id": user_id, "consultant_ids": consultant_ids})
        evaluation = {
            "bucket": "recommended",
            "correspondenceScore": 70,
            "pushableScore": 70,
            "matchedSkills": [],
            "notEvaluatedAxes": [],
            "flags": [],
        }
        return {
            "talents": [
                {"consultantId": "a", "fullName": "Camille Roussel", "zones": []},
                {"consultantId": "b", "fullName": "Hakim Barreau", "zones": []},
            ],
            "unknownTalentIds": [],
            "accounts": [
                {
                    "accountId": "acc-1",
                    "accountName": "Acme",
                    "fitScore25": 18,
                    "fitVerdict": "PRUDENT",
                    "presentedConsultantIds": [],
                    "needs": [
                        {
                            "needId": "n1",
                            "title": "Expert GRC",
                            "location": None,
                            "ownerName": "Léa Martin",
                            "contactId": None,
                            "evaluations": [{**evaluation, "consultantId": "a"}, {**evaluation, "consultantId": "b"}],
                        }
                    ],
                }
            ],
            "evaluatedNeeds": 1,
            "truncated": False,
        }

    monkeypatch.setattr("app.services.bellum_api.is_configured", lambda: True)
    monkeypatch.setattr("app.services.bellum_api.talent_territory_facts", _facts)
    out = await execute_chat_tool(
        TOOL_NAME,
        {"talents": [{"consultant_id": "a", "conditions": "Télétravail"}, {"consultant_id": "b"}], "capacity": 3},
        user_id="u-1",
        profile_data=None,
    )
    assert seen == [{"user_id": "u-1", "consultant_ids": ["a", "b"]}]
    assert out["capacity"] == 3
    [segment] = split_reply_blocks(out["card"])
    assert segment.kind == "block"
    assert segment.block["items"][0]["name"] == "Acme"
    assert segment.block["items"][0]["href"] == "/accounts/acc-1"
