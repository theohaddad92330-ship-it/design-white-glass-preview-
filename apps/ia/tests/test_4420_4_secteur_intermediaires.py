"""#4420.4 — « Java + Fintech » : un secteur coché filtre AUSSI la section des intermédiaires (ESN, cabinets).

Mesuré en production le 29/10/2026 : GIE AXA (« Conseil en systèmes », une ESN captive) sortait sous Fintech,
parce que ``skillIntermediaries`` n'était jamais croisée avec le secteur. Un mot de la RAISON SOCIALE (« HARDWARE
JAVA COMPUTER ») ne vaut jamais une compétence : seule l'offre la cite. Sources simulées, aucun réseau."""

from __future__ import annotations

from datetime import date, timedelta
from typing import Any
from unittest.mock import AsyncMock, patch

import pytest

from app.services.application_sector_naf import naf_codes_for_sectors
from app.services.discover_skill_offers import SkillAccounts, _reject_reason

_EVIDENCE = {
    "skill": "Java",
    "offerCount": 1,
    "latestOffer": {"title": "Développeur Java", "city": "Paris", "date": "2026-10-15", "url": None, "source": None},
}


def _row(siren: str, name: str, naf: str | None) -> dict[str, Any]:
    return {
        "siren": siren,
        "name": name,
        "nafCode": naf,
        "sector": "Activité",
        "city": "PARIS",
        "department": "75",
        "headcountRange": "250 à 499 salariés",
        "skillEvidence": _EVIDENCE,
    }


@pytest.fixture
def java_found(monkeypatch):
    accounts = [_row("552100554", "NEO BANQUE", "64.20Z")]
    intermediaries = [
        {**_row("552100556", "GIE AXA", "62.02A"), "kind": "esn"},
        {**_row("552100558", "PAIEMENT CONSEIL", "66.19B"), "kind": "recruiter"},
    ]

    async def fake(skills, zone, profile, *, deadline, city=None, **_circle):
        return SkillAccounts(
            accounts=list(accounts), intermediaries=list(intermediaries), info={"skills": list(skills), "emptyCause": None}
        )

    monkeypatch.setattr("app.routers.discover.find_skill_accounts", fake)


def _post(client, filters: dict[str, Any]):
    with patch("app.routers.discover.call_claude", new_callable=AsyncMock, return_value=({"angles": []}, None)):
        return client.post("/discover/registry", json={"filters": filters, "profile_data": {}, "strictCriteria": True})


def test_java_fintech_aucune_esn_hors_fintech_en_intermediaire(client, java_found) -> None:
    naf = ",".join(naf_codes_for_sectors(["fintech"]))
    body = _post(client, {"technologiesObserved": ["Java"], "nafCode": naf}).json()

    assert {c["siren"] for c in body["skillIntermediaries"]} == {"552100558"}  # GIE AXA (62.02A) écartée
    assert body["query"]["skillSearch"]["outsideSector"] == 1  # …et COMPTÉE, jamais avalée


def test_sait_dire_non_sans_secteur_les_intermediaires_restent(client, java_found) -> None:
    body = _post(client, {"technologiesObserved": ["Java"]}).json()

    assert {c["siren"] for c in body["skillIntermediaries"]} == {"552100556", "552100558"}
    assert "outsideSector" not in body["query"]["skillSearch"]


def _offer(title: str, employer: str) -> dict[str, Any]:
    return {
        "employer": employer,
        "siren": None,
        "title": title,
        "description": "",
        "date": (date.today() - timedelta(days=3)).isoformat(),
        "city": "Paris",
        "department": "75",
        "source": "france_travail",
    }


def _reason(offer: dict[str, Any]) -> str | None:
    return _reject_reason(offer, "Java", frozenset(), date.today() - timedelta(days=60), None, True, has_profile=False)


def test_un_mot_de_la_raison_sociale_ne_vaut_pas_une_competence() -> None:
    assert _reason(_offer("Technicien de maintenance", "HARDWARE JAVA COMPUTER")) == "skillAbsent"


def test_sait_dire_non_une_offre_qui_cite_java_est_retenue() -> None:
    assert _reason(_offer("Développeur Java", "HARDWARE COMPUTER")) is None
