"""#3889.3 (lot M13, 09/10) — « un projet documentaire conserve sa nature et sa source ».

Le projet DÉCRIT dans une expérience de CV autorisé (`contexte` côté API) arrive à Laura
avec sa période, sa preuve (l'extrait du CV) et sa nature `cv_experience` : une expérience
déclarée, jamais une mission de l'ESN, jamais un objet Projet du pipe — et rien n'est créé.
Appelant : `search_talents` + `experience_client` → `TalentService.findByExperienceClient`.
"""

from __future__ import annotations

from typing import Any

import pytest

from app.services import bellum_api
from app.services.chat_tools import execute_chat_tool

USER = "11111111-1111-4111-8111-111111111111"

_ROW = {
    "consultantId": "c1",
    "fullName": "Nom Un",
    "title": "Data engineer",
    "experiences": [
        {
            "client": "Sanofi",
            "role": "Data engineer",
            "from": "2023-01-01",
            "to": "2024-06-30",
            "project": "Programme « Data Lake R&D » — migration des pipelines cliniques",
            "nature": "cv_experience",
            "source": "Sanofi (via Capgemini) — Data engineer, 2023-2024 : programme Data Lake R&D",
        },
        {"client": "Sanofi", "role": "Architecte data", "from": None, "to": None},
    ],
}


@pytest.fixture(autouse=True)
def _bridge(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(bellum_api, "is_configured", lambda: True)

    async def _by_experience(user_id: str, client: str) -> dict[str, Any]:
        return {"total": 1, "items": [_ROW]}

    monkeypatch.setattr(bellum_api, "search_talents_by_experience", _by_experience)


@pytest.mark.asyncio
async def test_3889_3_le_projet_garde_sa_nature_sa_periode_et_sa_source() -> None:
    out = await execute_chat_tool("search_talents", {"experience_client": "Sanofi"}, user_id=USER, profile_data=None)
    first = out["talents"][0]["experiences"][0]
    assert first == {
        "client": "Sanofi",
        "role": "Data engineer",
        "from": "2023-01-01",
        "to": "2024-06-30",
        "project": "Programme « Data Lake R&D » — migration des pipelines cliniques",
        "nature": "cv_experience",
        "source": "Sanofi (via Capgemini) — Data engineer, 2023-2024 : programme Data Lake R&D",
    }


@pytest.mark.asyncio
async def test_3889_3_sait_dire_non_sans_projet_ecrit_rien_nest_invente() -> None:
    out = await execute_chat_tool("search_talents", {"experience_client": "Sanofi"}, user_id=USER, profile_data=None)
    second = out["talents"][0]["experiences"][1]
    assert second["project"] is None
    assert second["source"] is None
    # La nature est celle du CHEMIN (une expérience de CV), même quand le pont ne la répète pas.
    assert second["nature"] == "cv_experience"


@pytest.mark.asyncio
async def test_3889_3_la_consigne_interdit_d_en_faire_une_mission_ou_un_projet_du_pipe() -> None:
    out = await execute_chat_tool("search_talents", {"experience_client": "Sanofi"}, user_id=USER, profile_data=None)
    note = out["project_note"]
    assert "pas une mission" in note
    assert "pipe" in note
    assert "source" in note
