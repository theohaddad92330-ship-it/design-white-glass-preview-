"""#4791.2 — Market Memory devient une SOURCE de candidats : un nom d'entreprise entre dans la liste s'il est
apparié à un SIREN avec certitude (identité registre existante), jamais deviné ; sans date, aucun besoin."""

from __future__ import annotations

import asyncio
from unittest.mock import patch

from app.routers import discover as d
from app.services.discover_skill_offers import EmployerResolution


def _run(coro):
    return asyncio.run(coro)


def _names(*items: dict) -> list[d.MarketMemoryName]:
    return [d.MarketMemoryName(**item) for item in items]


async def _fake_resolve(name: str, siren=None, *, department=None):
    known = {
        "Acme Conseil": {
            "siren": "123456789",
            "name": "ACME CONSEIL",
            "city": "LYON",
            "sector": "Conseil",
            "nafCode": "7022Z",
        },
    }
    ident = known.get(name)
    return EmployerResolution(ident) if ident else EmployerResolution(None, "homonym")


def test_un_nom_apparie_entre_avec_son_besoin_date() -> None:
    names = _names({"name": "Acme Conseil", "label": "Java", "date": "2026-08"})
    with patch.object(d, "resolve_employer", _fake_resolve):
        out = _run(d._market_memory_candidates(names))
    assert [(c.siren, c.name) for c in out] == [("123456789", "ACME CONSEIL")]
    assert out[0].observedNeed is not None and out[0].observedNeed.date == "2026-08"


def test_un_nom_non_apparie_n_entre_pas() -> None:
    names = _names({"name": "Inconnue SA", "label": "Java", "date": "2026-08"})
    with patch.object(d, "resolve_employer", _fake_resolve):
        assert _run(d._market_memory_candidates(names)) == []


def test_sans_date_aucun_besoin_affiche() -> None:
    names = _names({"name": "Acme Conseil", "label": "Java"})
    with patch.object(d, "resolve_employer", _fake_resolve):
        out = _run(d._market_memory_candidates(names))
    assert len(out) == 1 and d._observed_need(out[0].observedNeed) is None
