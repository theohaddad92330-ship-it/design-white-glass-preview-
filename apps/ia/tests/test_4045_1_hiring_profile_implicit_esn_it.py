"""#4045.1 — recette R7a (prod 429335a9c8) : « Technicien SAV - Frigoriste
Cuisiniste H/F » et « Responsable Pays F/H » sortaient encore en RECRUTEMENT
pour un profil ESN IT, malgré le tri par pack du vendeur (5003c4ffff).

Cause trouvée : la moisson par territoire (``list_hiring_companies`` /
``list_hiring_companies_apec``) reçoit le profil BRUT de l'appelant. Un vrai
profil d'espace qui ne déclare pas ``offerDomain`` (l'ESN IT implicite — rien
à cocher pour elle) est traité par ``profile_job_scope`` comme une ABSENCE de
profil (#3901, « sans profil ⇒ on ne filtre pas »), donc n'importe quel
intitulé passe. ``seller_pack`` (``discover.py``) résout déjà ce défaut pour
``it_job_signals`` via ``normalize_offer_domain`` ; cette moisson ne le
faisait pas. ``profile=None`` (aucun profil du tout) garde le comportement
d'avant, inchangé.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock

import httpx
import pytest

from app.services.data_sources.apec import list_hiring_companies_apec
from app.services.data_sources.france_travail import list_hiring_companies

CUISINISTE = "Technicien SAV - Frigoriste Cuisiniste H/F"
RESPONSABLE_PAYS = "Responsable Pays F/H"
DEV = "Développeur Java F/H"
DEVOPS = "Ingénieur DevOps F/H"
SOC = "Analyste SOC F/H"

#: Un profil RÉEL d'espace ESN IT — rien à déclarer, c'est le défaut du produit.
ESN_IT_PROFILE = {"companyName": "Vendeur ESN IT SA"}


def _iso(days_ago: int) -> str:
    return (datetime.now(UTC) - timedelta(days=days_ago)).strftime("%Y-%m-%dT%H:%M:%SZ")


def _ft_payload() -> dict:
    offers = [CUISINISTE, RESPONSABLE_PAYS, DEV, DEVOPS, SOC]
    return {
        "resultats": [
            {
                "id": str(i),
                "intitule": title,
                "entreprise": {"nom": "ACME"},
                "dateCreation": _iso(2),
            }
            for i, title in enumerate(offers)
        ]
    }


@pytest.mark.asyncio
async def test_france_travail_un_profil_esn_it_reel_ecarte_le_hors_metier(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("FRANCE_TRAVAIL_CLIENT_ID", "id")
    monkeypatch.setenv("FRANCE_TRAVAIL_CLIENT_SECRET", "sec")
    c = AsyncMock(spec=httpx.AsyncClient)
    ok = AsyncMock()
    ok.status_code = 200
    ok.json = lambda: {"access_token": "tok", **_ft_payload()}
    ok.content = b"{}"
    c.post = AsyncMock(return_value=ok)

    async def _get(_url, *, params=None, **_kw):
        return httpx.Response(200, json=_ft_payload(), request=httpx.Request("GET", "https://x"))

    c.get = AsyncMock(side_effect=_get)

    out = await list_hiring_companies(client=c, profile=ESN_IT_PROFILE)
    labels = {row["signal"]["label"] for row in out}
    assert f"Recrutement — {CUISINISTE}" not in labels
    assert f"Recrutement — {RESPONSABLE_PAYS}" not in labels
    assert f"Recrutement — {DEV}" in labels
    assert f"Recrutement — {DEVOPS}" in labels
    assert f"Recrutement — {SOC}" in labels


@pytest.mark.asyncio
async def test_france_travail_sans_profil_du_tout_rien_ne_change(monkeypatch: pytest.MonkeyPatch) -> None:
    """``profile=None`` (aucun profil) garde le comportement #3901 : rien n'est
    écarté sur le rôle — déjà gardé par ``test_list_hiring_companies_it_label.py``,
    vérifié ici pour le même intitulé que le cas corrigé."""
    monkeypatch.setenv("FRANCE_TRAVAIL_CLIENT_ID", "id")
    monkeypatch.setenv("FRANCE_TRAVAIL_CLIENT_SECRET", "sec")
    c = AsyncMock(spec=httpx.AsyncClient)
    ok = AsyncMock()
    ok.status_code = 200
    ok.json = lambda: {"access_token": "tok"}
    ok.content = b"{}"
    c.post = AsyncMock(return_value=ok)

    async def _get(_url, *, params=None, **_kw):
        return httpx.Response(200, json=_ft_payload(), request=httpx.Request("GET", "https://x"))

    c.get = AsyncMock(side_effect=_get)

    out = await list_hiring_companies(client=c)
    labels = {row["signal"]["label"] for row in out}
    assert f"Recrutement — {CUISINISTE}" in labels
    assert f"Recrutement — {RESPONSABLE_PAYS}" in labels


def _apec_payload() -> dict:
    offers = [CUISINISTE, RESPONSABLE_PAYS, DEV, DEVOPS, SOC]
    return {
        "resultats": [
            {
                "numeroOffre": str(i),
                "intitule": title,
                "nomCommercial": "ACME",
                "lieuTexte": "Lyon - 69",
                "texteOffre": "",
                "datePublication": _iso(2),
            }
            for i, title in enumerate(offers)
        ]
    }


@pytest.mark.asyncio
async def test_apec_un_profil_esn_it_reel_ecarte_le_hors_metier() -> None:
    c = AsyncMock(spec=httpx.AsyncClient)
    c.post = AsyncMock(
        return_value=httpx.Response(200, json=_apec_payload(), request=httpx.Request("POST", "https://x"))
    )
    out = await list_hiring_companies_apec(client=c, profile=ESN_IT_PROFILE)
    titles = {row["signal"]["label"] for row in out}
    assert not any(CUISINISTE in t for t in titles)
    assert not any(RESPONSABLE_PAYS in t for t in titles)
    assert any(DEV in t for t in titles)
    assert any(DEVOPS in t for t in titles)
    assert any(SOC in t for t in titles)


@pytest.mark.asyncio
async def test_apec_sans_profil_du_tout_rien_ne_change() -> None:
    c = AsyncMock(spec=httpx.AsyncClient)
    c.post = AsyncMock(
        return_value=httpx.Response(200, json=_apec_payload(), request=httpx.Request("POST", "https://x"))
    )
    out = await list_hiring_companies_apec(client=c)
    titles = {row["signal"]["label"] for row in out}
    assert any(CUISINISTE in t for t in titles)
    assert any(RESPONSABLE_PAYS in t for t in titles)
