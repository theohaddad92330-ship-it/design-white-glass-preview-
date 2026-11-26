"""#4754 HIST-A — une offre de plus de 365 j n'est plus jetée : elle est stockée et
estampillée ``historical``. Au-delà de 1095 j (plafond ``sinceDays``), elle sort."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock

import httpx
import pytest

from app.routers.discover_signals import DiscoverSignalsRequest
from app.services.data_sources.apec import it_job_signals_apec
from app.services.data_sources.ats_boards import it_job_signals_ats
from app.services.data_sources.france_travail import it_job_signals


def _resp(json_data: object, status: int = 200) -> httpx.Response:
    return httpx.Response(status, json=json_data, request=httpx.Request("GET", "https://x.test"))


def _iso(days_ago: int) -> str:
    return (datetime.now(UTC) - timedelta(days=days_ago)).strftime("%Y-%m-%dT%H:%M:%SZ")


@pytest.mark.asyncio
async def test_france_travail_keeps_and_stamps_old_offers(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("FRANCE_TRAVAIL_CLIENT_ID", "id")
    monkeypatch.setenv("FRANCE_TRAVAIL_CLIENT_SECRET", "sec")

    def _o(title: str, days: int) -> dict:
        return {
            "intitule": title,
            "lieuTravail": {"libelle": "29 - Brest"},
            "dateCreation": _iso(days),
            "dateActualisation": _iso(days),
            "entreprise": {"nom": "Crédit Mutuel Arkéa"},
        }

    c = AsyncMock(spec=httpx.AsyncClient)
    c.post = AsyncMock(return_value=_resp({"access_token": "tok"}))
    c.get = AsyncMock(
        return_value=_resp(
            {"resultats": [_o("Développeur Java récent", 10), _o("Développeur Java d'il y a un an", 400), _o("Développeur Java trop vieux", 1500)]}
        )
    )
    out = await it_job_signals("Crédit Mutuel Arkéa", client=c)
    by_title = {j["title"]: j for j in out}
    assert "Développeur Java d'il y a un an" in by_title
    assert by_title["Développeur Java d'il y a un an"]["historical"] is True
    assert "historical" not in by_title["Développeur Java récent"]
    # Décision Louis 31/10 : aucune borne d'âge au STOCKAGE (source gratuite) — la très vieille offre est GARDÉE, estampillée.
    assert by_title["Développeur Java trop vieux"]["historical"] is True


def _apec_post(days: int) -> AsyncMock:
    c = AsyncMock(spec=httpx.AsyncClient)
    c.post = AsyncMock(
        return_value=_resp(
            {
                "resultats": [
                    {
                        "numeroOffre": "1W",
                        "nomCommercial": "SNCF",
                        "intitule": "Développeur Java F/H",
                        "texteOffre": "Java, Spring.",
                        "datePublication": _iso(days),
                    }
                ]
            }
        )
    )
    return c


@pytest.mark.asyncio
async def test_apec_keeps_and_stamps_old_offers(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("APEC_JOBS_ENABLED", "true")
    out = await it_job_signals_apec("SNCF", client=_apec_post(400))
    assert [j["title"] for j in out] == ["Développeur Java F/H"]
    assert out[0]["historical"] is True


@pytest.mark.asyncio
async def test_apec_keeps_and_stamps_even_very_old_offers(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("APEC_JOBS_ENABLED", "true")
    out = await it_job_signals_apec("SNCF", client=_apec_post(1500))
    assert [j["title"] for j in out] == ["Développeur Java F/H"]
    assert out[0]["historical"] is True


@pytest.mark.asyncio
async def test_ats_keeps_and_stamps_old_offers() -> None:
    from tests.test_ats_boards import _gh_job, _routes

    client = _routes([("greenhouse", _resp({"jobs": [_gh_job("Data Engineer", days_ago=400, jid=10), _gh_job("DevOps Engineer", days_ago=3, jid=12), _gh_job("Cloud Engineer", days_ago=1500, jid=13)]}))])
    out = await it_job_signals_ats("Doctolib", website="doctolib.fr", client=client)
    # Pas de borne d'âge au stockage : l'offre de 1500 jours est gardée, estampillée, triée en dernier.
    assert [j["title"] for j in out] == ["DevOps Engineer", "Data Engineer", "Cloud Engineer"]
    assert out[1]["historical"] is True
    assert out[2]["historical"] is True
    assert "historical" not in out[0]


def test_since_days_ceiling_is_one_value_ia_side_and_contract_side() -> None:
    import re
    from pathlib import Path

    ia = DiscoverSignalsRequest.model_fields["sinceDays"]
    ia_max = next(m.le for m in ia.metadata if hasattr(m, "le"))
    assert ia_max == 1095
    ts = Path(__file__).resolve().parents[3] / "packages/contracts/src/schemas/discover.ts"
    assert re.search(r"sinceDays: z\.number\(\)\.int\(\)\.positive\(\)\.max\(1095\)", ts.read_text())
