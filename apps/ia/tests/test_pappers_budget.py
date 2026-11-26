"""Consommation de l'API Pappers : cache des recherches, ordre gratuit→payant,
compteur d'appels.

Pappers est facturé à l'appel et son quota s'est épuisé en production. Ces tests
verrouillent les trois leviers :

1. une recherche par nom identique ne repart pas sur le réseau (hit/miss) ;
2. deux recherches DIFFÉRENTES ne partagent jamais une entrée de cache — servir
   la réponse d'une autre requête serait de la donnée fictive (règle CLAUDE.md) ;
3. la source gratuite est préférée quand elle répond à la question posée, et
   chaque appel payant est compté pour qu'une dérive soit visible.
"""

from __future__ import annotations

import json
from typing import Any

import httpx
import pytest

from app.services import provider_cache
from app.services.company_filters import CompanyDiscoveryFilters
from app.services.pappers import budget
from app.services.company_filters import DegradeReason
from app.services.pappers.models import (
    CompanySearchParams,
    PappersAmbiguousMatchError,
    PappersNoResultError,
    PappersUnavailableError,
)
from app.services.pappers.search import (
    search_cache_key,
    search_company,
    search_company_suggestions,
)

# ── Faux cache mémoire (le vrai est best-effort : sans Redis il passe outre) ──


class FakeCache:
    """Remplace les deux tiers de ``provider_cache`` par un dict en mémoire.

    Sans ce double, ``provider_cache`` dégrade en passthrough (ni Redis ni
    Postgres en test) et un test de cache ne testerait rien.
    """

    def __init__(self) -> None:
        self.store: dict[tuple[str, str], Any] = {}
        self.hits = 0
        self.misses = 0

    async def get_json(self, namespace: str, key: str) -> Any | None:
        if not key:
            return None
        if (namespace, key) in self.store:
            self.hits += 1
            return self.store[(namespace, key)]
        self.misses += 1
        return None

    async def set_json(self, namespace: str, key: str, value: Any, ttl: int | None = None) -> None:
        if not key or value is None:
            return
        self.store[(namespace, key)] = value
        self.ttls[(namespace, key)] = ttl

    ttls: dict[tuple[str, str], int | None] = {}


@pytest.fixture
def cache(monkeypatch: pytest.MonkeyPatch) -> FakeCache:
    fake = FakeCache()
    fake.ttls = {}

    monkeypatch.setattr(provider_cache, "get_json", fake.get_json)
    monkeypatch.setattr(provider_cache, "set_json", fake.set_json)
    # ``cached_json`` capture get_json/set_json au moment de l'appel : il suffit
    # de patcher le module. On le re-déclare pour être explicite.
    return fake


@pytest.fixture(autouse=True)
def _reset_budget() -> None:
    budget.reset()


