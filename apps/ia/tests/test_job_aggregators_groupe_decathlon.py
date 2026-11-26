"""DECATHLON 11/10 — les offres de TOUTES les entités d'un groupe remontent.

Run 9c76e009 : Adzuna rendait 536 offres pour « DECATHLON », la page 1 seule était
lue et deux offres gardées ; TheirStack rendait 0 avec ``company_name_or`` seul.
Ce que ces tests tiennent :

- Adzuna est paginé, borné (``_ADZUNA_MAX_PAGES``) et s'arrête quand une page
  n'apporte plus d'offre du groupe ;
- TheirStack interroge le DOMAINE du compte quand il est connu, puis les noms du
  groupe — au plus deux appels ;
- de bout en bout, un grand groupe aux nombreuses entités garde chacune d'elles
  et écarte ses homonymes.
"""

from __future__ import annotations

from datetime import UTC, datetime, timedelta
from unittest.mock import AsyncMock

import httpx
import pytest

from app.services.data_sources import job_aggregators as agg
from app.services.data_sources.employer_match import EmployerScope

_KEYS = (
    "ADZUNA_APP_ID",
    "ADZUNA_APP_KEY",
    "JOOBLE_API_KEY",
    "THEIRSTACK_API_KEY",
    "MANTIKS_API_KEY",
    "FANTASTIC_JOBS_API_KEY",
)

# Calculé UNE fois : un test daté en dur expire.
_NOW = datetime.now(UTC)


def _iso(days_ago: int) -> str:
    return (_NOW - timedelta(days=days_ago)).strftime("%Y-%m-%dT%H:%M:%SZ")


def _resp(json_data: object, status: int = 200) -> httpx.Response:
    return httpx.Response(status, json=json_data, request=httpx.Request("GET", "https://x"))


@pytest.fixture(autouse=True)
def _no_keys(monkeypatch: pytest.MonkeyPatch) -> None:
    for k in _KEYS:
        monkeypatch.delenv(k, raising=False)


def _adzuna_hit(i: int, employer: str) -> dict:
    return {
        "title": f"Poste {i}",
        "company": {"display_name": employer},
        "location": {"display_name": f"Ville {i}"},
        "created": _iso(i % 30 + 1),
        "redirect_url": f"https://www.adzuna.fr/details/{i}",
    }


def _adzuna_page(employers: list[str], start: int, size: int = agg._ADZUNA_PER_PAGE) -> dict:
    hits = [_adzuna_hit(start + k, employers[k % len(employers)]) for k in range(size)]
    return {"count": 536, "results": hits}


