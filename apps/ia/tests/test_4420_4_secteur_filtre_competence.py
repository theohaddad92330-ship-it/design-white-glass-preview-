"""#4420.4 a (Louis 23/10/2026, B1 / S18) — en recherche par COMPÉTENCE, un secteur coché FILTRE.

Les comptes hors secteur (NAF) sont écartés ET comptés (``query.skillSearch.outsideSector``) ; un NAF non
publié n'est jamais « hors secteur » (non mesuré). Sources simulées : aucun appel réseau."""

from __future__ import annotations

from typing import Any
from unittest.mock import AsyncMock, patch

import pytest

from app.services.application_sector_naf import naf_codes_for_sectors
from app.services.discover_skill_offers import SkillAccounts


def _account(siren: str, name: str, naf: str | None) -> dict[str, Any]:
    return {
        "siren": siren,
        "name": name,
        "nafCode": naf,
        "sector": "Activité",
        "city": "PARIS",
        "department": "75",
        "headcountRange": "250 à 499 salariés",
        "skillEvidence": {
            "skill": "Java",
            "offerCount": 1,
            "latestOffer": {
                "title": "Développeur Java",
                "city": "Paris",
                "date": "2026-10-15",
                "url": None,
                "source": None,
            },
        },
    }


@pytest.fixture
def java_accounts(monkeypatch):
    accounts = [
        _account("552100554", "NEO BANQUE", "64.20Z"),
        _account("552100555", "PAIEMENT SA", "66.19A"),
        _account("552100556", "ESN SERVICES", "62.01Z"),
        _account("552100557", "COMPTE SANS NAF", None),
    ]

    async def fake(skills, zone, profile, *, deadline, city=None, **_circle):
        return SkillAccounts(
            accounts=list(accounts), intermediaries=[], info={"skills": list(skills), "emptyCause": None}
        )

    monkeypatch.setattr("app.routers.discover.find_skill_accounts", fake)


def _post(client, filters: dict[str, Any]):
    with patch("app.routers.discover.call_claude", new_callable=AsyncMock, return_value=({"angles": []}, None)):
        return client.post("/discover/registry", json={"filters": filters, "profile_data": {}, "strictCriteria": True})


def test_java_fintech_aucun_compte_hors_fintech(client, java_accounts) -> None:
    naf = ",".join(naf_codes_for_sectors(["fintech"]))
    body = _post(client, {"technologiesObserved": ["Java"], "nafCode": naf}).json()

    sirens = {c["siren"] for c in body["candidates"]}
    assert "552100556" not in sirens  # ESN : hors fintech
    assert {"552100554", "552100555"} <= sirens
    assert body["query"]["skillSearch"]["outsideSector"] == 1


def test_sans_secteur_coche_rien_n_est_ecarte(client, java_accounts) -> None:
    body = _post(client, {"technologiesObserved": ["Java"]}).json()

    assert "552100556" in {c["siren"] for c in body["candidates"]}
    assert "outsideSector" not in body["query"]["skillSearch"]
