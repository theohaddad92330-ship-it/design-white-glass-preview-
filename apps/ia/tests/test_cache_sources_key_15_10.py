"""CACHE-SOURCES (15/10, décision Louis) — points 2, 3 et 4.

TheirStack a facturé 4 555 crédits le 13/10 (437 requêtes, ~10 crédits chacune) : la clé
de cache portait les termes métier, le plafond d'offres et le fingerprint du groupe, donc
deux espaces — ou l'analyse et Découvrir — repayaient la MÊME entreprise.

Ce que ces tests tiennent (chacun sait dire NON) :
- point 2 — la clé est l'ENTREPRISE seule (SIREN > domaine > nom normalisé) ; le tri métier
  s'applique à la LECTURE ; une variante de fait partagé par SOURCE pour les agrégateurs ;
- point 3 — les sources payées à l'offre lisent UNE page de 25, sans filtre métier envoyé,
  et ne nomment que le compte et les entités du groupe dont le SIREN est CONNU ;
- point 4 — une ligne INFO par requête : cache servi ou appel réellement émis.
"""

from __future__ import annotations

import logging
from datetime import UTC, datetime, timedelta
from types import SimpleNamespace
from unittest.mock import AsyncMock, patch

import httpx
import pytest

from app.services import provider_cache, public_facts
from app.services.data_sources import job_aggregators as agg
from app.services.data_sources.employer_match import EmployerScope

_SIREN = "552049447"
_KEYS = (
    "ADZUNA_APP_ID", "ADZUNA_APP_KEY", "JOOBLE_API_KEY", "THEIRSTACK_API_KEY", "MANTIKS_API_KEY", "FANTASTIC_JOBS_API_KEY",
)


@pytest.fixture(autouse=True)
def _no_keys(monkeypatch: pytest.MonkeyPatch) -> None:
    for k in _KEYS:
        monkeypatch.delenv(k, raising=False)


class FakeRedis:
    def __init__(self) -> None:
        self.store: dict[str, str] = {}

    async def get(self, key: str):
        return self.store.get(key)

    async def set(self, key: str, value: str, ex: int | None = None):
        self.store[key] = value


@pytest.fixture
def cache():
    fake = FakeRedis()
    with patch.object(provider_cache, "_redis", AsyncMock(return_value=fake)):
        yield fake


def _iso(days_ago: int) -> str:
    return (datetime.now(UTC) - timedelta(days=days_ago)).strftime("%Y-%m-%d")


def _hit(title: str, company: str = "Decathlon") -> dict:
    return {"job_title": title, "company": company, "date_posted": _iso(3), "url": f"https://t/{title}"}


def _client(*pages: dict) -> AsyncMock:
    c = AsyncMock(spec=httpx.AsyncClient)
    c.post = AsyncMock(
        side_effect=[httpx.Response(200, json=p, request=httpx.Request("POST", "https://x")) for p in pages]
    )
    c.get = AsyncMock()
    return c


def _page(titles: list[str], total: int | None = None, company: str = "Decathlon") -> dict:
    return {"data": [_hit(t, company) for t in titles], "metadata": {"total_results": total}}


# ── Point 2 — la clé est l'entreprise seule ─────────────────────────────────


def test_cache_key_is_the_company_alone() -> None:
    thin = EmployerScope.build("Decathlon", siren=_SIREN)
    rich = EmployerScope.build("Decathlon", siren=_SIREN, known_names=("DECATHLON FRANCE",), known_sirens=("111111111",))
    base = agg._cache_key("Decathlon", scope=thin)
    assert base
    # Ni ce qu'on sait du groupe, ni le domaine, ni la graphie ne changent la clé quand le SIREN est connu.
    assert agg._cache_key("DECATHLON ", scope=rich, domain="decathlon.fr") == base
    # Un autre SIREN ⇒ une autre entreprise (le test sait dire NON).
    assert agg._cache_key("Decathlon", scope=EmployerScope.build("Decathlon", siren="111111111")) != base


def test_cache_key_prefers_siren_then_domain_then_normalised_name() -> None:
    with_siren = agg._cache_key("Decathlon", scope=EmployerScope.build("Decathlon", siren=_SIREN), domain="decathlon.fr")
    by_domain = agg._cache_key("Decathlon", domain="https://www.Decathlon.fr/jobs")
    by_name = agg._cache_key("  Décathlon  ")
    assert len({with_siren, by_domain, by_name}) == 3
    assert by_domain == agg._cache_key("Autre graphie", domain="decathlon.fr")
    assert by_name == agg._cache_key("decathlon")  # accents et casse repliés
    assert agg._cache_key("") == ""