async def test_adzuna_reads_further_pages_and_keeps_group_entities(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("ADZUNA_APP_ID", "id")
    monkeypatch.setenv("ADZUNA_APP_KEY", "key")
    noise = ["Intersport", "Go Sport", "Cabinet Recrutement X"] * 16 + ["Ville de Lille", "Leroy Merlin"]
    pages = [
        # Page 1 : 2 offres du groupe noyées dans 48 offres d'autres employeurs.
        {"count": 536, "results": [_adzuna_hit(1, "DECATHLON"), _adzuna_hit(2, "Decathlon Digital")]
         + [_adzuna_hit(100 + k, n) for k, n in enumerate(noise)]},
        _adzuna_page(["DECATHLON Logistics & Supply chain", "Intersport"], 200),
    ]
    client = AsyncMock(spec=httpx.AsyncClient)
    client.get = AsyncMock(side_effect=[_resp(p) for p in pages])
    offers = await agg.adzuna_jobs("DECATHLON", client=client)
    urls = [c.args[0] for c in client.get.call_args_list]
    assert urls[0].endswith("/search/1") and urls[1].endswith("/search/2")
    employers = {o["company"] for o in offers}
    assert {"DECATHLON", "Decathlon Digital", "DECATHLON Logistics & Supply chain"} <= employers
    assert "Intersport" not in employers
    assert len(offers) == agg._LIMIT


async def test_adzuna_stops_when_a_page_brings_no_group_offer(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("ADZUNA_APP_ID", "id")
    monkeypatch.setenv("ADZUNA_APP_KEY", "key")
    pages = [
        {"count": 536, "results": [_adzuna_hit(1, "DECATHLON")] + [_adzuna_hit(10 + k, "Intersport") for k in range(49)]},
        _adzuna_page(["Intersport"], 100),
        _adzuna_page(["DECATHLON"], 200),  # jamais lue
    ]
    client = AsyncMock(spec=httpx.AsyncClient)
    client.get = AsyncMock(side_effect=[_resp(p) for p in pages])
    offers = await agg.adzuna_jobs("DECATHLON", client=client)
    assert client.get.await_count == 2
    assert [o["company"] for o in offers] == ["DECATHLON"]


async def test_adzuna_pagination_is_bounded(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("ADZUNA_APP_ID", "id")
    monkeypatch.setenv("ADZUNA_APP_KEY", "key")
    # Une offre du groupe par page : jamais le plafond, jamais une page vide.
    page = {"count": 5000, "results": [_adzuna_hit(1, "DECATHLON")] + [_adzuna_hit(2 + k, "Intersport") for k in range(49)]}
    client = AsyncMock(spec=httpx.AsyncClient)
    client.get = AsyncMock(return_value=_resp(page))
    await agg.adzuna_jobs("DECATHLON", client=client)
    assert client.get.await_count == agg._ADZUNA_MAX_PAGES


def _ts_hit(i: int, employer: str, domain: str | None = None) -> dict:
    return {
        "job_title": f"Offre {i}",
        "company": employer,
        "company_domain": domain,
        "location": "Lille",
        "date_posted": _iso(i + 1),
        "url": f"https://theirstack.com/j/{i}",
        "final_url": f"https://careers.example/{i}",
    }


async def test_theirstack_queries_the_account_domain_first(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("THEIRSTACK_API_KEY", "k")
    client = AsyncMock(spec=httpx.AsyncClient)
    client.post = AsyncMock(
        return_value=_resp(
            {"data": [_ts_hit(1, "Decathlon Digital", "decathlon.com"), _ts_hit(2, "Kipsta", "decathlon.com"),
                      _ts_hit(3, "Autre SA", "autre.fr")]}
        )
    )
    offers = await agg.theirstack_jobs("DECATHLON", domain="https://www.decathlon.com/fr", client=client)
    assert client.post.await_count == 1
    body = client.post.call_args.kwargs["json"]
    assert body["company_domain_or"] == ["decathlon.com"]
    assert "company_name_or" not in body
    # Le site prouve l'entité (marque du groupe), un autre domaine jamais.
    assert {o["company"] for o in offers} == {"Decathlon Digital", "Kipsta"}


async def test_theirstack_falls_back_to_group_names_when_domain_returns_nothing(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("THEIRSTACK_API_KEY", "k")
    client = AsyncMock(spec=httpx.AsyncClient)
    client.post = AsyncMock(side_effect=[_resp({"data": []}), _resp({"data": [_ts_hit(1, "Decathlon")]})])
    # CACHE-SOURCES (15/10) : seules les entités à SIREN connu (`siren_names`) sont nommées ;
    # « Oxylane » et « Btwin » ne le sont que par leur nom (devinées) — jamais envoyées.
    scope = EmployerScope.build(
        "DECATHLON",
        known_names=["Oxylane", "Kipsta", "Quechua", "Btwin", "Domyos"],
        siren_names=["Kipsta", "Quechua", "Domyos", "Forclaz", "Newfeel"],
    )
    offers = await agg.theirstack_jobs("DECATHLON", scope=scope, domain="decathlon.com", client=client)
    assert client.post.await_count == 2
    names = client.post.call_args_list[1].kwargs["json"]["company_name_or"]
    assert names[:2] == ["DECATHLON", "Decathlon"]
    assert len(names) == agg._THEIRSTACK_MAX_NAMES
    assert "Oxylane" not in names and "Btwin" not in names
    assert [o["company"] for o in offers] == ["Decathlon"]


async def test_theirstack_without_domain_makes_one_name_query(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("THEIRSTACK_API_KEY", "k")
    client = AsyncMock(spec=httpx.AsyncClient)
    client.post = AsyncMock(return_value=_resp({"data": []}))
    assert await agg.theirstack_jobs("DECATHLON", client=client) == []
    # SIG-A (A2) — noms exacts, puis les mêmes sans la casse ; jamais de domaine deviné.
    assert client.post.await_count == 2
    bodies = [c.kwargs["json"] for c in client.post.call_args_list]
    assert all("company_domain_or" not in b for b in bodies)
    assert "company_name_or" in bodies[0] and "company_name_case_insensitive_or" in bodies[1]


async def test_large_group_end_to_end_keeps_every_entity_and_rejects_homonyms(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Point 9 du brief : ≥ 6 libellés d'employeur du même groupe + 2 homonymes."""
    monkeypatch.setenv("ADZUNA_APP_ID", "id")
    monkeypatch.setenv("ADZUNA_APP_KEY", "key")
    group_labels = [
        "DECATHLON",
        "Decathlon SE",
        "Decathlon Digital",
        "DECATHLON Logistics & Supply chain",
        "Decathlon Retail",
        "Groupe Decathlon International",
        "Kipsta",  # marque connue du groupe (registre)
    ]
    homonyms = ["Decathlon Plomberie SARL", "Mairie de Decathlon"]
    hits = [_adzuna_hit(i, label) for i, label in enumerate(group_labels + homonyms)]
    client = AsyncMock(spec=httpx.AsyncClient)
    client.get = AsyncMock(return_value=_resp({"count": len(hits), "results": hits}))
    client.post = AsyncMock(return_value=_resp({}))
    scope = EmployerScope.build("DECATHLON", siren="306138900", known_names=["Kipsta"])
    offers = await agg.it_job_signals_aggregators("DECATHLON", scope=scope, domain="decathlon.com", client=client)
    assert {o["company"] for o in offers} == set(group_labels)
    assert not {o["company"] for o in offers} & set(homonyms)


async def test_france_travail_attaches_group_entities_and_still_drops_homonyms(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Point 4 : ``dropped_unattributed=31`` — les offres d'entités du groupe."""
    from app.services.data_sources.france_travail import it_job_signals

    monkeypatch.setenv("FRANCE_TRAVAIL_CLIENT_ID", "id")
    monkeypatch.setenv("FRANCE_TRAVAIL_CLIENT_SECRET", "sec")
    recent = _iso(5)

    def offer(i: str, nom: str, siret: str | None = None) -> dict:
        ent = {"nom": nom, **({"siret": siret} if siret else {})}
        return {"id": i, "intitule": "Développeur Java", "entreprise": ent, "romeCode": "M1805", "dateCreation": recent}

    strict = [
        offer("A", "DECATHLON", "30613890000012"),
        offer("B", "DECATHLON DIGITAL", "11122233300011"),
        offer("C", "DECATHLON FRANCE", "50056940500123"),  # filiale connue au registre
        offer("D", "DECATHLON LOGISTIQUE"),
        offer("E", "DECATHLON PLOMBERIE SARL"),  # homonyme
        offer("F", "DECATHLON", "99988877700011"),  # même nom, autre SIREN inconnu : homonyme
    ]
    c = AsyncMock(spec=httpx.AsyncClient)
    c.post = AsyncMock(return_value=_resp({"access_token": "tok"}))

    async def _get(url, *_args, **kwargs):
        params = kwargs.get("params") or {}
        return _resp({"resultats": strict if params.get("domaine") == "M18" else []})

    c.get = AsyncMock(side_effect=_get)
    scope = EmployerScope.build("DECATHLON", siren="306138900", known_sirens=["500569405"])
    out = await it_job_signals("DECATHLON", siren="306138900", scope=scope, client=c)
    assert sorted(o["company"] for o in out) == sorted(
        ["DECATHLON", "DECATHLON DIGITAL", "DECATHLON FRANCE", "DECATHLON LOGISTIQUE"]
    )
