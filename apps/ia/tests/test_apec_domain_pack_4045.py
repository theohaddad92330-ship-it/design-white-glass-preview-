"""#4045 / #3901 / #3866 — le tri des offres APEC suit le PACK du vendeur,
jumeau exact de ``france_travail.is_domain_offer`` (``test_recruitment_job_
scope.py``). Avant ce lot, ``it_job_signals_apec`` n'avait NI paramètre
``pack`` NI vocabulaire cyber (pentest/SOC/RSSI rejetés alors que France
Travail les garde déjà) — deux lexiques du même tri qui divergeaient."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock

import httpx

from app.services.data_sources.apec import _is_domain_offer, it_job_signals_apec

CUISINISTE = {"intitule": "Cuisiniste F/H"}
VENDEUR = {"intitule": "Vendeur conseil F/H"}
CARISTE = {"intitule": "Cariste F/H"}
DEV = {"intitule": "Développeur Java F/H"}
DEVOPS = {"intitule": "Ingénieur DevOps F/H"}
DATA = {"intitule": "Data Analyst F/H"}
PENTEST = {"intitule": "Pentester confirmé F/H"}
SOC = {"intitule": "Analyste SOC F/H"}
AUTOMATICIEN = {"intitule": "Automaticien F/H", "romeCode": "H1206"}
METHODES = {"intitule": "Ingénieur méthodes F/H"}
DEV_WEB = {"intitule": "Développeur web F/H"}


# ── Unitaire : ``_is_domain_offer`` ──────────────────────────────────────────


def test_esn_it_rejects_non_it_keeps_it() -> None:
    assert _is_domain_offer(CUISINISTE) is False
    assert _is_domain_offer(VENDEUR) is False
    assert _is_domain_offer(CARISTE) is False
    assert _is_domain_offer(DEV) is True
    assert _is_domain_offer(DEVOPS) is True
    assert _is_domain_offer(DATA) is True


def test_esn_it_keeps_cyber_offers_parity_with_france_travail() -> None:
    """#4045 — lexique parité France Travail : pentest/SOC/RSSI ne doivent plus
    être perdus côté APEC."""
    assert _is_domain_offer(PENTEST) is True
    assert _is_domain_offer(SOC) is True


def test_industrial_pack_keeps_its_own_offers_and_rejects_unplaced_dev() -> None:
    assert _is_domain_offer(AUTOMATICIEN, pack="industrial_engineering") is True
    assert _is_domain_offer(METHODES, pack="industrial_engineering") is True
    assert _is_domain_offer(DEV_WEB, pack="industrial_engineering") is False


def test_all_roles_still_short_circuits_like_france_travail() -> None:
    assert _is_domain_offer(CUISINISTE, all_roles=True) is True
    assert _is_domain_offer(DEV_WEB, pack="industrial_engineering", all_roles=True) is True


# ── Intégration : ``it_job_signals_apec`` ────────────────────────────────────


def _resp(json_data: object) -> httpx.Response:
    return httpx.Response(200, json=json_data, request=httpx.Request("POST", "https://x"))


def _post_client(resp: httpx.Response) -> AsyncMock:
    c = AsyncMock(spec=httpx.AsyncClient)
    c.post = AsyncMock(return_value=resp)
    return c


def _iso(days_ago: int) -> str:
    return (datetime.now(UTC) - timedelta(days=days_ago)).isoformat()


def _payload() -> dict:
    return {
        "resultats": [
            {"numeroOffre": "1", "intitule": "Automaticien F/H", "nomCommercial": "USINE SA", "datePublication": _iso(2)},
            {"numeroOffre": "2", "intitule": "Développeur web F/H", "nomCommercial": "USINE SA", "datePublication": _iso(1)},
        ]
    }


async def test_industrial_pack_wired_through_the_public_function() -> None:
    out = await it_job_signals_apec("USINE SA", pack="industrial_engineering", client=_post_client(_resp(_payload())))
    assert [o["title"] for o in out] == ["Automaticien F/H"]


async def test_default_pack_stays_it_only_at_the_public_function() -> None:
    # Sans pack (esn_it) : l'automaticien n'est pas IT, le dev web l'est.
    out = await it_job_signals_apec("USINE SA", client=_post_client(_resp(_payload())))
    assert [o["title"] for o in out] == ["Développeur web F/H"]
