"""#3901.v — « Recrutement IT » n'est écrit que pour une offre dont le contenu
est IT (`is_it_offer`) ; « Ingénieur HSE » ou « Responsable clients » restent
« Recrutement » — jamais présentés comme un signal de budget IT.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock

import httpx
import pytest

from app.services.data_sources.france_travail import list_hiring_companies


def _resp(json_data: object, status: int = 200) -> httpx.Response:
    return httpx.Response(status, json=json_data, request=httpx.Request("GET", "https://x"))


@pytest.mark.asyncio
async def test_non_it_offers_are_not_labelled_it(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("FRANCE_TRAVAIL_CLIENT_ID", "id")
    monkeypatch.setenv("FRANCE_TRAVAIL_CLIENT_SECRET", "sec")
    recent = (datetime.now(UTC) - timedelta(days=5)).strftime("%Y-%m-%dT%H:%M:%SZ")
    c = AsyncMock(spec=httpx.AsyncClient)
    c.post = AsyncMock(return_value=_resp({"access_token": "tok"}))
    offers = [
        {"id": "1", "intitule": "Ingénieur HSE", "romeCode": "H1302"},
        {"id": "2", "intitule": "Responsable clients", "romeCode": "D1407"},
        {"id": "3", "intitule": "Développeur Go", "romeCode": "M1805"},
    ]
    c.get = AsyncMock(
        return_value=_resp(
            {"resultats": [{**o, "dateCreation": recent, "entreprise": {"nom": "Acme"}} for o in offers]}
        )
    )
    out = await list_hiring_companies(department="75", client=c)
    labels = {row["signal"]["label"] for row in out}
    assert "Recrutement — Ingénieur HSE" in labels
    assert "Recrutement — Responsable clients" in labels
    # #3901.w — même un poste IT n'est plus étiqueté « IT » par l'IA : le secteur se
    # décide à l'AFFICHAGE, par le profil déclaré (jamais un filtre figé côté IA).
    assert "Recrutement — Développeur Go" in labels
    assert not any(" IT" in label for label in labels)
    # Le code ROME voyage avec l'offre : l'affichage s'en sert.
    by_label = {row["signal"]["label"]: row for row in out}
    assert by_label["Recrutement — Ingénieur HSE"]["romeCode"] == "H1302"
    assert by_label["Recrutement — Développeur Go"]["romeCode"] == "M1805"
