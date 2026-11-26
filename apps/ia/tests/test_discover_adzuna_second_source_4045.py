"""#4045.5 — Adzuna, SECONDE source d'offres des cartes Découvrir (France Travail
est limité à 1 req/s). Sans clé ``ADZUNA_*`` : chemin byte-identique, zéro appel.
Mêmes filtres que France Travail (secteur de l'ESN, pas de stage), fusion
dédoublonnée."""

from __future__ import annotations

import time
from unittest.mock import AsyncMock

import pytest

from app.routers import discover as discover_router

# #3901.p — Découvrir ne retient une offre que si elle recoupe un métier de l'ESN (déclaré ou déduit).
SCOPE_PROFILE = {"placedRoles": ["développeur", "ingénieur", "architecte", "data", "devops", "offre"]}



def _wire(monkeypatch: pytest.MonkeyPatch, *, ft: list[dict], adzuna: list[dict]) -> AsyncMock:
    adz = AsyncMock(return_value=adzuna)
    monkeypatch.setattr(discover_router, "adzuna_jobs", adz)
    monkeypatch.setattr(discover_router, "it_job_signals", AsyncMock(return_value=ft))
    for fn in ("public_tenders", "legal_signals", "press_signals", "funding_signals"):
        monkeypatch.setattr(discover_router, fn, AsyncMock(return_value=[]))
    monkeypatch.setattr(discover_router, "load_press_feeds", AsyncMock(return_value={}))
    return adz


async def _run(siren: str) -> dict:
    candidate = {"name": "ACME", "siren": siren}
    tasks = discover_router._start_signal_tasks([candidate], profile_data=SCOPE_PROFILE)
    degraded: list[dict] = []
    await discover_router._finish_signal_tasks(tasks, degraded, time.monotonic() + 10, profile_data=SCOPE_PROFILE, filters={})
    return candidate


def _adz(title: str, url: str, date: str = "2026-10-10", contract: str | None = "CDI") -> dict:
    return {"title": title, "date": date, "contractType": contract, "url": url, "source": "adzuna", "company": "ACME"}


@pytest.mark.asyncio
async def test_without_keys_adzuna_is_never_called(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("ADZUNA_APP_ID", raising=False)
    monkeypatch.delenv("ADZUNA_APP_KEY", raising=False)
    adz = _wire(monkeypatch, ft=[], adzuna=[_adz("Développeur Python", "https://a/1")])
    candidate = await _run("500000001")
    adz.assert_not_called()
    assert candidate["signals"] == []


@pytest.mark.asyncio
async def test_with_keys_adzuna_offers_are_merged_filtered_and_deduplicated(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("ADZUNA_APP_ID", "x")
    monkeypatch.setenv("ADZUNA_APP_KEY", "y")
    ft_offer = {
        "title": "Développeur Java", "date": "2026-10-09T08:00:00Z", "contractType": "CDI",
        "url": "https://ft/1", "skills": [], "location": "Paris",
    }
    adz = _wire(
        monkeypatch,
        ft=[ft_offer],
        adzuna=[
            _adz("Développeur Java", "https://ft/1"),  # même lien que France Travail
            _adz("Ingénieur DevOps", "https://a/2"),
            _adz("Caissier", "https://a/3"),  # hors secteur de l'ESN
            _adz("Stage développeur web", "https://a/4", contract="Stage"),  # stage
        ],
    )
    candidate = await _run("500000002")
    adz.assert_called_once()
    labels = sorted(s["label"] for s in candidate["signals"])
    assert labels == ["Développeur Java", "Ingénieur DevOps"]  # ni Caissier, ni le stage, Java une seule fois
