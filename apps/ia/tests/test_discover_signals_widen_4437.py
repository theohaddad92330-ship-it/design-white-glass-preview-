"""#4437 (Louis 21/10, épopée #4433) — un signal DEMANDÉ qui ramène peu s'élargit aux faits VOISINS.

« recrutement React » → 2 comptes : Découvrir va chercher le voisin le plus proche — les offres du domaine
sans le mot-clé, les appels d'offres du domaine, les levées (augmentations de capital) — chacun ÉTIQUETÉ
(pourquoi il est là) et DATÉ (ses signaux le sont déjà). L'exact reste en tête. Garde-fous qui disent NON :
au-dessus du seuil rien n'est élargi ; « strict » demandé, rien n'est élargi ; aucun doublon d'un compte exact.
"""

from __future__ import annotations

import asyncio
from datetime import UTC, datetime, timedelta

import pytest

from app.routers import discover_signals as mod
from app.services.homonym_disambiguation import HomonymResolution, ScoredCandidate
from app.services.signal_neighbours import SIGNAL_WIDEN_BELOW


def _iso(days_ago: int) -> str:
    return (datetime.now(UTC) - timedelta(days=days_ago)).date().isoformat()


def _row(name: str, kind: str, label: str) -> dict:
    return {
        "name": name,
        "siren": None,
        "department": "69",
        "city": None,
        "signal": {"type": kind, "label": label, "date": _iso(3), "url": None, "detail": None},
    }


def _selected(siren: str, name: str) -> HomonymResolution:
    return HomonymResolution(
        status="selected",
        selectedSiren=siren,
        confidence=0.9,
        candidates=[
            ScoredCandidate(
                siren=siren, name=name, nafCode="29.10Z", nafLabel="Construction de véhicules",
                city="LYON", department="69", headcount=200, sizeClass="ETI",
                establishmentCount=1, isActive=True, score=0.9, reasons=[], source="test",
            )
        ],
    )  # fmt: skip


@pytest.fixture()
def sources(monkeypatch: pytest.MonkeyPatch) -> dict[str, list]:
    """Recrutement : 2 comptes citent React, d'autres recrutent sans le mot ; AO et capital : des voisins."""
    seen: dict[str, list] = {"hiring_keywords": []}
    react = [_row("ALPHA", "hiring", "Développeur React"), _row("BETA", "hiring", "Lead React")]
    domain = [_row("GAMMA", "hiring", "Développeur Vue.js"), _row("ALPHA", "hiring", "Développeur Java")]

    async def _hiring(dept, kw, days, lim, **_):  # noqa: ANN001, ANN202
        seen["hiring_keywords"].append(list(kw))
        return react if kw else domain

    async def _tenders(*_a, **_k):  # noqa: ANN202
        return [_row("DELTA", "tender", "Refonte du portail web")]

    async def _capital(*_a, **_k):  # noqa: ANN202
        return [_row("EPSILON", "business", "Augmentation de capital")]

    async def _empty(*_a, **_k):  # noqa: ANN202
        return []

    names = {"ALPHA": 1, "BETA": 2, "GAMMA": 3, "DELTA": 4, "EPSILON": 5}

    async def _resolve(name, **_):  # noqa: ANN001, ANN202
        return _selected(f"80000000{names[name]}", name)

    monkeypatch.setattr(mod, "list_hiring_companies", _hiring)
    for fn in ("list_hiring_companies_apec", "list_hiring_companies_wttj", "list_hiring_companies_search"):
        monkeypatch.setattr(mod, fn, _empty)
    monkeypatch.setattr(mod, "list_tender_buyers", _tenders)
    monkeypatch.setattr(mod, "list_award_buyers", _empty)
    monkeypatch.setattr(mod, "list_capital_increase_companies", _capital)
    monkeypatch.setattr(mod, "it_job_signals_wttj", _empty)
    monkeypatch.setattr(mod, "it_job_signals_ats", _empty)
    monkeypatch.setattr(mod, "resolve_company_identity", _resolve)
    return seen


def _run(**kwargs: object) -> mod.DiscoverSignalsResponse:
    return asyncio.run(mod.discover_signals(mod.DiscoverSignalsRequest(sinceDays=90, limit=25, **kwargs)))


def test_a_thin_requested_signal_widens_to_labelled_dated_neighbours(sources: dict[str, list]) -> None:
    resp = _run(keywords=["react"], sources=["hiring"])
    names = [c.name for c in resp.candidates]
    assert names[:2] == ["ALPHA", "BETA"] or set(names[:2]) == {"ALPHA", "BETA"}  # l'exact en tête
    assert set(names[2:]) == {"GAMMA", "DELTA", "EPSILON"}
    assert names.count("ALPHA") == 1  # un compte exact n'est jamais répété en voisin
    exact = [c for c in resp.candidates if c.name in ("ALPHA", "BETA")]
    assert all(c.widenedFrom is None for c in exact)
    by_name = {c.name: c for c in resp.candidates}
    assert by_name["GAMMA"].widenedFrom == {"axis": "signal", "requested": ["hiring:react"], "via": "hiring"}
    assert by_name["DELTA"].widenedFrom["via"] == "tender"
    assert by_name["EPSILON"].widenedFrom["via"] == "capital"
    assert all(s.date for c in resp.candidates for s in c.signals)  # datés
    widening = resp.widening
    assert widening["requested"] == ["hiring:react"]
    assert widening["added"] == 3
    # Le mot-clé n'est levé QUE sur le palier voisin, jamais sur l'exact.
    assert sources["hiring_keywords"][0] == ["react"]


def test_above_the_threshold_nothing_is_widened(sources: dict[str, list], monkeypatch: pytest.MonkeyPatch) -> None:
    many = [_row(f"N{i}", "hiring", "Développeur React") for i in range(SIGNAL_WIDEN_BELOW)]

    async def _hiring(dept, kw, days, lim, **_):  # noqa: ANN001, ANN202
        return many

    async def _resolve(name, **_):  # noqa: ANN001, ANN202
        return _selected(f"81{int(name[1:]):07d}", name)

    monkeypatch.setattr(mod, "list_hiring_companies", _hiring)
    monkeypatch.setattr(mod, "resolve_company_identity", _resolve)
    resp = _run(keywords=["react"], sources=["hiring"])
    assert len(resp.candidates) == SIGNAL_WIDEN_BELOW
    assert all(c.widenedFrom is None for c in resp.candidates)
    assert resp.widening is None


def test_strict_says_no_to_widening(sources: dict[str, list]) -> None:
    resp = _run(keywords=["react"], sources=["hiring"], strictSignal=True)
    assert {c.name for c in resp.candidates} == {"ALPHA", "BETA"}
    assert resp.widening is None


def test_an_unrequested_signal_search_is_not_widened(sources: dict[str, list]) -> None:
    # Aucun signal demandé (ni mot-clé ni source cochée) : la liste d'avant, sans palier.
    resp = _run()
    assert resp.widening is None
