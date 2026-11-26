"""#4469 — la ZONE ne se déduit JAMAIS d'un mot de la compétence : « cloud » n'est pas Saint-Cloud.

La porte est réelle (``POST /discover/registry``). Le service de communes est doublé pour répondre « Saint-Cloud » à
toute requête contenant « cloud » (c'est ce que fait une recherche par fragment) : une compétence, tapée en
mot-clé, en technologie OU en texte libre, ne pose aucune ville, aucun département, aucune région. Le garde sait dire
NON (« à Lille » pose bien Lille) — sinon il ne garderait rien.
"""

from __future__ import annotations

from typing import Any
from unittest.mock import AsyncMock

import pytest

from app.services.discover_skill_offers import SkillAccounts

_SAINT_CLOUD = {
    "code": "92064",
    "name": "Saint-Cloud",
    "postalCodes": ["92210"],
    "department": "92",
    "departmentName": "Hauts-de-Seine",
    "region": "11",
    "latitude": 48.84,
    "longitude": 2.2,
}
_LILLE = {
    "code": "59350",
    "name": "Lille",
    "postalCodes": ["59000"],
    "department": "59",
    "departmentName": "Nord",
    "region": "32",
    "latitude": 50.63,
    "longitude": 3.06,
}


@pytest.fixture
def door(monkeypatch):
    calls: list[dict[str, Any]] = []

    # #4515 / #4641 — l'appel réel passe AUSSI le cercle (`centre`, `radius_km`) quand une ville est posée :
    # un double qui ne les accepte pas rend un `TypeError` et la garde ne garde plus rien.
    async def fake(skills, zone, profile, *, deadline, city=None, centre=None, radius_km=None, commune_code=None, limit=None):
        calls.append(
            {"skills": list(skills), "zone": list(zone), "city": city, "centre": centre, "radius_km": radius_km}
        )
        return SkillAccounts(accounts=[], intermediaries=[], info={"skills": list(skills), "emptyCause": "no_offers"})

    async def communes(query: str, limit: int = 5) -> list[dict]:
        folded = query.lower()
        if "cloud" in folded:
            return [_SAINT_CLOUD]
        return [_LILLE] if "lille" in folded else []

    monkeypatch.setattr("app.routers.discover.find_skill_accounts", fake)
    monkeypatch.setattr("app.routers.discover.search_communes", communes)
    monkeypatch.setattr("app.routers.discover.call_claude", AsyncMock(return_value=({"angles": []}, None)))

    async def _no_signals(*args: Any, **kwargs: Any) -> list[dict]:
        return []

    for name in ("public_tenders", "it_job_signals", "legal_signals", "funding_signals", "_press_for",
                 "_ats_for_card", "_peek_shared_jobs", "_adzuna_for_card", "_page_volumes"):  # fmt: skip
        monkeypatch.setattr(f"app.routers.discover.{name}", _no_signals)
    return calls


def _post(client, filters: dict[str, Any]) -> dict:
    response = client.post("/discover/registry", json={"filters": filters, "profile_data": {}})
    assert response.status_code == 200, response.text
    return response.json()


@pytest.mark.parametrize(
    "filters",
    [
        {"technologiesObserved": ["cloud"], "keywords": ["cloud"]},
        {"technologiesObserved": ["cloud"], "keywords": ["cloud"], "freetext": "cloud"},
        {"keywords": ["cloud", "aws"], "freetext": "expert cloud aws"},
    ],
)
def test_une_competence_ne_pose_aucune_zone(client, door, filters) -> None:
    body = _post(client, filters)
    assert door, "la recherche par compétence n'a pas tourné"
    for call in door:
        assert call["city"] is None
        assert call["zone"] == []
    assert "saint-cloud" not in str(body.get("query", {})).lower()


def test_sait_dire_non_une_ville_nommee_apres_une_preposition_pose_bien_la_zone(client, door) -> None:
    _post(client, {"technologiesObserved": ["cloud"], "keywords": ["cloud"], "freetext": "expert cloud à Lille"})
    assert door
    assert any(call["city"] == "Lille" or "59" in call["zone"] for call in door)
