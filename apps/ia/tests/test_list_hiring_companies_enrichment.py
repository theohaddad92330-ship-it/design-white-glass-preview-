"""#3097 — `list_hiring_companies` (Découvrir) porte désormais les MÊMES deux
champs que `it_job_signals` (offres PAR compte) : le niveau d'expérience et le
salaire affichés par la source, jamais estimés. Sans eux, `discover_signals.py`
n'avait aucun texte à passer à `derive_seniority` sur ce chemin — le filtre
séniorité de Découvrir resterait structurellement vide.
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
async def test_experience_and_salary_travel_next_to_the_signal_when_the_source_shows_them(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("FRANCE_TRAVAIL_CLIENT_ID", "id")
    monkeypatch.setenv("FRANCE_TRAVAIL_CLIENT_SECRET", "sec")
    recent = (datetime.now(UTC) - timedelta(days=5)).strftime("%Y-%m-%dT%H:%M:%SZ")
    c = AsyncMock(spec=httpx.AsyncClient)
    c.post = AsyncMock(return_value=_resp({"access_token": "tok"}))
    c.get = AsyncMock(
        return_value=_resp(
            {
                "resultats": [
                    {
                        "id": "1",
                        "intitule": "Ingénieur Senior Cloud",
                        "romeCode": "M1805",
                        "dateCreation": recent,
                        "experienceLibelle": "Expérience exigée de 6 An(s)",
                        "salaire": {"libelle": "Mensuel de 3500.00 Euros à 4200.00 Euros"},
                        "entreprise": {"nom": "Acme"},
                    },
                    {
                        "id": "2",
                        "intitule": "Développeur Go",
                        "romeCode": "M1805",
                        "dateCreation": recent,
                        "entreprise": {"nom": "Acme"},
                    },
                ]
            }
        )
    )
    out = await list_hiring_companies(department="75", client=c)
    by_title = {row["signal"]["label"]: row for row in out}
    senior = by_title["Recrutement — Ingénieur Senior Cloud"]
    assert senior["experienceLabel"] == "Expérience exigée de 6 An(s)"
    assert senior["salaryLabel"] == "Mensuel de 3500.00 Euros à 4200.00 Euros"
    # La source ne les affiche pas pour cette offre : `None`, jamais deviné.
    other = by_title["Recrutement — Développeur Go"]
    assert other["experienceLabel"] is None
    assert other["salaryLabel"] is None
