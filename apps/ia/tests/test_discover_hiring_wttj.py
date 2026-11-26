"""#2616.1 — « comptes qui recrutent » élargi à WTTJ, en plus d'APEC.

`list_hiring_companies_wttj` est le pendant BROADCAST (territoire/mots-clés,
aucun nom d'entreprise) de `it_job_signals_wttj` (déjà testé,
`test_job_sources_wttj_apec.py`) — même webservice Algolia, même NO-OP STRICT
sans identifiants opérateur, même contrat de sortie ROW que
`apec.py::list_hiring_companies_apec` (`test_discover_hiring_apec.py`), avec
`sourceLabel="Welcome to the Jungle"`.

Mesure en production le 22/09/2026 (registre #2616.1) : 58 liens « Voir la
source » sur /discover, 38 apec.fr + 20 candidat.francetravail.fr, ZÉRO WTTJ —
la fonction n'existait pas et n'était donc jamais appelée depuis
`discover_signals.py`. Ce fichier couvre la fonction manquante ; son branchement
est couvert par `test_discover_signals_router.py`.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock

import httpx
import pytest

from app.services.data_sources.wttj import list_hiring_companies_wttj


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
        "hits": [
            {
                "name": "Ingénieur DevOps",
                "slug": "ingenieur-devops",
                "published_at": _iso(3),
                "contract_type": {"fr": "CDI"},
                "organization": {"name": "Doctolib", "slug": "doctolib"},
                "offices": [{"city": "Paris", "country": "France"}],
            },
            {
                # NON-IT — écartée (l'index WTTJ couvre tous les métiers).
                "name": "Comptable F/H",
                "slug": "comptable",
                "published_at": _iso(1),
                "organization": {"name": "Autre Entreprise", "slug": "autre"},
            },
            {
                # Sans organisation nommée — rien à prospecter, écartée.
                "name": "Développeur Python",
                "slug": "dev-python",
                "published_at": _iso(2),
            },
        ]
    }


async def test_noop_without_creds(monkeypatch: pytest.MonkeyPatch) -> None:
    for k in ("WTTJ_ALGOLIA_APP_ID", "WTTJ_ALGOLIA_API_KEY"):
        monkeypatch.delenv(k, raising=False)
    client = _post_client(_resp(_payload()))
    assert await list_hiring_companies_wttj(client=client) == []
    client.post.assert_not_called()  # no-op DOCUMENTÉ : pas d'API publique gratuite


async def test_broadcast_search_has_no_company_scope(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("WTTJ_ALGOLIA_APP_ID", "OPID")
    monkeypatch.setenv("WTTJ_ALGOLIA_API_KEY", "opkey")
    client = _post_client(_resp(_payload()))
    await list_hiring_companies_wttj(keywords=["devops"], client=client)
    body = client.post.call_args.kwargs.get("json") or client.post.call_args.args[1]
    assert body["query"] == "devops"


async def test_returns_named_it_employers_only(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("WTTJ_ALGOLIA_APP_ID", "OPID")
    monkeypatch.setenv("WTTJ_ALGOLIA_API_KEY", "opkey")
    out = await list_hiring_companies_wttj(client=_post_client(_resp(_payload())), profile={"offerDomain": "esn_it"})
    # L'offre comptable (non-IT) et l'offre sans organisation sont écartées.
    assert [row["name"] for row in out] == ["Doctolib"]


async def test_row_shape_matches_the_discover_harvest_contract(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("WTTJ_ALGOLIA_APP_ID", "OPID")
    monkeypatch.setenv("WTTJ_ALGOLIA_API_KEY", "opkey")
    out = await list_hiring_companies_wttj(department="75", client=_post_client(_resp(_payload())), profile={"offerDomain": "esn_it"})
    row = out[0]
    assert row["siren"] is None  # jamais inventé — résolu en aval
    # Aucun champ département vérifié côté WTTJ (voir docstring) : la ligne
    # porte le département DEMANDÉ, jamais un département déduit.
    assert row["department"] == "75"
    assert row["city"] == "Paris"
    assert row["sourceLabel"] == "Welcome to the Jungle"
    assert row["signal"]["type"] == "hiring"
    assert row["signal"]["date"]
    assert row["signal"]["url"] == "https://www.welcometothejungle.com/fr/companies/doctolib/jobs/ingenieur-devops"
    # #2616.1 — le CDI distinguable : le hit WTTJ porte déjà `contract_type`
    # (voir `_payload()`), jamais lu jusqu'ici sur le chemin BROADCAST — seule
    # la corroboration par candidat (`it_job_signals_wttj`) le lisait.
    assert row["contractCode"] == "CDI"
    assert row["signal"]["detail"] == "CDI"


async def test_drops_offers_older_than_since_days(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("WTTJ_ALGOLIA_APP_ID", "OPID")
    monkeypatch.setenv("WTTJ_ALGOLIA_API_KEY", "opkey")
    payload = {
        "hits": [
            {
                "name": "Développeur backend",
                "slug": "dev-backend",
                "published_at": _iso(400),
                "organization": {"name": "Old Corp", "slug": "old-corp"},
            }
        ]
    }
    out = await list_hiring_companies_wttj(since_days=90, client=_post_client(_resp(payload)))
    assert out == []


async def test_graceful_on_http_error(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("WTTJ_ALGOLIA_APP_ID", "OPID")
    monkeypatch.setenv("WTTJ_ALGOLIA_API_KEY", "opkey")
    assert await list_hiring_companies_wttj(client=_post_client(_resp({}, status=503))) == []


async def test_graceful_on_network_error(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("WTTJ_ALGOLIA_APP_ID", "OPID")
    monkeypatch.setenv("WTTJ_ALGOLIA_API_KEY", "opkey")
    c = AsyncMock(spec=httpx.AsyncClient)
    c.post = AsyncMock(side_effect=httpx.ConnectError("boom"))
    assert await list_hiring_companies_wttj(client=c) == []


async def test_never_raises(monkeypatch: pytest.MonkeyPatch) -> None:
    """Même contrat qu'APEC : aucune panne ne remonte en exception typée —
    #2616.1 s'appuie sur ce contrat pour ne jamais perdre les lignes déjà
    collectées par les autres sources du bucket ``hiring``."""
    monkeypatch.setenv("WTTJ_ALGOLIA_APP_ID", "OPID")
    monkeypatch.setenv("WTTJ_ALGOLIA_API_KEY", "opkey")
    c = AsyncMock(spec=httpx.AsyncClient)
    c.post = AsyncMock(side_effect=RuntimeError("boom"))
    assert await list_hiring_companies_wttj(client=c) == []
