"""#3901.t — le chemin TERRITOIRE (`list_hiring_companies*`) passe par le MÊME
filtre d'employeur que le chemin PAR COMPTE (lot Y07, `_mentions_company`).

Le chemin territoire ne part pas d'un compte : il moissonne des employeurs
NOMMÉS par les offres, puis résout chaque nom en SIREN (`resolve_company_identity`).
« Mairie de Still » pouvait ainsi se résoudre sur la société privée STILL — le
même homonyme commune/entreprise que Y07 a fermé pour le chemin par compte.
"""

from __future__ import annotations

import asyncio
from datetime import UTC, datetime, timedelta

import pytest

from app.routers import discover_signals as mod
from app.services.company_filters import public_administration_mismatch
from app.services.homonym_disambiguation import HomonymResolution, ScoredCandidate


def _iso(days_ago: int) -> str:
    return (datetime.now(UTC) - timedelta(days=days_ago)).date().isoformat()


def _row(name: str) -> dict:
    return {
        "name": name,
        "siren": None,
        "department": "67",
        "city": None,
        "signal": {"type": "hiring", "label": f"Développeur — {name}", "date": _iso(3), "url": None, "detail": None},
    }


def _selected(siren: str, name: str, legal_category: str | None) -> HomonymResolution:
    return HomonymResolution(
        status="selected",
        selectedSiren=siren,
        confidence=0.9,
        candidates=[
            ScoredCandidate(
                siren=siren,
                name=name,
                nafCode="28.22Z",
                city="STILL",
                department="67",
                headcount=200,
                sizeClass="ETI",
                establishmentCount=1,
                isActive=True,
                score=0.9,
                reasons=[],
                source="test",
                legalCategory=legal_category,
            )
        ],
    )


@pytest.fixture()
def stub_sources(monkeypatch):
    def _install(rows: list[dict]):
        async def _hiring(*a, **kw):
            return rows

        async def _empty(*a, **kw):
            return []

        monkeypatch.setattr(mod, "list_hiring_companies", _hiring)
        for name in (
            "list_hiring_companies_apec",
            "list_hiring_companies_wttj",
            "list_hiring_companies_search",
            "list_tender_buyers",
            "list_award_buyers",
            "it_job_signals_wttj",
            "it_job_signals_ats",
        ):
            monkeypatch.setattr(mod, name, _empty)

    return _install


def test_the_shared_filter_says_no_and_yes():
    assert public_administration_mismatch("Mairie de Still", "STILL SAS") is True
    assert public_administration_mismatch("STILL SAS", "STILL SAS") is False
    # La cible ELLE-MÊME est l'administration : la recherche littérale reste possible.
    assert public_administration_mismatch("Mairie de Still", "Commune de Still") is False


def test_a_town_hall_offer_is_never_resolved_onto_the_private_homonym(stub_sources, monkeypatch):
    stub_sources([_row("Mairie de Still")])

    async def _resolve(name, **kw):
        return _selected("552100554", "STILL", "5710")  # SAS privée homonyme

    monkeypatch.setattr(mod, "resolve_company_identity", _resolve)
    resp = asyncio.run(mod.discover_signals(mod.DiscoverSignalsRequest(sinceDays=90, limit=25, profile_data={"placedRoles": ["développeur"]})))

    assert [c.siren for c in resp.candidates] == []
    # Écartée comme une homonymie non tranchée, jamais en silence.
    assert resp.coverage.rejectedAmbiguous == 1


def test_a_town_hall_resolved_onto_the_town_itself_is_kept(stub_sources, monkeypatch):
    stub_sources([_row("Mairie de Still")])

    async def _resolve(name, **kw):
        return _selected("216704489", "COMMUNE DE STILL", "7210")

    monkeypatch.setattr(mod, "resolve_company_identity", _resolve)
    resp = asyncio.run(mod.discover_signals(mod.DiscoverSignalsRequest(sinceDays=90, limit=25, profile_data={"placedRoles": ["développeur"]})))

    assert [c.siren for c in resp.candidates] == ["216704489"]


def test_a_private_employer_is_untouched(stub_sources, monkeypatch):
    stub_sources([_row("STILL SAS")])

    async def _resolve(name, **kw):
        return _selected("552100554", "STILL", "5710")

    monkeypatch.setattr(mod, "resolve_company_identity", _resolve)
    resp = asyncio.run(mod.discover_signals(mod.DiscoverSignalsRequest(sinceDays=90, limit=25, profile_data={"placedRoles": ["développeur"]})))

    assert [c.siren for c in resp.candidates] == ["552100554"]