def test_the_key_ignores_trade_terms_pack_all_roles_and_page_cap() -> None:
    assert agg._cache_key("Decathlon", domain="decathlon.fr", title_terms=("sap",), pack="x", all_roles=True, max_offers=10) == (
        agg._cache_key("Decathlon", domain="decathlon.fr")
    )
    assert not hasattr(agg, "_theirstack_cache_key")  # une seule fabrique de clé pour toutes les sources


async def test_two_trades_for_the_same_company_make_a_single_network_call(
    monkeypatch: pytest.MonkeyPatch, cache: FakeRedis
) -> None:
    monkeypatch.setenv("THEIRSTACK_API_KEY", "tk")
    client = _client(_page(["Développeur Java", "Caissier polyvalent"], total=2), _page(["NE DOIT PAS ÊTRE LU"]))
    scope = EmployerScope.build("Decathlon", siren=_SIREN)
    it = await agg.it_job_signals_aggregators(
        "Decathlon", scope=scope, keep_title=lambda t: "Développeur" in t, client=client
    )
    shop = await agg.it_job_signals_aggregators(
        "Decathlon", scope=scope, keep_title=lambda t: "Caissier" in t, client=client
    )
    assert client.post.call_count == 1
    assert [o["title"] for o in it] == ["Développeur Java"]
    assert [o["title"] for o in shop] == ["Caissier polyvalent"]  # le tri métier est fait chez nous, à la lecture


async def test_analysis_then_discover_on_the_same_siren_make_a_single_call(
    monkeypatch: pytest.MonkeyPatch, cache: FakeRedis
) -> None:
    monkeypatch.setenv("THEIRSTACK_API_KEY", "tk")
    client = _client(_page(["Développeur Java"], total=1), _page(["NE DOIT PAS ÊTRE LU"]))
    full = EmployerScope.build("Decathlon", siren=_SIREN, known_names=("DECATHLON FRANCE",))
    await agg.theirstack_jobs("Decathlon", scope=full, domain="decathlon.fr", client=client)
    out = await agg.theirstack_jobs("Decathlon", scope=EmployerScope.build("Decathlon", siren=_SIREN), client=client)
    assert client.post.call_count == 1
    assert [o["title"] for o in out] == ["Développeur Java"]


def test_aggregator_fact_variant_is_the_source_alone_but_free_sources_keep_their_question() -> None:
    for source in ("adzuna", "jooble", "theirstack", "fantastic", "mantiks"):
        assert public_facts.jobs_fact_variant(source, "industrie", True) == public_facts.jobs_fact_variant(
            source, None, False
        )
        assert ":" not in public_facts.jobs_fact_variant(source, "industrie", True)
    # France Travail / APEC / ATS / carrières trient DANS leur requête : leur question change avec le pack.
    assert public_facts.jobs_fact_variant("france_travail", "industrie", True) != public_facts.jobs_fact_variant(
        "france_travail", None, False
    )
    assert public_facts.jobs_fact_variant("apec", "industrie", False) == "apec:industrie:it"


# ── Point 3 — coût sous contrôle ────────────────────────────────────────────


async def test_theirstack_reads_one_page_of_25_and_sends_no_trade_filter(
    monkeypatch: pytest.MonkeyPatch, cache: FakeRedis
) -> None:
    monkeypatch.setenv("THEIRSTACK_API_KEY", "tk")
    full = _page([f"Développeur {i}" for i in range(25)], total=900)
    client = _client(full, full, full)
    out = await agg.theirstack_jobs("Decathlon", client=client)
    assert client.post.call_count == 1  # plus de pagination 3 pages
    body = client.post.call_args.kwargs["json"]
    assert body["limit"] == 25 and body["page"] == 0
    assert "job_title_pattern_or" not in body
    assert len(out) == 25


def test_the_title_pattern_filter_is_gone() -> None:
    assert not hasattr(agg, "theirstack_title_patterns")


