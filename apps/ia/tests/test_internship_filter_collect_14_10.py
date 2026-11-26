"""Louis 12/10 + 14/10/2026 — AUCUNE offre de stage dans les signaux : un prédicat
unique (``internship_posting``, #4044), appliqué À LA COLLECTE par toutes les sources emploi.
Alternance / apprentissage = contexte, GARDÉE."""

from __future__ import annotations

import httpx
import pytest

from app.services.internship_posting import is_internship_posting


def test_alternance_est_gardee_par_le_predicat_de_main():
    assert not is_internship_posting("Alternance - Développeur Java")
    assert not is_internship_posting("Apprenti ingénieur DevOps")


def test_la_grille_decouvrir_ecarte_les_stages_avec_le_predicat_de_main():
    from app.services import discover_signal_grid

    assert not hasattr(discover_signal_grid, "_INTERNSHIP_RE")
    assert discover_signal_grid.is_internship_posting is is_internship_posting


# ── Adzuna / agrégateurs : filtrés à la fusion ───────────────────────────────


@pytest.mark.asyncio
async def test_agregateurs_ecartent_les_stages(monkeypatch):
    from app.services.data_sources import job_aggregators as ja

    async def fake_adzuna(company, **_):
        return [
            {"title": "Stage : Développeur", "date": "2026-10-01", "url": "https://x/1", "source": "adzuna"},
            {"title": "Architecte cloud", "date": "2026-10-02", "url": "https://x/2", "source": "adzuna"},
        ]

    async def none(*_a, **_k):
        return []

    monkeypatch.setattr(ja, "adzuna_jobs", fake_adzuna)
    monkeypatch.setattr(ja, "jooble_jobs", none)
    monkeypatch.setattr(ja, "theirstack_jobs", none)
    monkeypatch.setattr(ja, "fantastic_jobs", none)
    monkeypatch.setattr(ja, "mantiks_jobs", none)
    # CASCADE-PLANCHER-5 : une source sans clé n'est pas appelée.
    monkeypatch.setenv("ADZUNA_APP_ID", "k")
    monkeypatch.setenv("ADZUNA_APP_KEY", "k")
    out = await ja.it_job_signals_aggregators("Orange")
    assert [o["title"] for o in out] == ["Architecte cloud"]


# ── APEC : stage écarté (client mocké) ───────────────────────────────────────


def _apec_client(resultats):
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(200, json={"resultats": resultats, "totalCount": len(resultats)})

    return httpx.AsyncClient(transport=httpx.MockTransport(handler))


@pytest.mark.asyncio
async def test_apec_ecarte_les_stages():
    from app.services.data_sources import apec

    apec._reset_antibot_for_tests()
    from datetime import UTC, datetime

    today = datetime.now(UTC).strftime("%Y-%m-%dT%H:%M:%S.000+0000")
    rows = [
        {"intitule": "Stage - Chef de projet IT", "nomCommercial": "Orange", "datePublication": today, "numeroOffre": "1"},
        {"intitule": "Chef de projet IT infrastructure", "nomCommercial": "Orange", "datePublication": today, "numeroOffre": "2"},
    ]
    async with _apec_client(rows) as client:
        out = await apec.list_hiring_companies_apec(keywords=["chef de projet"], client=client)
    titles = [r["signal"]["label"] for r in out]
    assert all("Stage" not in t for t in titles)
    assert any("infrastructure" in t for t in titles)
