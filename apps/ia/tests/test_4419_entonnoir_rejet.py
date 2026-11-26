"""#4419 — le REJET est observable : entrés / retenus / écartés par critère (``query.funnel``).

Sans ce compteur, « le filtre ne tourne pas » et « le filtre tourne et rejette presque tout » donnent le même écran.
Règles : un critère qui n'a pas tourné est ABSENT (jamais « 0 ») ; un amont muet sur ce qu'il a vu n'invente pas
« entrés » ; aucun fournisseur nommé."""

from __future__ import annotations

from typing import Any
from unittest.mock import AsyncMock, patch

import pytest

from app.services.discover_funnel import build_funnel
from app.services.discover_skill_offers import SkillAccounts, offer_in_city


def test_un_critere_non_tourne_est_absent_pas_zero() -> None:
    funnel = build_funnel(entered=128, kept=3, rejected={"city": 94, "trade": 31, "sector": None, "headcount": 0})
    assert funnel == {"entered": 128, "kept": 3, "rejected": {"city": 94, "trade": 31}}


def test_un_amont_muet_n_invente_pas_les_entres() -> None:
    funnel = build_funnel(entered=None, kept=3, rejected={"city": 4})
    assert funnel is not None and "entered" not in funnel and funnel["rejected"] == {"city": 4}


def test_rien_a_dire_rien_rendu() -> None:
    assert build_funnel(entered=None, kept=3, rejected={}) is None


def test_un_critere_inconnu_ne_passe_pas() -> None:
    assert build_funnel(entered=5, kept=1, rejected={"brave": 4, "city": 4})["rejected"] == {"city": 4}  # type: ignore[index]


def _account(siren: str, city: str) -> dict[str, Any]:
    return {
        "siren": siren,
        "name": f"ACME {siren}",
        "nafCode": "62.01Z",
        "sector": "Programmation informatique",
        "city": city,
        "department": "59",
        "headcountRange": "250 à 499 salariés",
        "skillEvidence": {
            "skill": "Vue",
            "offerCount": 1,
            "latestOffer": {"title": "Dev Vue", "city": city, "date": "2026-10-15"},
        },
    }


@pytest.fixture
def engine(monkeypatch):
    state: dict[str, Any] = {"accounts": [], "info": {}, "cities": []}

    async def fake(skills, zone, profile, *, deadline, city=None, **_circle):
        state["cities"].append(city)
        info = {"skills": list(skills), "emptyCause": None, **state["info"]}
        return SkillAccounts(accounts=state["accounts"], intermediaries=[], info=info)

    monkeypatch.setattr("app.routers.discover.find_skill_accounts", fake)
    return state


def _post(client, filters: dict[str, Any]):
    with patch("app.routers.discover.call_claude", new_callable=AsyncMock, return_value=({"angles": []}, None)):
        res = client.post(
            "/discover/registry",
            json={"filters": filters, "profile_data": {}, "limit": 10, "strictCriteria": True},
        )
    return res.json()


def test_la_ville_est_passee_au_moteur_et_l_ecart_est_compte(client, engine) -> None:
    # ?city=Lille : le critère PART au moteur (``city=``) et ce qu'il écarte ressort dans l'entonnoir.
    engine["accounts"] = [_account("552100001", "LILLE"), _account("552100002", "LILLE")]
    engine["info"] = {"employersFound": 2, "outsideCityEmployers": 94, "outsideZone": 1}

    body = _post(client, {"city": "Lille", "technologiesObserved": ["vue"], "keywords": ["vue"]})

    assert engine["cities"] == ["Lille"]
    assert body["query"]["funnel"] == {"entered": 97, "kept": 2, "rejected": {"city": 94, "zone": 1}}


def test_un_critere_qui_n_a_pas_tourne_n_est_pas_zero(client, engine) -> None:
    engine["accounts"] = [_account("552100001", "LILLE")]
    engine["info"] = {"employersFound": 1}

    body = _post(client, {"technologiesObserved": ["vue"], "keywords": ["vue"]})

    assert "city" not in body["query"]["funnel"].get("rejected", {})
    assert body["query"]["funnel"]["kept"] == 1


def test_offre_hors_ville_ecartee() -> None:
    assert offer_in_city("59 - LILLE", "Lille")
    assert offer_in_city("Lille 3e", "Lille")
    assert not offer_in_city("60 - Tille", "Lille")
    assert not offer_in_city("Villeneuve-d'Ascq", "Lille")