def _registry(**subs: str | None) -> SimpleNamespace:
    return SimpleNamespace(
        legal_name="JCDECAUX SE",
        commercial_name="JCDecaux",
        siren=_SIREN,
        subsidiaries=[SimpleNamespace(name=n, siren=s) for n, s in subs.items()],
    )


async def test_theirstack_names_only_the_account_and_entities_with_a_known_siren(
    monkeypatch: pytest.MonkeyPatch, cache: FakeRedis
) -> None:
    monkeypatch.setenv("THEIRSTACK_API_KEY", "tk")
    scope = EmployerScope.from_registry(
        "JCDecaux",
        siren=_SIREN,
        profile=_registry(**{"JCDECAUX FRANCE": "111111111", "BH-PLUS IMMOBILIER": None, "GIE COMMERCAN CTRE COMME REG BELLE EPINE": ""}),
    )
    client = _client(_page(["Développeur Java"], company="JCDecaux", total=1))
    await agg.theirstack_jobs("JCDecaux", scope=scope, client=client)
    names = client.post.call_args.kwargs["json"]["company_name_or"]
    assert "JCDecaux" in names and "JCDECAUX FRANCE" in names
    assert not any("IMMOBILIER" in n or "COMMERCAN" in n for n in names)


async def test_theirstack_asks_the_domain_first_when_it_is_known(monkeypatch: pytest.MonkeyPatch, cache: FakeRedis) -> None:
    monkeypatch.setenv("THEIRSTACK_API_KEY", "tk")
    client = _client(_page(["Développeur Java"], total=1))
    await agg.theirstack_jobs("Decathlon", domain="https://www.decathlon.fr", client=client)
    assert client.post.call_args_list[0].kwargs["json"]["company_domain_or"] == ["decathlon.fr"]


async def test_fantastic_reads_a_single_page_of_25(monkeypatch: pytest.MonkeyPatch, cache: FakeRedis) -> None:
    monkeypatch.setenv("FANTASTIC_JOBS_API_KEY", "fk")
    rows = [
        {"title": f"Développeur {i}", "organization": "Decathlon", "date_posted": _iso(2), "url": f"https://f/{i}"}
        for i in range(25)
    ]
    client = AsyncMock(spec=httpx.AsyncClient)
    client.get = AsyncMock(side_effect=[httpx.Response(200, json=rows, request=httpx.Request("GET", "https://x"))] * 3)
    out = await agg.fantastic_jobs("Decathlon", client=client)
    assert client.get.call_count == 1
    assert client.get.call_args.kwargs["params"]["limit"] == 25
    assert "offset" not in client.get.call_args.kwargs["params"]
    assert len(out) == 25


# ── Point 4 — une ligne par requête ─────────────────────────────────────────


async def test_one_info_line_per_request_hit_or_paid_call(
    monkeypatch: pytest.MonkeyPatch, cache: FakeRedis, caplog: pytest.LogCaptureFixture
) -> None:
    monkeypatch.setenv("THEIRSTACK_API_KEY", "tk")
    client = _client(_page(["Développeur Java"], total=1))
    with caplog.at_level(logging.INFO, logger="app.services.provider_cache"):
        await agg.theirstack_jobs("Decathlon", scope=EmployerScope.build("Decathlon", siren=_SIREN), client=client)
        await agg.theirstack_jobs("Decathlon", scope=EmployerScope.build("Decathlon", siren=_SIREN), client=client)
    lines = [r.getMessage() for r in caplog.records if "jobs_source_cache" in r.getMessage()]
    assert len(lines) == 2
    assert "source=theirstack" in lines[0] and "outcome=live_call_paid_source" in lines[0]
    assert "source=theirstack" in lines[1] and "outcome=hit" in lines[1]
    # Jamais de valeur sensible : ni la clé API, ni le SIREN, ni le nom de l'entreprise.
    assert not any("tk" in line.split("source=")[0] or _SIREN in line or "Decathlon" in line for line in lines)


async def test_no_line_for_namespaces_that_are_not_offer_sources(
    cache: FakeRedis, caplog: pytest.LogCaptureFixture
) -> None:
    with caplog.at_level(logging.INFO, logger="app.services.provider_cache"):
        await provider_cache.cached_json("registry:x", "k", AsyncMock(return_value=[{"a": 1}]))
    assert not [r for r in caplog.records if "jobs_source_cache" in r.getMessage()]