@pytest.fixture(autouse=True)
def _api_key(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("PAPPERS_API_KEY", "test-key")


def _hit(name: str = "ACME SAS", siren: str = "123456789") -> dict:
    return {
        "nom_entreprise": name,
        "siren": siren,
        "siege": {"ville": "Paris", "code_postal": "75001"},
    }


class CountingTransport(httpx.AsyncBaseTransport):
    """Transport httpx qui compte les requêtes réellement parties."""

    def __init__(self, payload: dict, status: int = 200) -> None:
        self.payload = payload
        self.status = status
        self.requests: list[httpx.URL] = []

    async def handle_async_request(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request.url)
        return httpx.Response(self.status, json=self.payload, request=request)

    @property
    def calls(self) -> int:
        return len(self.requests)


def _client(transport: CountingTransport) -> httpx.AsyncClient:
    return httpx.AsyncClient(transport=transport, timeout=5.0)


# ── 1. Clé de cache : les filtres DOIVENT la distinguer ──────────────────────


def test_cache_key_distinguishes_query_terms() -> None:
    a = search_cache_key(CompanySearchParams(q="Enedis"))
    b = search_cache_key(CompanySearchParams(q="Dalkia"))
    assert a != b


def test_cache_key_distinguishes_naf_code() -> None:
    """Deux recherches du même nom filtrées sur un NAF différent posent deux
    questions différentes : partager une entrée servirait la mauvaise réponse."""
    base = CompanySearchParams(q="Atos")
    a = search_cache_key(base.model_copy(update={"naf_code": "62.02A"}))
    b = search_cache_key(base.model_copy(update={"naf_code": "70.10Z"}))
    assert a != b
    assert search_cache_key(base) not in (a, b)


def test_cache_key_distinguishes_precision() -> None:
    """``precision`` change le jeu de résultats de Pappers — donc la clé."""
    a = search_cache_key(CompanySearchParams(q="Alan", precision="exacte"))
    b = search_cache_key(CompanySearchParams(q="Alan", precision="approximative"))
    assert a != b


def test_cache_key_distinguishes_pagination_and_geo() -> None:
    q = CompanySearchParams(q="Capgemini")
    variants = {
        search_cache_key(q),
        search_cache_key(q.model_copy(update={"per_page": 5})),
        search_cache_key(q.model_copy(update={"per_page": 20})),
        search_cache_key(q.model_copy(update={"department": "69"})),
        search_cache_key(q.model_copy(update={"headcount_tranche_min": "51"})),
        search_cache_key(q.model_copy(update={"has_ceased": True})),
    }
    assert len(variants) == 6


def test_cache_key_is_stable_and_carries_no_api_token() -> None:
    params = CompanySearchParams(q="Enedis", naf_code="35.13Z")
    assert search_cache_key(params) == search_cache_key(params.model_copy(deep=True))
    assert "api_token" not in search_cache_key(params)
    # La clé reste lisible en log/debug (JSON trié), pas un hash opaque.
    assert json.loads(search_cache_key(params))["q"] == "Enedis"


# ── 2. search_company : hit / miss ───────────────────────────────────────────


@pytest.mark.asyncio
async def test_search_company_second_call_is_a_cache_hit(cache: FakeCache) -> None:
    transport = CountingTransport({"resultats": [_hit("ENEDIS", "444608442")]})
    async with _client(transport) as http:
        first = await search_company("ENEDIS", http_client=http)
        second = await search_company("ENEDIS", http_client=http)

    assert transport.calls == 1, "la 2e recherche du même nom doit venir du cache"
    assert first.siren == second.siren == "444608442"
    assert cache.hits == 1


@pytest.mark.asyncio
async def test_search_company_different_names_both_hit_the_network(cache: FakeCache) -> None:
    """Le cache ne doit JAMAIS servir la réponse d'une autre requête."""
    transport = CountingTransport({"resultats": [_hit("ENEDIS", "444608442")]})
    async with _client(transport) as http:
        await search_company("ENEDIS", http_client=http)
        transport.payload = {"resultats": [_hit("DALKIA", "456500537")]}
        other = await search_company("DALKIA", http_client=http)

    assert transport.calls == 2
    assert other.siren == "456500537"


@pytest.mark.asyncio
async def test_search_company_different_filters_are_not_shared(cache: FakeCache) -> None:
    transport = CountingTransport({"resultats": [_hit("ATOS SE", "323623603")]})
    async with _client(transport) as http:
        await search_company("Atos", filters=CompanySearchParams(naf_code="62.02A"), http_client=http)
        await search_company("Atos", filters=CompanySearchParams(naf_code="70.10Z"), http_client=http)

    assert transport.calls == 2


@pytest.mark.asyncio
async def test_search_company_failure_is_never_cached(cache: FakeCache) -> None:
    """Un 401 « plus de crédits » ne doit pas empoisonner le cache : sinon la
    panne survivrait au rechargement du quota."""
    transport = CountingTransport({"error": "quota"}, status=401)
    async with _client(transport) as http:
        # Typé : Pappers répond 401 pour un quota épuisé comme pour un jeton
        # invalide, et les deux se réparent à l'opposé. Le corps tranche.
        with pytest.raises(PappersUnavailableError) as excinfo:
            await search_company("ENEDIS", http_client=http)
    assert excinfo.value.reason == DegradeReason.QUOTA_EXCEEDED

    assert cache.store == {}


@pytest.mark.asyncio
async def test_search_company_empty_result_is_never_cached(cache: FakeCache) -> None:
    transport = CountingTransport({"resultats": []})
    async with _client(transport) as http:
        # « Pas au registre » n'est PAS une panne de source : erreur distincte,
        # pour qu'aucun écran d'état ne compte une PME absente comme un incident.
        with pytest.raises(PappersNoResultError):
            await search_company("Inconnue SARL", http_client=http)

    assert cache.store == {}


@pytest.mark.asyncio
async def test_cached_hit_still_applies_the_similarity_gate(cache: FakeCache) -> None:
    """Le cache stocke la réponse BRUTE de Pappers ; le garde d'ambiguïté est
    rejoué à l'identique sur un hit — un cache ne change pas un verdict."""
    transport = CountingTransport({"resultats": [_hit("GARAGE DU CANNET SCI", "999999999")]})
    async with _client(transport) as http:
        with pytest.raises(PappersAmbiguousMatchError):
            await search_company("Carrefour", http_client=http)
        # Le hit brut est mis en cache (l'appel a réussi) ; le verdict, lui,
        # se rejoue et reste identique.
        with pytest.raises(PappersAmbiguousMatchError):
            await search_company("Carrefour", http_client=http)

    assert transport.calls == 1


# ── 3. search_company_suggestions (autocomplete) ─────────────────────────────


@pytest.mark.asyncio
async def test_suggestions_are_cached_across_calls(cache: FakeCache) -> None:
    transport = CountingTransport({"resultats": [_hit(), _hit("ACME HOLDING", "987654321")]})
    async with _client(transport) as http:
        first = await search_company_suggestions("acme", limit=5, http_client=http)
        second = await search_company_suggestions("acme", limit=5, http_client=http)

    assert transport.calls == 1
    assert [h.siren for h in first] == [h.siren for h in second] == ["123456789", "987654321"]


@pytest.mark.asyncio
async def test_suggestions_limit_is_part_of_the_key(cache: FakeCache) -> None:
    """``limit`` devient ``par_page`` : deux limites = deux jeux de résultats."""
    transport = CountingTransport({"resultats": [_hit()]})
    async with _client(transport) as http:
        await search_company_suggestions("acme", limit=5, http_client=http)
        await search_company_suggestions("acme", limit=20, http_client=http)

    assert transport.calls == 2


@pytest.mark.asyncio
async def test_suggestions_soft_fail_is_not_cached(cache: FakeCache) -> None:
    """L'autocomplete dégrade en ``[]`` — mais un ``[]`` d'erreur ne doit pas
    figer un dropdown vide pendant toute la durée du TTL."""
    transport = CountingTransport({"error": "quota"}, status=401)
    async with _client(transport) as http:
        assert await search_company_suggestions("acme", http_client=http) == []

    assert cache.store == {}


@pytest.mark.asyncio
async def test_autocomplete_session_costs_one_call_per_distinct_prefix(cache: FakeCache) -> None:
    """Une frappe « ene / ened / enedis » puis une reprise identique : 3 appels
    payants pour la session, 0 pour la seconde — c'est tout l'enjeu."""
    transport = CountingTransport({"resultats": [_hit("ENEDIS", "444608442")]})
    prefixes = ["ene", "ened", "enedis"]
    async with _client(transport) as http:
        for p in prefixes:
            await search_company_suggestions(p, limit=5, http_client=http)
        for p in prefixes:
            await search_company_suggestions(p, limit=5, http_client=http)

    assert transport.calls == 3


# ── 4. Compteur d'appels ─────────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_budget_counts_each_billable_search(cache: FakeCache) -> None:
    transport = CountingTransport({"resultats": [_hit()]})
    async with _client(transport) as http:
        await search_company_suggestions("acme", http_client=http)
        await search_company_suggestions("other", http_client=http)

    snap = budget.snapshot()
    assert snap["total"] == 2
    assert snap["by_endpoint"]["recherche"] == 2


@pytest.mark.asyncio
async def test_budget_does_not_count_a_cache_hit(cache: FakeCache) -> None:
    """Un hit de cache n'est pas un appel : le compteur mesure ce qui est FACTURÉ."""
    transport = CountingTransport({"resultats": [_hit()]})
    async with _client(transport) as http:
        await search_company_suggestions("acme", http_client=http)
        await search_company_suggestions("acme", http_client=http)

    assert budget.snapshot()["total"] == 1
    assert budget.snapshot()["saved"] == 1


@pytest.mark.asyncio
async def test_budget_counts_a_failed_call_and_flags_it(cache: FakeCache) -> None:
    """Un 401 part quand même sur le réseau : le taux d'échec est précisément le
    signal « quota épuisé » qu'on veut voir dans les logs."""
    transport = CountingTransport({"error": "quota"}, status=401)
    async with _client(transport) as http:
        await search_company_suggestions("acme", http_client=http)

    snap = budget.snapshot()
    assert snap["total"] == 1
    assert snap["errors"] == 1


def test_budget_is_scoped_per_run() -> None:
    budget.record("entreprise", correlation_id="run-a")
    budget.record("entreprise", correlation_id="run-a")
    budget.record("recherche", correlation_id="run-b")

    assert budget.run_calls("run-a") == 2
    assert budget.run_calls("run-b") == 1
    assert budget.run_calls("run-inconnu") == 0
    assert budget.snapshot()["total"] == 3


def test_budget_run_summary_names_the_endpoints() -> None:
    budget.record("entreprise", correlation_id="run-a")
    budget.record("cartographie", correlation_id="run-a")
    budget.record("recherche", correlation_id="run-a", ok=False)

    line = budget.summarise_run("run-a")
    assert "3 appel" in line
    assert "entreprise" in line and "cartographie" in line and "recherche" in line
    assert "1 échec" in line


def test_budget_never_hard_limits(monkeypatch: pytest.MonkeyPatch) -> None:
    """C'est un instrument de mesure, pas un bridage : dépasser le seuil
    journalise un avertissement et laisse l'appel passer."""
    monkeypatch.setenv("PAPPERS_RUN_CALL_WARN", "2")
    for _ in range(5):
        budget.record("entreprise", correlation_id="run-x")

    assert budget.run_calls("run-x") == 5


# ── 5. Ordre gratuit → payant ────────────────────────────────────────────────


def test_free_registry_covers_a_query_it_can_express() -> None:
    """NAF × département × tranche d'effectifs : le registre gratuit répond
    nativement, Pappers n'apporte rien de plus — on ne le paie pas."""
    from app.services.data_sources.recherche_entreprises import covers_filters

    assert covers_filters(
        CompanyDiscoveryFilters(naf_code="62.02A", department="69", headcount_tranche_min="32")
    )


def test_free_registry_does_not_cover_capital_purpose_or_publications() -> None:
    """Capital, objet social, publications : toujours absents du registre gratuit.

    ⚠️ Re-MESURÉ le 04/09/2026, pas recopié. Sur la base NAF 30.30Z (745), avec
    ``parametre_bidon=42`` comme témoin (745 → 745, ignoré en silence) :
    ``capital_min`` et ``objet_social`` laissent le total à 745. Ils ne filtrent
    donc rien, et prétendre y répondre rendrait un résultat plus large que
    demandé.
    """
    from app.services.data_sources.recherche_entreprises import covers_filters

    assert not covers_filters(CompanyDiscoveryFilters(capital_min=50_000))
    assert not covers_filters(CompanyDiscoveryFilters(corporate_purpose="conseil informatique"))
    assert not covers_filters(CompanyDiscoveryFilters(publication_type="Création"))


def test_free_registry_NOW_covers_revenue_and_legal_category() -> None:
    """Le CA et la catégorie juridique ont CHANGÉ de camp.

    Ce module affirmait que « le payload gouv.fr n'a simplement pas ces champs ».
    C'était vrai quand la phrase a été écrite ; ça ne l'est plus. Mesuré le
    04/09/2026, même base, même témoin :

        ca_min=50000000        → 38    (745 avant)
        ca_max=10000000        → 133
        nature_juridique=5710  → 400

    L'enjeu n'est pas cosmétique : les garder « non couverts » envoyait chez
    Pappers, facturé à l'appel, des recherches que la source gratuite sait faire.
    """
    from app.services.data_sources.recherche_entreprises import covers_filters

    assert covers_filters(CompanyDiscoveryFilters(naf_code="62.02A", revenue_min=10_000_000))
    assert covers_filters(CompanyDiscoveryFilters(naf_code="62.02A", revenue_max=50_000_000))
    assert covers_filters(CompanyDiscoveryFilters(legal_category="5710"))
    assert covers_filters(CompanyDiscoveryFilters(company_category=["ETI"]))


def test_free_registry_does_not_cover_headquarters_only() -> None:
    """``siege=true`` n'a pas d'équivalent poussé côté gouv.fr."""
    from app.services.data_sources.recherche_entreprises import covers_filters

    assert not covers_filters(CompanyDiscoveryFilters(naf_code="62.02A", on_headquarters_only=True))


def test_free_registry_does_not_cover_an_empty_query() -> None:
    """Sans critère il n'y a rien à router : on ne « préfère » pas le gratuit
    pour renvoyer une liste arbitraire."""
    from app.services.data_sources.recherche_entreprises import covers_filters

    assert not covers_filters(CompanyDiscoveryFilters())


# ── 6. Découvrir : la liste par critères est cachée elle aussi ───────────────


@pytest.mark.asyncio
async def test_discovery_list_is_cached(cache: FakeCache) -> None:
    """« NAF 62.02 × dept 69 » rend les mêmes sociétés toute la journée. La
    pagination et les allers-retours de l'écran ne doivent pas la re-payer."""
    from app.services.pappers.discovery import search_companies_filtered

    payload = {"resultats": [{"nom_entreprise": "CAPGEMINI", "siren": "330703844"}]}
    transport = CountingTransport(payload)
    filters = CompanyDiscoveryFilters(naf_code="62.02A", department="69")
    async with _client(transport) as http:
        first = await search_companies_filtered(filters, 25, http_client=http)
        second = await search_companies_filtered(filters, 25, http_client=http)

    assert transport.calls == 1
    assert first == second
    assert first[0]["siren"] == "330703844"


@pytest.mark.asyncio
async def test_discovery_different_criteria_are_not_shared(cache: FakeCache) -> None:
    from app.services.pappers.discovery import search_companies_filtered

    transport = CountingTransport({"resultats": [{"nom_entreprise": "X", "siren": "111111111"}]})
    async with _client(transport) as http:
        await search_companies_filtered(CompanyDiscoveryFilters(naf_code="62.02A"), 25, http_client=http)
        await search_companies_filtered(CompanyDiscoveryFilters(naf_code="70.10Z"), 25, http_client=http)
        await search_companies_filtered(
            CompanyDiscoveryFilters(naf_code="62.02A", department="69"), 25, http_client=http
        )

    assert transport.calls == 3


@pytest.mark.asyncio
async def test_discovery_degradation_is_not_cached(cache: FakeCache) -> None:
    """Un 401 « quota » dégrade, et rien n'est mémorisé : le rechargement du
    quota doit reprendre effet immédiatement."""
    from app.services.pappers.discovery import search_companies_filtered

    transport = CountingTransport({"error": "quota"}, status=401)
    degraded: list[dict] = []
    async with _client(transport) as http:
        rows = await search_companies_filtered(
            CompanyDiscoveryFilters(naf_code="62.02A"), 25, degraded=degraded, http_client=http
        )

    assert rows == []
    assert degraded and degraded[0]["source"] == "pappers"
    assert cache.store == {}


# ── 7. Analyse : jamais deux fois le même SIREN dans un run ─────────────────


@pytest.mark.asyncio
async def test_research_does_not_retry_the_siren_that_just_failed(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Le scope lock échoue sur le SIREN ancré, la recherche par nom retombe sur
    LE MÊME SIREN : re-demander la même fiche ne peut pas donner un autre
    résultat, ça ne dépense qu'un second crédit sur le même échec."""
    from app.services.research import pappers as research_pappers_mod

    seen: list[str] = []

    async def _get_company(siren: str, **_kw):
        seen.append(siren)
        raise ValueError("Pappers API returned status 401")

    class _Hit:
        siren = "552081317"

    async def _search_company(_name: str, **_kw):
        return _Hit()

    monkeypatch.setattr(research_pappers_mod, "get_company", _get_company)
    monkeypatch.setattr(research_pappers_mod, "search_company", _search_company)

    result = await research_pappers_mod.research_pappers("EDF", siren="552081317")

    assert result is None
    assert seen == ["552081317"], "un seul appel /v2/entreprise pour ce SIREN"


@pytest.mark.asyncio
async def test_research_still_tries_a_different_siren_after_a_failure(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Le garde-fou ne doit PAS empêcher une vraie seconde chance : si la
    recherche par nom trouve une AUTRE entité, on la tente."""
    from app.services.research import pappers as research_pappers_mod

    seen: list[str] = []

    async def _get_company(siren: str, **_kw):
        seen.append(siren)
        if siren == "999999999":
            raise ValueError("Pappers API returned status 404")
        return {"siren": siren}

    class _Hit:
        siren = "552081317"

    async def _search_company(_name: str, **_kw):
        return _Hit()

    monkeypatch.setattr(research_pappers_mod, "get_company", _get_company)
    monkeypatch.setattr(research_pappers_mod, "search_company", _search_company)

    result = await research_pappers_mod.research_pappers("EDF", siren="999999999")

    assert result == {"siren": "552081317"}
    assert seen == ["999999999", "552081317"]
