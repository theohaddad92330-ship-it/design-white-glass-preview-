"""#4469 (recette 23/10) — le chemin SERVI par « remplissage » (#4430) lisait l'intitulé BRUT : « Agent de
sécurité Saint-Cloud » citait « cloud ». Même règle que la moisson : le métier de l'offre, hors lieu/employeur."""

from __future__ import annotations

from types import SimpleNamespace
from unittest.mock import AsyncMock

import pytest

from app.services import fresh_jobs


def _offer(title: str, city: str = "Saint-Cloud", **extra: object) -> dict:
    return {"title": title, "city": city, "date": "2026-10-20", "url": f"https://x/{title}", **extra}


@pytest.mark.asyncio
async def test_le_remplissage_ne_retient_pas_un_lieu_ni_un_employeur(monkeypatch: pytest.MonkeyPatch) -> None:
    by_siren = {
        "100000001": [_offer("Agent de sécurité Saint-Cloud")],
        "100000002": [_offer("Vendeur/vendeuse en pâtisserie", city="Lyon")],
        "100000003": [_offer("Commercial terrain B to B Site internet", city="Lyon")],
        "100000004": [_offer("Ingénieur Cloud AWS")],
    }
    names = {
        "100000001": "SECURITE 92",
        "100000002": "LEKLA SAINT-CLOUD",
        "100000003": "PARITEL",
        "100000004": "ACME",
    }
    plan = SimpleNamespace(to_collect=list(by_siren), as_of={})
    monkeypatch.setattr(fresh_jobs, "plan_fresh_collection", AsyncMock(return_value=plan))
    monkeypatch.setattr(fresh_jobs, "mark_collected", AsyncMock())

    async def _collect(name: str, siren: str, **_: object) -> list[dict]:
        return by_siren[siren]

    monkeypatch.setattr(fresh_jobs, "collect_fresh_jobs", _collect)
    companies = [{"name": names[s], "siren": s} for s in by_siren]
    found, _stats = await fresh_jobs.fill_skill_accounts(
        ["cloud"], companies, space_key="ws", pack=None, all_roles=True, wait_s=1
    )
    assert [c["siren"] for c in found] == ["100000004"]
    assert found[0]["skillEvidence"]["offerCount"] == 1
