"""#2616.1 — « comptes qui recrutent » élargi au-delà de France Travail.

`list_hiring_companies_apec` est le pendant BROADCAST (territoire, aucun nom
d'entreprise) de `it_job_signals_apec` (déjà testé, `test_job_sources_wttj_apec.py`) —
même webservice, mêmes helpers privés, mêmes garanties : zéro clé, `[]` sur toute
panne, jamais d'exception. Le contrat de sortie ROW est celui que
`discover_signals._group_rows` attend déjà (name/department/city/signal), avec
`sourceLabel` en plus : #2616.1 attribue chaque ligne à SA source réelle plutôt
qu'au libellé par défaut du bucket `hiring` (voir `test_discover_signals_router.py`).
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock

import httpx
import pytest

from app.services.data_sources.apec import list_hiring_companies_apec


def _resp(json_data: object, status: int = 200) -> httpx.Response:
    return httpx.Response(status, json=json_data, request=httpx.Request("POST", "https://x"))


def _post_client(resp: httpx.Response) -> AsyncMock:
    c = AsyncMock(spec=httpx.AsyncClient)
    c.post = AsyncMock(return_value=resp)
    return c


def _iso(days_ago: int) -> str:
    return (datetime.now(UTC) - timedelta(days=days_ago)).isoformat()


def _payload() -> dict:
    return {
        "resultats": [
            {
                "numeroOffre": "178968882W",
                "intitule": "Ingénieur DevOps F/H",
                "nomCommercial": "SNCF CONNECT & TECH",
                "lieuTexte": "Lille - 59",
                "texteOffre": "Kubernetes, Terraform, CI/CD sur le cloud AWS…",
                "datePublication": _iso(3),
            },
            {
                "numeroOffre": "178968884W",
                "intitule": "Responsable comptable F/H",  # NON-IT — filtrée
                "nomCommercial": "AUTRE ENTREPRISE",
                "lieuTexte": "Lyon - 69",
                "texteOffre": "Comptabilité générale, clôtures mensuelles.",
                "datePublication": _iso(1),
            },
            {
                "numeroOffre": "178968885W",
                "intitule": "Anonyme",
                "nomCommercial": "",  # employeur anonymisé — écarté, rien à prospecter
                "lieuTexte": "Paris - 75",
                "texteOffre": "Développeur backend Python.",
                "datePublication": _iso(2),
            },
        ]
    }


async def test_broadcast_search_has_no_company_scope() -> None:
    """`it_job_signals_apec` scope sur UN nom ; la version large ne scope rien —
    c'est justement ce qui permet de DÉCOUVRIR de nouveaux employeurs."""
    client = _post_client(_resp(_payload()))
    await list_hiring_companies_apec(client=client)
    body = client.post.call_args.kwargs.get("json") or client.post.call_args.args[1]
    assert "motsCles" in body and body["motsCles"]


async def test_returns_named_it_employers_only() -> None:
    # #3901 — l'écart « non-IT » dépend du PROFIL (domaine d'offre IT), plus d'un filtre fixe.
    out = await list_hiring_companies_apec(
        client=_post_client(_resp(_payload())), profile={"offerDomain": "esn_it"}
    )
    # L'offre comptable (non-IT) et l'offre anonymisée sont écartées.
    assert [row["name"] for row in out] == ["SNCF CONNECT & TECH"]


async def test_without_profile_no_role_filter_but_anonymous_still_dropped() -> None:
    # #3901 — sans profil, on ne filtre pas (on n'invente pas de périmètre) ; l'anonyme reste écarté.
    out = await list_hiring_companies_apec(client=_post_client(_resp(_payload())))
    assert "SNCF CONNECT & TECH" in [row["name"] for row in out]
    assert all(row["name"] for row in out)


async def test_row_shape_matches_the_discover_harvest_contract() -> None:
    """Même forme que `list_hiring_companies` (France Travail) — c'est ce que
    `discover_signals._group_rows` sait déjà lire — plus `sourceLabel`."""
    out = await list_hiring_companies_apec(client=_post_client(_resp(_payload())), profile={"offerDomain": "esn_it"})
    row = out[0]
    assert row["siren"] is None  # jamais inventé — résolu en aval
    assert row["department"] == "59"
    assert row["city"] == "Lille"
    assert row["sourceLabel"] == "APEC"
    assert row["signal"]["type"] == "hiring"
    assert row["signal"]["date"]
    assert row["signal"]["url"] == "https://www.apec.fr/candidat/recherche-emploi.html/emploi/detail-offre/178968882W"


async def test_filters_on_department_client_side() -> None:
    out = await list_hiring_companies_apec(department="75", client=_post_client(_resp(_payload())))
    assert out == []  # la seule offre IT valide est à Lille (59)


async def test_drops_offers_older_than_since_days(monkeypatch: pytest.MonkeyPatch) -> None:
    payload = {
        "resultats": [
            {
                "numeroOffre": "1",
                "intitule": "Développeur backend",
                "nomCommercial": "OLD CORP",
                "lieuTexte": "Paris - 75",
                "texteOffre": "Python, Django.",
                "datePublication": _iso(400),
            }
        ]
    }
    out = await list_hiring_companies_apec(since_days=90, client=_post_client(_resp(payload)))
    assert out == []


async def test_graceful_on_http_error() -> None:
    assert await list_hiring_companies_apec(client=_post_client(_resp({}, status=503))) == []


async def test_graceful_on_network_error() -> None:
    c = AsyncMock(spec=httpx.AsyncClient)
    c.post = AsyncMock(side_effect=httpx.ConnectError("boom"))
    assert await list_hiring_companies_apec(client=c) == []


async def test_never_raises_signal_source_unavailable() -> None:
    """Contrairement à France Travail (clé requise), APEC n'a rien à configurer :
    aucune panne ne doit remonter en exception typée — #2616.1 s'appuie sur ce
    contrat pour ne JAMAIS perdre les lignes déjà collectées par France Travail."""
    c = AsyncMock(spec=httpx.AsyncClient)
    c.post = AsyncMock(side_effect=RuntimeError("boom"))
    assert await list_hiring_companies_apec(client=c) == []
